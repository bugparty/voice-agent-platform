"""VAD state machine with hysteresis to prevent jitter."""

import time
from enum import Enum
from typing import Optional, Callable


class VadState(Enum):
    """VAD state enumeration."""
    SILENT = "SILENT"
    SPEAKING = "SPEAKING"


class VadStateMachine:
    """State machine for VAD with hysteresis thresholds."""
    
    def __init__(
        self,
        start_threshold: float = 0.5,  # Lowered from 0.6 to be more sensitive
        end_threshold: float = 0.15,   # Lowered from 0.3 to be more sensitive
        min_speech_ms: int = 200,
        min_silence_ms: int = 300,
        frame_duration_ms: int = 32
    ):
        """Initialize VAD state machine.
        
        Args:
            start_threshold: Probability threshold to start speaking (0.0-1.0)
            end_threshold: Probability threshold to end speaking (0.0-1.0)
            min_speech_ms: Minimum duration in ms to confirm speech start
            min_silence_ms: Minimum duration in ms to confirm speech end
            frame_duration_ms: Duration of each audio frame in ms
        """
        self.start_threshold = start_threshold
        self.end_threshold = end_threshold
        self.min_speech_frames = max(1, int(min_speech_ms / frame_duration_ms))
        self.min_silence_frames = max(1, int(min_silence_ms / frame_duration_ms))
        self.frame_duration_ms = frame_duration_ms
        
        self.state = VadState.SILENT
        self.high_prob_count = 0  # Frames with prob > start_threshold
        self.low_prob_count = 0    # Frames with prob < end_threshold
        self.last_prob = 0.0
        self.last_timestamp_ms = 0
    
    def process(self, prob: float, timestamp_ms: int) -> Optional[str]:
        """Process a VAD probability and return event if state changed.
        
        Args:
            prob: Speech probability (0.0-1.0)
            timestamp_ms: Timestamp in milliseconds
        
        Returns:
            Event name ("SPEECH_START", "SPEECH_UPDATE", "SPEECH_END") or None
        """
        self.last_prob = prob
        self.last_timestamp_ms = timestamp_ms
        
        if self.state == VadState.SILENT:
            # Check if we should transition to SPEAKING
            if prob >= self.start_threshold:
                self.high_prob_count += 1
                self.low_prob_count = 0  # Reset silence counter
                
                # Debug: log when approaching threshold
                if self.high_prob_count == 1:
                    print(f"[state_machine] SILENT→SPEAKING: prob={prob:.3f} >= {self.start_threshold}, count={self.high_prob_count}/{self.min_speech_frames}")
                
                if self.high_prob_count >= self.min_speech_frames:
                    # Confirmed speech start
                    self.state = VadState.SPEAKING
                    self.high_prob_count = 0
                    print(f"[state_machine] State changed: SILENT → SPEAKING (prob={prob:.3f})")
                    return "SPEECH_START"
            else:
                # Reset counters
                if self.high_prob_count > 0:
                    # Was accumulating but dropped below threshold
                    self.high_prob_count = 0
                self.low_prob_count = 0
                return None
        
        else:  # SPEAKING
            # Check if we should transition to SILENT
            if prob < self.end_threshold:
                self.low_prob_count += 1
                self.high_prob_count = 0  # Reset speech counter
                
                if self.low_prob_count >= self.min_silence_frames:
                    # Confirmed speech end
                    self.state = VadState.SILENT
                    self.low_prob_count = 0
                    return "SPEECH_END"
            else:
                # Still speaking
                self.low_prob_count = 0
                self.high_prob_count += 1
                # Emit update every few frames to keep UI responsive
                if self.high_prob_count % 5 == 0:
                    return "SPEECH_UPDATE"
                return None
    
    def reset(self):
        """Reset state machine to initial state."""
        was_speaking = self.state == VadState.SPEAKING
        self.state = VadState.SILENT
        self.high_prob_count = 0
        self.low_prob_count = 0
        self.last_prob = 0.0
        self.last_timestamp_ms = 0
        return was_speaking
    
    def get_state(self) -> VadState:
        """Get current state."""
        return self.state
    
    def get_last_prob(self) -> float:
        """Get last processed probability."""
        return self.last_prob
