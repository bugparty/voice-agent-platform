export type PermissionState = "granted" | "prompt" | "denied" | "unknown";

/**
 * Request microphone permission
 */
export async function requestMicPermission(): Promise<PermissionState> {
  console.log("[Audio Permissions] Requesting microphone access...");
  
  try {
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[Audio Permissions] getUserMedia not available");
      return "denied";
    }

    console.log("[Audio Permissions] Calling getUserMedia with audio:true");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    console.log("[Audio Permissions] Stream obtained", {
      streamId: stream.id,
      tracks: stream.getTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    // Log each track info
    stream.getAudioTracks().forEach((track, idx) => {
      console.log(`[Audio Permissions] Audio Track ${idx}:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      });
    });

    // Stop all tracks immediately - we just needed permission check
    // Twilio Voice SDK will request its own stream later
    stream.getTracks().forEach((track) => {
      console.log("[Audio Permissions] Stopping track:", track.label);
      track.stop();
    });
    
    console.log("[Audio Permissions] ✓ Permission GRANTED");
    console.log("[Audio Permissions] Note: Twilio SDK will request microphone again when connecting");
    return "granted";
  } catch (err) {
    console.error("[Audio Permissions] ✗ Permission request failed:", err);
    
    if (err instanceof DOMException) {
      console.log("[Audio Permissions] DOMException details:", {
        name: err.name,
        message: err.message,
        code: err.code,
      });
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        console.error("[Audio Permissions] User denied permission");
        return "denied";
      }
      if (err.name === "NotFoundError") {
        console.error("[Audio Permissions] No microphone device found");
        return "denied";
      }
      if (err.name === "NotReadableError") {
        console.error("[Audio Permissions] Microphone already in use");
        return "denied";
      }
    }
    
    console.error("[Audio Permissions] Unknown error:", err);
    return "unknown";
  }
}

/**
 * Check current microphone permission state
 */
export async function checkMicPermission(): Promise<PermissionState> {
  try {
    if (!navigator.permissions) {
      // Fallback: try to get user media
      return await requestMicPermission();
    }

    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state as PermissionState;
  } catch (err) {
    console.warn("Unable to check microphone permission", err);
    return "unknown";
  }
}

/**
 * Get available audio devices
 */
export async function getAudioDevices(): Promise<{
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === "audioinput"),
      outputs: devices.filter((d) => d.kind === "audiooutput"),
    };
  } catch (err) {
    console.error("Error enumerating audio devices", err);
    return { inputs: [], outputs: [] };
  }
}

/**
 * Set audio output device (if supported)
 */
export async function setAudioOutputDevice(
  deviceId: string,
  audioElement: HTMLAudioElement
): Promise<boolean> {
  try {
    if ("setSinkId" in audioElement) {
      await (audioElement as any).setSinkId(deviceId);
      return true;
    }
    console.warn("setSinkId not supported in this browser");
    return false;
  } catch (err) {
    console.error("Error setting audio output device", err);
    return false;
  }
}
