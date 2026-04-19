import { PubSub, Topic } from "@google-cloud/pubsub";
import winston from "winston";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

interface PubSubMessage {
  orgId: string;
  data: Record<string, unknown>;
}

interface BufferedMessage {
  topicName: string;
  data: Buffer;
  attributes: Record<string, string>;
  resolve: (messageId: string) => void;
  reject: (error: Error) => void;
}

/**
 * Google Cloud Pub/Sub client wrapper with batch publishing.
 * Buffer up to 100 messages or 10ms, whichever comes first.
 */
export class PubSubService {
  private client: PubSub;
  private topicCache: Map<string, Topic>;
  private buffer: Map<string, BufferedMessage[]>;
  private flushTimers: Map<string, ReturnType<typeof setTimeout>>;
  private readonly maxBatchSize = 100;
  private readonly maxBatchDelayMs = 10;
  private deadLetterTopic: Topic | null = null;

  constructor() {
    this.client = new PubSub({
      projectId: process.env["GOOGLE_CLOUD_PROJECT"] ?? "nexus-platform",
    });
    this.topicCache = new Map();
    this.buffer = new Map();
    this.flushTimers = new Map();
  }

  /**
   * Get or create the topic for a given org.
   * Topic naming: nexus-decisions-{orgId}
   */
  private async getOrCreateTopic(orgId: string): Promise<Topic> {
    const topicName = `nexus-decisions-${orgId}`;
    const cached = this.topicCache.get(topicName);
    if (cached) return cached;

    const topic = this.client.topic(topicName);
    const [exists] = await topic.exists();
    if (!exists) {
      await topic.create();
      logger.info("Created Pub/Sub topic", { topicName });
    }

    this.topicCache.set(topicName, topic);
    return topic;
  }

  /**
   * Get topic by full name (for non-org-specific topics).
   */
  private async getTopicByName(topicName: string): Promise<Topic> {
    const cached = this.topicCache.get(topicName);
    if (cached) return cached;

    const topic = this.client.topic(topicName);
    const [exists] = await topic.exists();
    if (!exists) {
      await topic.create();
      logger.info("Created Pub/Sub topic", { topicName });
    }

    this.topicCache.set(topicName, topic);
    return topic;
  }

  /**
   * Publish a decision event to the org's topic.
   * Uses batch buffering: up to 100 messages or 10ms delay.
   */
  async publishDecisionEvent(message: PubSubMessage): Promise<string> {
    const topicName = `nexus-decisions-${message.orgId}`;
    return this.enqueueMessage(topicName, message.data, {
      orgId: message.orgId,
      type: "decision_event",
    });
  }

  /**
   * Publish an intercept log entry (fire-and-forget).
   */
  publishInterceptLog(orgId: string, data: Record<string, unknown>): void {
    const topicName = "nexus-intercept-log";
    this.enqueueMessage(topicName, data, {
      orgId,
      type: "intercept_log",
    }).catch((error) => {
      logger.error("Failed to publish intercept log", { orgId, error: String(error) });
      this.handleDeadLetter(topicName, data, error as Error);
    });
  }

  /**
   * Publish an alert event.
   */
  async publishAlert(orgId: string, data: Record<string, unknown>): Promise<string> {
    const topicName = `nexus-alerts-${orgId}`;
    return this.enqueueMessage(topicName, data, {
      orgId,
      type: "alert",
    });
  }

  /**
   * Enqueue a message for batch publishing.
   */
  private enqueueMessage(
    topicName: string,
    data: Record<string, unknown>,
    attributes: Record<string, string>
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const msg: BufferedMessage = {
        topicName,
        data: Buffer.from(JSON.stringify(data)),
        attributes,
        resolve,
        reject,
      };

      const existing = this.buffer.get(topicName) ?? [];
      existing.push(msg);
      this.buffer.set(topicName, existing);

      // Flush if batch size reached
      if (existing.length >= this.maxBatchSize) {
        this.flushTopic(topicName);
        return;
      }

      // Set timer for delayed flush (10ms)
      if (!this.flushTimers.has(topicName)) {
        const timer = setTimeout(() => {
          this.flushTopic(topicName);
        }, this.maxBatchDelayMs);
        this.flushTimers.set(topicName, timer);
      }
    });
  }

  /**
   * Flush all buffered messages for a topic.
   */
  private async flushTopic(topicName: string): Promise<void> {
    // Clear the timer
    const timer = this.flushTimers.get(topicName);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(topicName);
    }

    const messages = this.buffer.get(topicName);
    if (!messages || messages.length === 0) return;

    // Clear the buffer
    this.buffer.delete(topicName);

    try {
      const topic = await this.getTopicByName(topicName);

      // Publish all messages
      const publishPromises = messages.map(async (msg) => {
        try {
          const messageId = await topic.publishMessage({
            data: msg.data,
            attributes: msg.attributes,
          });
          msg.resolve(messageId);
          return messageId;
        } catch (error) {
          msg.reject(error as Error);
          this.handleDeadLetter(topicName, JSON.parse(msg.data.toString()), error as Error);
          return null;
        }
      });

      const results = await Promise.allSettled(publishPromises);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      logger.info("Batch flush completed", { topicName, total: messages.length, succeeded, failed });
    } catch (error) {
      logger.error("Batch flush failed entirely", { topicName, error: String(error) });
      for (const msg of messages) {
        msg.reject(error as Error);
      }
    }
  }

  /**
   * Handle failed publishes by sending to dead-letter queue.
   */
  private async handleDeadLetter(
    originalTopic: string,
    data: Record<string, unknown>,
    error: Error
  ): Promise<void> {
    try {
      if (!this.deadLetterTopic) {
        this.deadLetterTopic = await this.getTopicByName("nexus-dead-letters");
      }

      await this.deadLetterTopic.publishMessage({
        data: Buffer.from(
          JSON.stringify({
            original_topic: originalTopic,
            original_data: data,
            error_message: error.message,
            failed_at: new Date().toISOString(),
          })
        ),
        attributes: {
          original_topic: originalTopic,
          error_type: error.constructor.name,
        },
      });

      logger.warn("Sent message to dead-letter queue", {
        originalTopic,
        error: error.message,
      });
    } catch (dlqError) {
      logger.error("Failed to send to dead-letter queue", {
        originalTopic,
        originalError: error.message,
        dlqError: String(dlqError),
      });
    }
  }

  /**
   * Graceful shutdown: flush all pending messages.
   */
  async shutdown(): Promise<void> {
    const topics = Array.from(this.buffer.keys());
    for (const topic of topics) {
      await this.flushTopic(topic);
    }
    await this.client.close();
    logger.info("PubSub service shut down gracefully");
  }
}
