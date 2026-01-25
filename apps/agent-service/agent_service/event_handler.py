"""Event handler for processing media-service events."""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class EventHandler:
    """Handles incoming events from media-service."""
    
    def __init__(self):
        """Initialize the event handler."""
        self.event_count = {
            "vad": 0,
            "asr": 0,
            "call": 0,
            "other": 0
        }
        
    def handle_event(self, event) -> None:
        """
        Process an incoming SessionEvent.
        
        Args:
            event: SessionEvent proto message
        """
        try:
            session_id = event.session_id
            event_type = event.event_type
            timestamp = event.timestamp_ms
            
            # Route to appropriate handler based on event type
            if event_type.startswith("vad."):
                self._handle_vad_event(session_id, event_type, event.vad, timestamp)
            elif event_type.startswith("asr."):
                self._handle_asr_event(session_id, event_type, event.asr, timestamp)
            elif event_type.startswith("call."):
                self._handle_call_event(session_id, event_type, event.call, timestamp)
            else:
                self._handle_other_event(session_id, event_type, timestamp)
                
        except Exception as e:
            logger.error(f"Error handling event: {e}", exc_info=True)
    
    def _handle_vad_event(
        self, 
        session_id: str, 
        event_type: str, 
        vad_data, 
        timestamp: int
    ) -> None:
        """Handle VAD (Voice Activity Detection) event."""
        self.event_count["vad"] += 1
        
        action = vad_data.action
        prob = vad_data.prob
        track = vad_data.track
        music_prob = vad_data.music_prob
        
        # Log only significant events (start/end) or high music probability
        if action in ["start", "end"] or music_prob > 0.3:
            logger.info(
                f"VAD [{session_id}] {event_type}: action={action}, "
                f"prob={prob:.2f}, track={track}, music={music_prob:.2f}"
            )
        
        # TODO: Implement VAD event processing logic
        # For example:
        # - Track conversation state
        # - Detect when user starts/stops speaking
        # - Trigger actions based on speech patterns
        
    def _handle_asr_event(
        self, 
        session_id: str, 
        event_type: str, 
        asr_data, 
        timestamp: int
    ) -> None:
        """Handle ASR (Automatic Speech Recognition) event."""
        self.event_count["asr"] += 1
        
        text = asr_data.text
        confidence = asr_data.confidence
        is_final = asr_data.is_final
        
        # Log final transcriptions
        if is_final:
            logger.info(
                f"ASR [{session_id}] FINAL: \"{text}\" "
                f"(confidence: {confidence:.2f})"
            )
        else:
            logger.debug(
                f"ASR [{session_id}] partial: \"{text}\" "
                f"(confidence: {confidence:.2f})"
            )
        
        # TODO: Implement ASR event processing logic
        # For example:
        # - Build conversation history
        # - Detect intents and entities
        # - Generate suggestions based on transcribed text
        # - Send LLM prompts for agent responses
        
    def _handle_call_event(
        self, 
        session_id: str, 
        event_type: str, 
        call_data, 
        timestamp: int
    ) -> None:
        """Handle call lifecycle event."""
        self.event_count["call"] += 1
        
        status = call_data.status
        call_sid = call_data.call_sid
        
        logger.info(
            f"CALL [{session_id}] {event_type}: status={status}, "
            f"call_sid={call_sid}"
        )
        
        # TODO: Implement call event processing logic
        # For example:
        # - Initialize session state on call start
        # - Clean up resources on call end
        # - Track call duration and metrics
        
    def _handle_other_event(
        self, 
        session_id: str, 
        event_type: str, 
        timestamp: int
    ) -> None:
        """Handle other/unknown events."""
        self.event_count["other"] += 1
        
        logger.debug(f"OTHER [{session_id}] {event_type}")
        
    def get_statistics(self) -> Dict[str, Any]:
        """Get event processing statistics."""
        total = sum(self.event_count.values())
        return {
            "total_events": total,
            "by_type": self.event_count.copy()
        }
