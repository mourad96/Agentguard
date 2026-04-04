"""
AgentGuard — Runtime Verification Middleware for AI Agents.

A framework-agnostic, non-intrusive monitoring and formal verification
layer that sits on top of any agent framework to provide probabilistic
safety guarantees.
"""

from agentguard.logger import AgentGuardLogger
from agentguard.analyzer import AnalyzerThread
from agentguard.actuator import Actuator

__all__ = ["AgentGuardLogger", "AnalyzerThread", "Actuator"]
__version__ = "0.1.0"
