"""Event handler for processing media-service events."""

import asyncio
import logging
import threading
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from agent_service.agent import CallFSM

logger = logging.getLogger(__name__)


class EventHandler:
    """Handles incoming events from media-service."""

    # Class-level shared event loop for all EventHandler instances
    _shared_loop: Optional[asyncio.AbstractEventLoop] = None
    _loop_thread: Optional[threading.Thread] = None
    _loop_lock = threading.Lock()

    def __init__(self, log_service=None, call_fsm: Optional["CallFSM"] = None):
        """Initialize the event handler."""
        self.event_count = {
            "vad": 0,
            "asr": 0,
            "call": 0,
            "other": 0
        }
        self.log_service = log_service
        self.call_fsm = call_fsm
        
        # Ensure background event loop is started
        self._ensure_loop_running()

    def set_call_fsm(self, call_fsm: "CallFSM") -> None:
        """Set the CallFSM instance for event routing."""
        self.call_fsm = call_fsm

    @classmethod
    def _ensure_loop_running(cls) -> None:
        """
        Ensure the shared background event loop is running.
        
        This creates a dedicated thread for async operations, preventing
        blocking of the main event processing thread.
        """
        with cls._loop_lock:
            if cls._shared_loop is not None and not cls._shared_loop.is_closed():
                return
            
            # Create new event loop
            cls._shared_loop = asyncio.new_event_loop()
            
            def run_loop():
                asyncio.set_event_loop(cls._shared_loop)
                logger.debug("[EventHandler] Background event loop started")
                cls._shared_loop.run_forever()
                logger.debug("[EventHandler] Background event loop stopped")
            
            cls._loop_thread = threading.Thread(
                target=run_loop,
                name="EventHandler-AsyncLoop",
                daemon=True
            )
            cls._loop_thread.start()
            logger.info("[EventHandler] Started background event loop thread")

    @classmethod
    def _get_loop(cls) -> asyncio.AbstractEventLoop:
        """
        Get the shared background event loop.
        
        Returns:
            The shared asyncio event loop running in a background thread.
        """
        cls._ensure_loop_running()
        return cls._shared_loop

    def _schedule_async(self, coro) -> None:
        """
        Schedule a coroutine to run in the background event loop.
        
        This is non-blocking - the coroutine runs asynchronously in the
        background thread, allowing event processing to continue immediately.
        
        Args:
            coro: The coroutine to schedule.
        """
        loop = self._get_loop()
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        
        # Add error callback to log exceptions
        def on_done(fut):
            try:
                fut.result()
            except Exception as e:
                logger.error(f"[EventHandler] Async task failed: {e}", exc_info=True)
        
        future.add_done_callback(on_done)

    @classmethod
    def shutdown(cls) -> None:
        """
        Shutdown the background event loop.
        
        Call this during application shutdown to cleanly stop the loop.
        """
        with cls._loop_lock:
            if cls._shared_loop is not None and cls._shared_loop.is_running():
                cls._shared_loop.call_soon_threadsafe(cls._shared_loop.stop)
                if cls._loop_thread is not None:
                    cls._loop_thread.join(timeout=2.0)
                logger.info("[EventHandler] Background event loop shutdown complete")
        
    def handle_event(self, event) -> None:
        """
        Process an incoming SessionEvent.
        
        Args:
            event: SessionEvent proto message
        """
        try:
            if self.log_service is not None:
                try:
                    self.log_service.record_event(event)
                except Exception as exc:
                    logger.warning(f"Failed to log event: {exc}")

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
        
        # Route to CallFSM if available (non-blocking)
        if self.call_fsm is not None:
            try:
                coro = self.call_fsm.handle_vad_event(
                    session_id=session_id,
                    action=action,
                    prob=prob,
                    track=track,
                    music_prob=music_prob,
                    timestamp_ms=timestamp
                )
                self._schedule_async(coro)
            except Exception as e:
                logger.error(f"Failed to route VAD event to CallFSM: {e}", exc_info=True)
        
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
        
        # Determine track from event_type (e.g., "asr.remote.final" -> "remote")
        track = "remote"
        parts = event_type.split(".")
        if len(parts) >= 2:
            track = parts[1]
        
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
        
        # Route to CallFSM if available (non-blocking)
        if self.call_fsm is not None:
            try:
                coro = self.call_fsm.handle_asr_event(
                    session_id=session_id,
                    text=text,
                    is_final=is_final,
                    confidence=confidence,
                    timestamp_ms=timestamp,
                    track=track
                )
                self._schedule_async(coro)
            except Exception as e:
                logger.error(f"Failed to route ASR event to CallFSM: {e}", exc_info=True)
        
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
        
        # Route to CallFSM if available (non-blocking)
        if self.call_fsm is not None:
            try:
                coro = self.call_fsm.handle_call_event(
                    session_id=session_id,
                    status=status,
                    call_sid=call_sid,
                    timestamp_ms=timestamp
                )
                self._schedule_async(coro)
            except Exception as e:
                logger.error(f"Failed to route call event to CallFSM: {e}", exc_info=True)
        
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
