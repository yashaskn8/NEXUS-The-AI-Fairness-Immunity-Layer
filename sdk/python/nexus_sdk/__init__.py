"""
NEXUS Python SDK — Drop-in AI fairness integration.
Two lines of code to make any AI model fair.
"""
from nexus_sdk.client import NexusClient
from nexus_sdk.decorators import intercept_decision, monitor_decision

__all__ = ["NexusClient", "intercept_decision", "monitor_decision"]
__version__ = "1.0.0"
