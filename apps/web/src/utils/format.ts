/** NEXUS formatting utilities — used across all pages for consistency */

export function formatDI(value: number): string {
  return value.toFixed(4) + " DI";
}

export function formatPct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

export function formatMs(value: number): string {
  return value.toFixed(0) + "ms";
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

export function formatRelTime(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function truncHash(hash: string, front = 16, back = 16): string {
  if (!hash || hash.length <= front + back + 3) return hash || "—";
  return hash.slice(0, front) + "..." + hash.slice(-back);
}

export function truncId(id: string, front = 8, back = 8): string {
  if (!id || id.length <= front + back + 3) return id || "—";
  return id.slice(0, front) + "..." + id.slice(-back);
}
