"""MediaPipe Audio Classifier for VAD and Music Detection."""

import os
import numpy as np
from scipy.signal import resample_poly
from typing import Optional, Callable, Tuple
from pathlib import Path

from mediapipe.tasks import python
from mediapipe.tasks.python import audio
from mediapipe.tasks.python.components.containers import AudioData


class MediaPipeClassifier:
    """MediaPipe YAMNet-based audio classifier for speech and music detection."""
    
    # μ-law 解码查找表（标准 ITU-T G.711）
    _MULAW_TABLE = None
    
    def __init__(self, model_path: Optional[str] = None, 
                 speech_threshold: float = 0.5,
                 music_threshold: float = 0.5):
        """Initialize MediaPipe Audio Classifier.
        
        Args:
            model_path: Path to YAMNet TFLite model. If None, uses default path.
            speech_threshold: Minimum score for speech detection (0.0-1.0)
            music_threshold: Minimum score for music detection (0.0-1.0)
        """
        self.speech_threshold = speech_threshold
        self.music_threshold = music_threshold
        
        # Audio parameters
        self.IN_SR = 8000   # Twilio μ-law input
        self.OUT_SR = 16000 # MediaPipe YAMNet requires 16kHz
        
        # Classification window parameters (YAMNet: ~0.96s window, ~0.48s hop)
        self.WIN_SEC = 1.0  # 1s window
        self.HOP_SEC = 0.5  # 0.5s hop
        self.WIN_N = int(self.OUT_SR * self.WIN_SEC)
        self.HOP_N = int(self.OUT_SR * self.HOP_SEC)
        
        # Initialize μ-law lookup table
        self._init_mulaw_table()
        
        # Find model path
        if model_path is None:
            # Try to find model in common locations
            base_dir = Path(__file__).parent.parent.parent.parent.parent
            print(f"[MediaPipe] Base directory: {base_dir}")
            possible_paths = [
                base_dir / "lite-model_yamnet_classification_tflite_1.tflite",
                base_dir / "models" / "lite-model_yamnet_classification_tflite_1.tflite",
                Path("lite-model_yamnet_classification_tflite_1.tflite"),
            ]
            for p in possible_paths:
                if p.exists():
                    model_path = str(p)
                    break
            
            if model_path is None:
                raise FileNotFoundError(
                    "YAMNet model not found. Please download from: "
                    "https://github.com/google/mediapipe/tree/master/mediapipe/models"
                )
        
        # Initialize classifier
        self.buf = np.zeros(0, dtype=np.float32)
        self.sample_cursor = 0
        self.last_speech_score = 0.0
        self.last_music_score = 0.0
        self.result_callback: Optional[Callable] = None
        
        # Create classifier
        base = python.BaseOptions(model_asset_path=model_path)
        opts = audio.AudioClassifierOptions(
            base_options=base,
            running_mode=audio.RunningMode.AUDIO_STREAM,
            max_results=10,  # Get more results for better classification
            result_callback=self._on_result,
        )
        self.clf = audio.AudioClassifier.create_from_options(opts)
        print(f"[MediaPipe] Audio classifier loaded from {model_path}")
    
    def _init_mulaw_table(self):
        """Initialize μ-law to PCM lookup table."""
        if MediaPipeClassifier._MULAW_TABLE is not None:
            return
        
        # Standard ITU-T G.711 μ-law lookup table
        MediaPipeClassifier._MULAW_TABLE = np.zeros(256, dtype=np.int16)
        
        for i in range(256):
            # Invert bits 0-6, keep sign bit 7
            inverted = i ^ 0x7F
            
            # Extract sign, exponent, mantissa
            sign = (inverted >> 7) & 1
            exponent = (inverted >> 4) & 0x07
            mantissa = inverted & 0x0F
            
            # Decode formula
            linear = ((33 + 2 * mantissa) * (1 << (exponent + 2))) - 33
            
            # Apply sign
            if sign == 0:
                pcm = linear
            else:
                pcm = -linear
            
            # Clamp to int16 range
            MediaPipeClassifier._MULAW_TABLE[i] = np.clip(pcm, -32768, 32767).astype(np.int16)
    
    def _on_result(self, result: audio.AudioClassifierResult, timestamp_ms: int):
        """Callback for classification results."""
        if not result.classifications:
            return
        
        cats = result.classifications[0].categories
        
        # Find best scores for speech and music
        def best_score(keys):
            best = 0.0
            for c in cats:
                name = (c.category_name or "").lower()
                if any(k in name for k in keys):
                    best = max(best, float(c.score))
            return best
        
        speech = best_score(["speech", "conversation", "talking"])
        music = best_score(["music", "singing", "song", "melody", "harmony"])
        
        # Debug: log music detection
        if music > 0.3:
            print(f"[MediaPipe] Classification result: speech={speech:.3f}, music={music:.3f}, ts={timestamp_ms}ms")
        
        self.last_speech_score = speech
        self.last_music_score = music
        
        # Call user callback if set
        if self.result_callback:
            self.result_callback(speech, music, timestamp_ms)
    
    def set_result_callback(self, callback: Callable[[float, float, int], None]):
        """Set callback for classification results.
        
        Args:
            callback: Function(speech_score, music_score, timestamp_ms) -> None
        """
        self.result_callback = callback
    
    def process_frame(self, audio_frame: np.ndarray, sample_rate: int = 16000) -> Tuple[float, float]:
        """Process an audio frame and return speech/music probabilities.
        
        Args:
            audio_frame: Audio samples as float32 array in range [-1, 1]
            sample_rate: Sample rate of the audio (should be 16000)
        
        Returns:
            Tuple of (speech_prob, music_prob) in range [0.0, 1.0]
        """
        # Add to buffer
        self.buf = np.concatenate([self.buf, audio_frame])
        
        # Process when we have enough data (1 second window)
        # Check if we should classify (every HOP_N samples)
        should_classify = False
        
        # Calculate if we've accumulated enough samples since last classification
        if self.buf.shape[0] >= self.WIN_N:
            # Check if it's time for a hop (based on total samples processed)
            samples_since_last_hop = self.buf.shape[0] - (self.sample_cursor % self.WIN_N)
            if samples_since_last_hop >= self.HOP_N or self.sample_cursor == 0:
                should_classify = True
        
        if should_classify and self.buf.shape[0] >= self.WIN_N:
            # Take last 1s window
            window = self.buf[-self.WIN_N:]
            
            timestamp_ms = int(self.sample_cursor / self.OUT_SR * 1000)
            try:
                # MediaPipe AudioClassifier.classify_async expects AudioData object
                # Use the official AudioData.create_from_array method
                # It expects float32 array in range [-1, 1]
                audio_block = AudioData.create_from_array(
                    window.astype(np.float32),
                    sample_rate=float(self.OUT_SR)
                )
                self.clf.classify_async(audio_block, timestamp_ms)
            except Exception as e:
                print(f"[MediaPipe] Error in classify_async: {e}")
                import traceback
                traceback.print_exc()
            
            # Advance cursor by hop size
            self.sample_cursor += self.HOP_N
            
            # Trim buffer to keep only last 1.5 seconds (enough for next window)
            if self.buf.shape[0] > int(self.OUT_SR * 1.5):
                self.buf = self.buf[-int(self.OUT_SR * 1.5):]
        
        # Return current scores (may be from previous classification if async hasn't completed yet)
        # This is expected behavior - scores update asynchronously via _on_result callback
        return (self.last_speech_score, self.last_music_score)
    
    def process_mulaw_chunk(self, mulaw_bytes: bytes) -> Tuple[float, float]:
        """Process a chunk of μ-law audio and return speech/music probabilities.
        
        Args:
            mulaw_bytes: μ-law encoded audio bytes (8kHz)
        
        Returns:
            Tuple of (speech_prob, music_prob) in range [0.0, 1.0]
        """
        # Decode μ-law using lookup table
        mulaw_samples = np.frombuffer(mulaw_bytes, dtype=np.uint8)
        pcm_int16 = MediaPipeClassifier._MULAW_TABLE[mulaw_samples]
        
        # Convert to float32 [-1, 1]
        x = pcm_int16.astype(np.float32) / 32768.0
        
        # Resample 8kHz -> 16kHz
        y = resample_poly(x, up=2, down=1).astype(np.float32)
        
        # Process frame
        return self.process_frame(y, sample_rate=self.OUT_SR)
    
    def get_speech_probability(self) -> float:
        """Get last speech probability."""
        return self.last_speech_score
    
    def get_music_probability(self) -> float:
        """Get last music probability."""
        return self.last_music_score
    
    def reset(self):
        """Reset internal buffer and cursor."""
        self.buf = np.zeros(0, dtype=np.float32)
        self.sample_cursor = 0
        self.last_speech_score = 0.0
        self.last_music_score = 0.0
