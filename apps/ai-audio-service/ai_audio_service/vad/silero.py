"""Silero VAD wrapper for speech detection."""

import numpy as np
import torch
from typing import Optional


class SileroVadProcessor:
    """Wrapper for Silero VAD model."""
    
    def __init__(self, model_path: Optional[str] = None, device: Optional[str] = None):
        """Initialize Silero VAD model.
        
        Args:
            model_path: Optional path to ONNX model. If None, uses torch.hub.
            device: Device to run on ('cpu' or 'cuda'). Auto-detects if None.
        """
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.sample_rate = 16000
        self._load_model(model_path)
    
    def _load_model(self, model_path: Optional[str] = None):
        """Load Silero VAD model."""
        try:
            if model_path:
                # Load from ONNX file
                import onnxruntime as ort
                self.model = ort.InferenceSession(model_path)
                self.use_onnx = True
            else:
                # Load from torch.hub (default)
                self.model, utils = torch.hub.load(
                    repo_or_dir='snakers4/silero-vad',
                    model='silero_vad',
                    force_reload=False,
                    onnx=False
                )
                self.model = self.model.to(self.device)
                self.model.eval()
                self.use_onnx = False
            print(f"[VAD] Silero VAD model loaded on {self.device}")
        except Exception as e:
            print(f"[VAD] Error loading Silero VAD model: {e}")
            print("[VAD] Falling back to simple threshold-based VAD")
            self.model = None
            self.use_onnx = False
    
    def process_frame(self, audio_frame: np.ndarray, sample_rate: int = 16000) -> float:
        """Process an audio frame and return speech probability.
        
        Args:
            audio_frame: Audio samples as float32 array in range [-1, 1]
            sample_rate: Sample rate of the audio (should be 16000)
        
        Returns:
            Speech probability in range [0.0, 1.0]
        """
        # Check audio frame validity
        if len(audio_frame) == 0:
            return 0.0
        
        # Check if audio is all zeros (silence)
        energy = np.mean(np.abs(audio_frame))
        max_amplitude = np.max(np.abs(audio_frame))
        
        if self.model is None:
            # Fallback: simple energy-based detection
            return min(1.0, energy * 10.0)  # Rough heuristic
        
        # Ensure correct shape and type
        if len(audio_frame) != 512:
            # Pad or truncate to 512 samples
            if len(audio_frame) < 512:
                padded = np.zeros(512, dtype=np.float32)
                padded[:len(audio_frame)] = audio_frame
                audio_frame = padded
            else:
                audio_frame = audio_frame[:512]
        
        # Debug: log audio statistics for first few frames
        if not hasattr(self, '_debug_frame_count'):
            self._debug_frame_count = 0
        self._debug_frame_count += 1
        
        if self._debug_frame_count <= 10:
            frame_mean = np.mean(audio_frame)
            frame_std = np.std(audio_frame)
            frame_min = audio_frame.min()
            frame_max = audio_frame.max()
            # Count samples with significant amplitude (> 0.01)
            significant_samples = np.count_nonzero(np.abs(audio_frame) > 0.01)
            print(f"[VAD] Frame {self._debug_frame_count}: energy={energy:.6f}, max_amp={max_amplitude:.6f}, mean={frame_mean:.6f}, std={frame_std:.6f}")
            print(f"[VAD] Frame {self._debug_frame_count}: range=[{frame_min:.6f}, {frame_max:.6f}], significant_samples={significant_samples}/{len(audio_frame)}")
            if max_amplitude < 0.01:
                print(f"[VAD] WARNING: max_amplitude={max_amplitude:.6f} is very low (expected > 0.1 for normal speech)")
        
        try:
            if self.use_onnx:
                # ONNX inference
                input_data = audio_frame.astype(np.float32).reshape(1, -1)
                outputs = self.model.run(None, {'input': input_data})
                prob = float(outputs[0][0][0])
            else:
                # PyTorch inference
                with torch.no_grad():
                    audio_tensor = torch.from_numpy(audio_frame).float().to(self.device)
                    # Silero VAD expects shape (1, samples) - but check the actual model signature
                    # Some versions expect (batch, samples), others expect (samples,)
                    if audio_tensor.dim() == 1:
                        audio_tensor = audio_tensor.unsqueeze(0)  # Add batch dimension
                    
                    # Try calling the model - Silero VAD v4+ uses different API
                    try:
                        # Method 1: Direct call (for newer versions)
                        prob = self.model(audio_tensor, sample_rate).item()
                    except (TypeError, RuntimeError) as e:
                        # Method 2: Try with get_speech_timestamps utility
                        if self._debug_frame_count <= 3:
                            print(f"[VAD] Direct call failed: {e}, trying alternative method")
                        try:
                            # Some versions need the audio as 1D tensor
                            if audio_tensor.dim() == 2:
                                audio_1d = audio_tensor.squeeze(0)
                            else:
                                audio_1d = audio_tensor
                            prob = self.model(audio_1d, sample_rate).item()
                        except Exception as e2:
                            if self._debug_frame_count <= 3:
                                print(f"[VAD] Alternative method also failed: {e2}")
                            # Fallback: return energy-based estimate
                            energy = np.mean(np.abs(audio_frame))
                            prob = min(1.0, energy * 5.0)
            
            if self._debug_frame_count <= 5:
                print(f"[VAD] Model output: prob={prob:.6f}, audio_shape={audio_frame.shape}, audio_range=[{audio_frame.min():.4f}, {audio_frame.max():.4f}]")
            
            return max(0.0, min(1.0, prob))  # Clamp to [0, 1]
        except Exception as e:
            print(f"[VAD] Error processing frame: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to energy-based
            energy = np.mean(np.abs(audio_frame))
            return min(1.0, energy * 10.0)
