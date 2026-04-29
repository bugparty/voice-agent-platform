"""gRPC server for AI Audio Service with MediaPipe Audio Classifier."""

import importlib
import os
import sys
import time
from concurrent import futures
from pathlib import Path
from typing import Dict, Tuple, Union

import grpc
import numpy as np

from .audio.decoder import AudioDecoder
from .vad.silero import SileroVadProcessor  # Keep for reference
from .vad.mediapipeclassifer import MediaPipeClassifier
from .vad.state_machine import VadStateMachine


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parents[2]  # ai_audio_service -> ai-audio-service -> apps -> voip_agent
PROTO_DIR = BASE_DIR / "proto"
PROTO_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_PROTO_PATH = REPO_ROOT / "packages" / "proto" / "audioai.proto"
PROTO_PATH = Path(os.getenv("AUDIOAI_PROTO_PATH", str(DEFAULT_PROTO_PATH)))


def ensure_generated():
    """Ensure protobuf files are generated."""
    pb2_path = PROTO_DIR / "audioai_pb2.py"
    pb2_grpc_path = PROTO_DIR / "audioai_pb2_grpc.py"
    
    # Check if proto file is newer than generated files (force regeneration)
    proto_mtime = PROTO_PATH.stat().st_mtime if PROTO_PATH.exists() else 0
    pb2_mtime = pb2_path.stat().st_mtime if pb2_path.exists() else 0
    pb2_grpc_mtime = pb2_grpc_path.stat().st_mtime if pb2_grpc_path.exists() else 0
    
    # Regenerate if proto is newer or if generated files don't exist
    if proto_mtime > max(pb2_mtime, pb2_grpc_mtime) or not (pb2_path.exists() and pb2_grpc_path.exists()):
        print(f"[proto] Regenerating protobuf files from {PROTO_PATH}")
        try:
            from grpc_tools import protoc
        except ImportError as exc:
            raise RuntimeError("grpcio-tools is required to generate protobuf files") from exc

        # Remove old files to force regeneration
        if pb2_path.exists():
            pb2_path.unlink()
        if pb2_grpc_path.exists():
            pb2_grpc_path.unlink()

        args = [
            "grpc_tools.protoc",
            f"-I{PROTO_PATH.parent}",
            f"--python_out={PROTO_DIR}",
            f"--grpc_python_out={PROTO_DIR}",
            str(PROTO_PATH),
        ]
        result = protoc.main(args)
        if result != 0:
            raise RuntimeError("Failed to generate protobuf files")
        print("[proto] Protobuf files regenerated successfully")


def load_proto():
    """Load generated protobuf modules."""
    ensure_generated()
    sys.path.insert(0, str(PROTO_DIR))
    audioai_pb2 = importlib.import_module("audioai_pb2")
    audioai_pb2_grpc = importlib.import_module("audioai_pb2_grpc")
    return audioai_pb2, audioai_pb2_grpc


class SessionProcessor:
    """Processes audio for a single session+track combination."""
    
    def __init__(self, session_id: str, track: str, classifier: MediaPipeClassifier):
        self.session_id = session_id
        self.track = track or "inbound"  # Default to inbound
        self.decoder = AudioDecoder()
        self.classifier = classifier
        self.state_machine = VadStateMachine()
    
    def process_chunk(self, mulaw_bytes: bytes, timestamp_ms: int):
        """Process an audio chunk and yield events if any.
        
        Yields:
            VadEvent messages if state changed
        """
        # Debug: check raw audio data
        if not hasattr(self, '_chunk_count'):
            self._chunk_count = 0
            self._audio_samples_saved = 0
        self._chunk_count += 1
        
        # Check raw μ-law data
        if self._chunk_count <= 5:
            unique_bytes = len(set(mulaw_bytes))
            byte_range = (min(mulaw_bytes), max(mulaw_bytes)) if mulaw_bytes else (0, 0)
            print(f"[audio-check] Chunk {self._chunk_count}: {len(mulaw_bytes)} bytes, unique values: {unique_bytes}, range: {byte_range}")
            # Check if all bytes are the same (silence indicator)
            if unique_bytes <= 2:
                print(f"[audio-check] WARNING: Very few unique values ({unique_bytes}), might be silence or corrupted")
        
        # Decode and resample
        frame = self.decoder.process_chunk(mulaw_bytes)
        
        if frame is not None:
            # Debug: check decoded frame
            if self._chunk_count <= 5 or (self._chunk_count % 100 == 0 and self._audio_samples_saved < 3):
                frame_energy = np.mean(np.abs(frame))
                frame_max = np.max(np.abs(frame))
                frame_mean = np.mean(frame)
                frame_std = np.std(frame)
                print(f"[audio-check] Frame from chunk {self._chunk_count}: energy={frame_energy:.6f}, max={frame_max:.6f}, mean={frame_mean:.6f}, std={frame_std:.6f}, range=[{frame.min():.6f}, {frame.max():.6f}]")
                
                # Save first few frames for debugging (optional)
                if self._audio_samples_saved < 3:
                    try:
                        import wave
                        import os
                        debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "debug_audio")
                        os.makedirs(debug_dir, exist_ok=True)
                        wav_path = os.path.join(debug_dir, f"frame_{self._audio_samples_saved}_{self.session_id[:8]}.wav")
                        with wave.open(wav_path, 'wb') as wav_file:
                            wav_file.setnchannels(1)  # Mono
                            wav_file.setsampwidth(2)  # 16-bit
                            wav_file.setframerate(16000)
                            # Convert float32 [-1, 1] to int16
                            int16_data = (frame * 32767).astype(np.int16)
                            wav_file.writeframes(int16_data.tobytes())
                        print(f"[audio-check] Saved frame to {wav_path}")
                        self._audio_samples_saved += 1
                    except Exception as e:
                        print(f"[audio-check] Could not save audio: {e}")
            
            # Run MediaPipe classifier (returns speech_prob, music_prob)
            speech_prob, music_prob = self.classifier.process_frame(frame)
            
            # Use speech probability for VAD
            prob = speech_prob
            
            # Debug: log classification results periodically
            if not hasattr(self, '_frame_count'):
                self._frame_count = 0
            self._frame_count += 1
            
            # Debug: log both speech and music for first 10 frames, then every 50 frames
            if self._frame_count <= 10 or self._frame_count % 50 == 0:
                print(f"[MediaPipe] Frame {self._frame_count}: speech={speech_prob:.3f}, music={music_prob:.3f}")
            
            # Update state machine with speech probability
            event = self.state_machine.process(prob, timestamp_ms)
            
            # Force emit SPEECH_UPDATE when music is detected (> 0.5) even if no speech event
            # This ensures music_prob gets sent to frontend
            if not event and music_prob > 0.5 and self._frame_count % 5 == 0:
                event = "SPEECH_UPDATE"  # Use existing event type to carry music_prob
            
            if event:
                # Log VAD state changes with music info
                music_info = f", music={music_prob:.3f}" if music_prob > 0.1 else ""
                print(f"[VAD] {self.session_id[:8]}.../{self.track}: {event} (speech={prob:.3f}{music_info}, ts={timestamp_ms}ms)")
                yield {
                    "event": event,
                    "prob": prob,
                    "timestamp_ms": timestamp_ms,
                    "music_prob": music_prob  # Include music probability in event
                }
    
    def flush(self):
        """Flush remaining buffer and return final event if needed."""
        frame = self.decoder.flush()
        if frame is not None:
            speech_prob, music_prob = self.classifier.process_frame(frame)
            prob = speech_prob
            event = self.state_machine.process(prob, self.state_machine.last_timestamp_ms)
            if event:
                return {
                    "event": event,
                    "prob": prob,
                    "timestamp_ms": self.state_machine.last_timestamp_ms,
                    "music_prob": music_prob
                }
        
        # Check if we need to send SPEECH_END
        was_speaking = self.state_machine.reset()
        if was_speaking:
            print(f"[VAD] {self.session_id[:8]}.../{self.track}: SPEECH_END (final)")
            return {
                "event": "SPEECH_END",
                "prob": 0.0,
                "timestamp_ms": self.state_machine.last_timestamp_ms,
                "music_prob": 0.0
            }
        return None


class AudioAIService:
    """gRPC service for audio AI processing."""
    
    def __init__(self, audioai_pb2):
        self.audioai_pb2 = audioai_pb2
        # Shared MediaPipe classifier (model is loaded once)
        # Note: SileroVadProcessor is kept for reference but not used
        
        print("[AudioAI] Initializing MediaPipe Audio Classifier...")
        try:
            import traceback
            self.classifier = MediaPipeClassifier()
            print("[AudioAI] ✓ MediaPipe Audio Classifier loaded successfully (speech + music detection)")
        except Exception as e:
            print(f"[AudioAI] ✗ Failed to load MediaPipe classifier: {e}")
            import traceback
            traceback.print_exc()
            print("[AudioAI] Exiting - MediaPipe is required")
            raise RuntimeError(f"MediaPipe classifier failed to load: {e}") from e
        
        # Per-session processors: key is (session_id, track)
        self.processors: Dict[Tuple[str, str], SessionProcessor] = {}
    
    def _get_processor(self, session_id: str, track: str) -> SessionProcessor:
        """Get or create a processor for a session+track combination."""
        # Normalize track
        track = track or "inbound"
        key = (session_id, track)
        
        if key not in self.processors:
            print(f"[VAD] New session: {session_id[:8]}.../{track} (total sessions: {len(self.processors) + 1})")
            if not self.classifier:
                raise RuntimeError("MediaPipe classifier not available - service should not have started")
            
            self.processors[key] = SessionProcessor(
                session_id=session_id,
                track=track,
                classifier=self.classifier
            )
        
        return self.processors[key]
    
    def Stream(self, request_iterator, context):
        """Handle bidirectional gRPC stream."""
        session_id = None
        track = "inbound"  # Default track
        chunk_count = 0
        
        try:
            for chunk in request_iterator:
                chunk_count += 1
                # Extract session info
                session_id = chunk.session_id or session_id
                # Get track from chunk, fallback to current track, default to "inbound"
                if hasattr(chunk, 'track') and chunk.track:
                    track = chunk.track
                elif not track:
                    track = "inbound"
                timestamp_ms = chunk.timestamp_ms or 0
                
                if not session_id:
                    print(f"[VAD] Warning: Received chunk {chunk_count} without session_id")
                    continue
                
                # Log first few chunks for debugging
                if chunk_count <= 3:
                    payload_len = len(chunk.payload) if hasattr(chunk, 'payload') else 0
                    print(f"[VAD] Received chunk {chunk_count}: session={session_id[:8]}..., track={track}, seq={chunk.seq if hasattr(chunk, 'seq') else 'N/A'}, payload={payload_len} bytes, ts={timestamp_ms}ms")
                
                # Get processor for this session+track
                # Debug: log session key for first few chunks
                if chunk_count <= 5:
                    key = (session_id, track or "inbound")
                    print(f"[VAD] Debug: chunk {chunk_count}, session_id={session_id[:8]}..., track={track}, key={key}, existing_keys={list(self.processors.keys())[:3]}")
                
                processor = self._get_processor(session_id, track)
                
                # Process audio chunk
                event_count = 0
                for event_data in processor.process_chunk(chunk.payload, timestamp_ms):
                    event_count += 1
                    # Emit event via gRPC - ensure track is always set
                    event_track = track or "inbound"
                    music_prob = event_data.get("music_prob", 0.0)
                    
                    # Debug: log music_prob for all events (first few) or when significant
                    if music_prob > 0.1 or event_count <= 5:
                        print(f"[VAD] Sending event: event={event_data['event']}, prob={event_data['prob']:.3f}, music_prob={music_prob:.3f}")
                    
                    # Create VadEvent with all fields including music_prob
                    vad_event = self.audioai_pb2.VadEvent(
                        session_id=session_id,
                        event=event_data["event"],
                        prob=event_data["prob"],
                        timestamp_ms=event_data["timestamp_ms"],
                        track=event_track,
                        music_prob=music_prob  # Include music probability (always set, even if 0.0)
                    )
                    
                    # Debug: verify music_prob is set (first few events)
                    if event_count <= 5:
                        print(f"[VAD] VadEvent created: event={event_data['event']}, prob={event_data['prob']:.3f}, music_prob={vad_event.music_prob:.3f}")
                    
                    yield vad_event
                
                # Log if no events were generated (might indicate buffering)
                if event_count == 0 and chunk_count % 50 == 0:
                    print(f"[VAD] Processed {chunk_count} chunks, no events yet (buffering...)")
        
        finally:
            # Cleanup: flush and send final events
            if session_id and track:
                final_track = track or "inbound"
                key = (session_id, final_track)
                if key in self.processors:
                    processor = self.processors[key]
                    final_event = processor.flush()
                    if final_event:
                        print(f"[VAD] {session_id[:8]}.../{final_track}: {final_event['event']} (final)")
                        yield self.audioai_pb2.VadEvent(
                            session_id=session_id,
                            event=final_event["event"],
                            prob=final_event["prob"],
                            timestamp_ms=final_event["timestamp_ms"],
                            track=final_track,
                            music_prob=final_event.get("music_prob", 0.0)  # Include music probability
                        )
                    # Remove processor
                    print(f"[VAD] Session ended: {session_id[:8]}.../{final_track}")
                    del self.processors[key]


def serve():
    """Start the gRPC server."""
    audioai_pb2, audioai_pb2_grpc = load_proto()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    audioai_pb2_grpc.add_AudioAIServicer_to_server(
        AudioAIService(audioai_pb2), 
        server
    )

    port = os.getenv("AI_AUDIO_SERVICE_PORT", "50051")
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    print(f"[ai-audio-service] Listening on port {port}")
    print("[ai-audio-service] Silero VAD initialized")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("[ai-audio-service] Shutting down...")
        server.stop(0)


if __name__ == "__main__":
    serve()
