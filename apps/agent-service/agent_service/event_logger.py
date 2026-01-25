"""Event logging service for mock replay."""

import base64
import json
import logging
import os
import socket
import threading
import time
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class EventLogService:
    """Persist incoming events with replayable detail."""

    def __init__(self, log_dir: str, run_id: Optional[str] = None) -> None:
        self.log_dir = log_dir
        os.makedirs(self.log_dir, exist_ok=True)

        self.run_id = run_id or self._generate_run_id()
        self._seq = 0
        self._lock = threading.Lock()
        self._started_at_ms = self._now_ms()

        self._events_path = os.path.join(self.log_dir, f"events_{self.run_id}.jsonl")
        self._meta_path = os.path.join(self.log_dir, f"run_{self.run_id}.json")
        self._write_run_metadata()

    def record_event(self, event: Any) -> None:
        """Record a SessionEvent in JSONL with replay detail."""
        payload = self._extract_payload(event)
        record = {
            "run_id": self.run_id,
            "seq": self._next_seq(),
            "received_at_ms": self._now_ms(),
            "session_id": event.session_id,
            "timestamp_ms": int(event.timestamp_ms),
            "event_type": event.event_type,
            "event_oneof": event.WhichOneof("event"),
            "event_payload": payload,
            "event_proto_b64": self._serialize_event(event),
        }
        self._append_jsonl(record)

    def _extract_payload(self, event: Any) -> Dict[str, Any]:
        """Extract a normalized payload for known event types."""
        which = event.WhichOneof("event")
        if which == "vad":
            vad = event.vad
            return {
                "action": vad.action,
                "prob": vad.prob,
                "track": vad.track,
                "music_prob": vad.music_prob,
            }
        if which == "asr":
            asr = event.asr
            return {
                "text": asr.text,
                "confidence": asr.confidence,
                "is_final": asr.is_final,
            }
        if which == "call":
            call = event.call
            return {
                "status": call.status,
                "call_sid": call.call_sid,
            }
        return {}

    def _serialize_event(self, event: Any) -> str:
        """Serialize event proto to base64 for exact replay."""
        try:
            raw = event.SerializeToString()
            return base64.b64encode(raw).decode("ascii")
        except Exception as exc:
            logger.debug("Failed to serialize event: %s", exc)
            return ""

    def _append_jsonl(self, record: Dict[str, Any]) -> None:
        line = json.dumps(record, ensure_ascii=True)
        with self._lock:
            with open(self._events_path, "a", encoding="utf-8") as handle:
                handle.write(line + "\n")

    def _write_run_metadata(self) -> None:
        data = {
            "run_id": self.run_id,
            "started_at_ms": self._started_at_ms,
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "events_path": self._events_path,
        }
        try:
            with open(self._meta_path, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=True, indent=2)
        except Exception as exc:
            logger.warning("Failed to write run metadata: %s", exc)

    def _next_seq(self) -> int:
        with self._lock:
            self._seq += 1
            return self._seq

    @staticmethod
    def _now_ms() -> int:
        return int(time.time() * 1000)

    @staticmethod
    def _generate_run_id() -> str:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        return f"{timestamp}_{uuid.uuid4().hex[:8]}"
