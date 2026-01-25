"""IVR Navigation Agent.

Tracks IVR state and makes decisions using LLM.
"""

import logging
import uuid
from typing import Dict, List, Any, Optional
from .llm_client import LLMClient

logger = logging.getLogger(__name__)


class IVRAgent:
    """Agent that navigates IVR systems using LLM."""
    
    def __init__(self, llm_client: LLMClient, goal: str = "Connect to a human representative"):
        """
        Initialize IVR agent.
        
        Args:
            llm_client: LLM client for making decisions
            goal: Navigation goal
        """
        self.llm_client = llm_client
        self.goal = goal
        self.navigation_history: List[Dict[str, Any]] = []
        self.pending_transcript: str = ""
        self.last_decision_id: Optional[str] = None
        
        logger.info(f"Initialized IVR Agent with goal: {goal}")
    
    def on_transcript(self, text: str, is_final: bool, confidence: float) -> Optional[Dict[str, Any]]:
        """
        Handle incoming ASR transcript.
        
        Args:
            text: Transcript text
            is_final: Whether this is a final transcript
            confidence: Confidence score
            
        Returns:
            Decision dict if ready to make a decision, None otherwise
        """
        # Accumulate partial transcripts
        if not is_final:
            self.pending_transcript = text
            logger.debug(f"Accumulating partial transcript: {text[:50]}...")
            return None
        
        # Final transcript received - make a decision
        full_transcript = text
        logger.info(f"Final transcript received: {full_transcript}")
        
        # Skip if transcript is too short or empty
        if len(full_transcript.strip()) < 10:
            logger.info("Transcript too short, waiting for more...")
            return None
        
        # Make decision using LLM
        try:
            decision = self.llm_client.decide_option(
                transcript=full_transcript,
                navigation_history=self.navigation_history,
                goal=self.goal
            )
            
            # Generate unique suggestion ID
            suggestion_id = str(uuid.uuid4())[:8]
            
            # Record this decision in history
            self.navigation_history.append({
                "transcript": full_transcript,
                "digit": decision["digit"],
                "reasoning": decision["reasoning"],
                "confidence": decision["confidence"],
                "suggestion_id": suggestion_id
            })
            
            self.last_decision_id = suggestion_id
            self.pending_transcript = ""
            
            # Return decision in format ready for AgentSuggestion
            return {
                "suggestion_id": suggestion_id,
                "digit": decision["digit"],
                "reasoning": decision["reasoning"],
                "confidence": decision["confidence"],
                "plan": f"Press {decision['digit']}: {decision['reasoning']}"
            }
            
        except Exception as e:
            logger.error(f"Failed to make decision: {e}", exc_info=True)
            return None
    
    def reset(self):
        """Reset agent state for a new call."""
        logger.info("Resetting IVR agent state")
        self.navigation_history.clear()
        self.pending_transcript = ""
        self.last_decision_id = None
    
    def get_history_summary(self) -> str:
        """Get a summary of navigation history."""
        if not self.navigation_history:
            return "No navigation history"
        
        summary_lines = []
        for i, step in enumerate(self.navigation_history, 1):
            summary_lines.append(
                f"{i}. Pressed {step['digit']} - {step['reasoning']} "
                f"(confidence: {step['confidence']})"
            )
        
        return "\n".join(summary_lines)

