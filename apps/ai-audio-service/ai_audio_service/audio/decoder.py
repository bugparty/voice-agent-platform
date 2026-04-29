"""Audio decoder for μ-law to PCM conversion and resampling."""

import numpy as np
from typing import List, Optional

# Audio parameters
SAMPLE_RATE_IN = 8000   # Twilio μ-law input
SAMPLE_RATE_OUT = 16000 # Silero VAD requires 16kHz
FRAME_SIZE = 512        # 32ms @ 16kHz (Silero VAD window size)


class AudioDecoder:
    """Decodes μ-law audio and resamples to target sample rate."""
    
    def __init__(self, sample_rate_in: int = SAMPLE_RATE_IN, 
                 sample_rate_out: int = SAMPLE_RATE_OUT,
                 frame_size: int = FRAME_SIZE):
        self.sample_rate_in = sample_rate_in
        self.sample_rate_out = sample_rate_out
        self.frame_size = frame_size
        self.buffer: List[float] = []
        self.chunk_count = 0  # Debug counter
        
    def _init_mulaw_lookup_table(self):
        """Initialize μ-law to PCM lookup table (256 entries)."""
        if hasattr(self, '_mulaw_table'):
            return
        
        # Standard ITU-T G.711 μ-law lookup table
        # This is the most reliable way to decode μ-law
        self._mulaw_table = np.zeros(256, dtype=np.int16)
        
        for i in range(256):
            # Standard μ-law decoding with bit inversion
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
            self._mulaw_table[i] = np.clip(pcm, -32768, 32767).astype(np.int16)
    
    def decode_mulaw(self, mulaw_bytes: bytes) -> np.ndarray:
        """Decode μ-law bytes to 16-bit PCM samples using lookup table.
        
        This is the most reliable method for μ-law decoding.
        """
        # Initialize lookup table if not already done
        self._init_mulaw_lookup_table()
        
        # Convert bytes to numpy array of uint8
        mulaw_samples = np.frombuffer(mulaw_bytes, dtype=np.uint8)
        
        # Debug: check if all bytes are the same (might indicate silence or error)
        if not hasattr(self, '_decode_count'):
            self._decode_count = 0
        self._decode_count += 1
        
        if self._decode_count <= 3:
            unique_values = len(np.unique(mulaw_samples))
            print(f"[decoder] Decoding chunk {self._decode_count}: {len(mulaw_samples)} bytes, unique values: {unique_values}, min={mulaw_samples.min()}, max={mulaw_samples.max()}, mean={mulaw_samples.mean():.1f}")
        
        # Use lookup table for decoding (fast and reliable)
        pcm_int16 = self._mulaw_table[mulaw_samples]
        
        if self._decode_count <= 3:
            # Calculate statistics
            pcm_min = pcm_int16.min()
            pcm_max = pcm_int16.max()
            pcm_mean = pcm_int16.mean()
            pcm_std = pcm_int16.std()
            pcm_abs_max = np.max(np.abs(pcm_int16))
            # Count non-zero samples
            non_zero = np.count_nonzero(pcm_int16)
            print(f"[decoder] Decoded PCM (lookup table): min={pcm_min}, max={pcm_max}, mean={pcm_mean:.1f}, std={pcm_std:.1f}, abs_max={pcm_abs_max}, non_zero={non_zero}/{len(pcm_int16)}")
            # Check if values are in reasonable range for 16-bit PCM
            if pcm_abs_max < 100:
                print(f"[decoder] WARNING: PCM abs_max={pcm_abs_max} is very low (expected > 1000 for normal speech)")
            else:
                print(f"[decoder] ✓ PCM values look reasonable (abs_max={pcm_abs_max})")
        
        return pcm_int16
    
    def resample(self, samples: np.ndarray, 
                 from_rate: int, to_rate: int) -> np.ndarray:
        """Simple linear resampling (for 8kHz -> 16kHz, just duplicate samples)."""
        if from_rate == to_rate:
            return samples
        
        if from_rate == 8000 and to_rate == 16000:
            # Simple upsampling: duplicate each sample
            # [a, b, c] -> [a, a, b, b, c, c]
            upsampled = np.repeat(samples, 2)
            normalized = upsampled.astype(np.float32) / 32768.0  # Normalize to [-1, 1]
            # Debug first few resamples
            if not hasattr(self, '_resample_count'):
                self._resample_count = 0
            self._resample_count += 1
            if self._resample_count <= 3:
                print(f"[decoder] Resampled: {len(samples)} @ {from_rate}Hz → {len(normalized)} @ {to_rate}Hz")
                print(f"[decoder] Normalized range: [{normalized.min():.6f}, {normalized.max():.6f}], mean={normalized.mean():.6f}, std={normalized.std():.6f}")
                print(f"[decoder] Normalized abs_max: {np.max(np.abs(normalized)):.6f}")
            return normalized
        
        # For other rates, use linear interpolation
        ratio = to_rate / from_rate
        indices = np.arange(len(samples)) * ratio
        resampled = np.interp(indices, np.arange(len(samples)), samples.astype(np.float32))
        return resampled / 32768.0  # Normalize to [-1, 1]
    
    def process_chunk(self, mulaw_bytes: bytes) -> Optional[np.ndarray]:
        """Process a chunk of μ-law audio and return a frame if ready.
        
        Returns:
            np.ndarray of shape (frame_size,) with normalized float32 samples,
            or None if not enough data accumulated yet.
        """
        if not mulaw_bytes or len(mulaw_bytes) == 0:
            return None
            
        self.chunk_count += 1
        
        # Decode μ-law to PCM
        try:
            pcm_samples = self.decode_mulaw(mulaw_bytes)
            if len(pcm_samples) == 0:
                if self.chunk_count <= 3:
                    print(f"[decoder] Chunk {self.chunk_count}: decoded 0 samples")
                return None
        except Exception as e:
            print(f"[decoder] Error decoding μ-law: {e}")
            return None
        
        # Resample to target rate
        resampled = self.resample(pcm_samples, self.sample_rate_in, self.sample_rate_out)
        
        if len(resampled) == 0:
            if self.chunk_count <= 3:
                print(f"[decoder] Chunk {self.chunk_count}: resampled to 0 samples")
            return None
        
        # Debug first few chunks
        if self.chunk_count <= 3:
            print(f"[decoder] Chunk {self.chunk_count}: {len(mulaw_bytes)} bytes → {len(pcm_samples)} samples @ {self.sample_rate_in}Hz → {len(resampled)} samples @ {self.sample_rate_out}Hz")
        
        # Add to buffer
        buffer_before = len(self.buffer)
        self.buffer.extend(resampled.tolist())
        buffer_after = len(self.buffer)
        
        # Buffer status logging removed to reduce noise
        
        # Check if we have enough samples for a frame
        if len(self.buffer) >= self.frame_size:
            # Extract frame
            frame = np.array(self.buffer[:self.frame_size], dtype=np.float32)
            # Remove used samples from buffer
            self.buffer = self.buffer[self.frame_size:]
            return frame
        
        return None
    
    def flush(self) -> Optional[np.ndarray]:
        """Flush remaining buffer, padding with zeros if needed.
        
        Returns:
            Final frame (padded to frame_size) or None if buffer is empty.
        """
        if not self.buffer:
            return None
        
        # Pad with zeros to frame_size
        frame = np.zeros(self.frame_size, dtype=np.float32)
        frame[:len(self.buffer)] = np.array(self.buffer, dtype=np.float32)
        self.buffer.clear()
        return frame
    
    def reset(self):
        """Reset the internal buffer."""
        self.buffer.clear()
