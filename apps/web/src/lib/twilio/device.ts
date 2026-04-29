import { Device, Call } from "@twilio/voice-sdk";

let device: Device | null = null;
let activeCall: Call | null = null;

export type DeviceStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "calling"
  | "in-call";

export interface DeviceCallbacks {
  onStatusChange?: (status: DeviceStatus) => void;
  onError?: (error: Error) => void;
  onCallDisconnected?: () => void;
}

let callbacks: DeviceCallbacks = {};

/**
 * Initialize Twilio Device with token
 */
export async function initDevice(
  token: string,
  cbs: DeviceCallbacks = {}
): Promise<Device> {
  console.log("[Twilio Device] ===== Initializing Device =====");
  console.log("[Twilio Device] Token length:", token.length);
  
  callbacks = cbs;

  // Parse token to show identity (for debugging)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    console.log("[Twilio Device] Token identity:", payload.sub);
    console.log("[Twilio Device] Token grants:", payload.grants);
  } catch (e) {
    console.warn("[Twilio Device] Could not parse token");
  }

  console.log("[Twilio Device] Creating Device instance");
  device = new Device(token, {
    codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    enableImprovedSignalingErrorPrecision: true,
    // Allow connection without microphone (listen-only mode)
    allowIncomingWhileBusy: false,
  });

  // Register event handlers
  device.on("registered", () => {
    console.log("[Twilio Device] ✓ Device registered successfully");
    callbacks.onStatusChange?.("connected");
  });

  device.on("error", (error) => {
    console.error("[Twilio Device] ✗ Device error:", error);
    callbacks.onError?.(error);
  });

  device.on("incoming", (call) => {
    console.log("[Twilio Device] Incoming call (not handled):", call.parameters);
    // We don't handle incoming calls in this flow
  });

  device.on("unregistered", () => {
    console.log("[Twilio Device] Device unregistered");
    callbacks.onStatusChange?.("disconnected");
  });

  console.log("[Twilio Device] Registering device...");
  callbacks.onStatusChange?.("connecting");
  
  try {
    await device.register();
    console.log("[Twilio Device] ✓ Device registration complete");
  } catch (err) {
    console.error("[Twilio Device] ✗ Registration failed:", err);
    throw err;
  }

  return device;
}

let silentAudioContext: AudioContext | null = null;

/**
 * Create a silent audio stream for listen-only mode
 * Uses AudioContext to generate a truly silent audio track
 */
function createSilentAudioStream(): MediaStream {
  console.log("[Twilio Call] Creating silent audio stream...");
  
  try {
    // Create an AudioContext if not exists
    if (!silentAudioContext) {
      silentAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Create a destination for the stream
    const dst = silentAudioContext.createMediaStreamDestination();
    
    // Create a gain node set to 0 (completely silent)
    const gainNode = silentAudioContext.createGain();
    gainNode.gain.value = 0;
    
    // Create an oscillator as the source
    const oscillator = silentAudioContext.createOscillator();
    oscillator.frequency.value = 440; // Standard A note
    oscillator.connect(gainNode);
    gainNode.connect(dst);
    oscillator.start();
    
    console.log("[Twilio Call] Silent audio stream created successfully");
    console.log("[Twilio Call] Stream ID:", dst.stream.id);
    console.log("[Twilio Call] Audio tracks:", dst.stream.getAudioTracks().length);
    
    return dst.stream;
  } catch (err) {
    console.error("[Twilio Call] Failed to create silent audio stream:", err);
    throw err;
  }
}

/**
 * Join conference by sessionId
 * @param sessionId - Session ID for the conference
 * @param audioEnabled - Whether to enable audio input (microphone)
 */
export async function joinConference(sessionId: string, audioEnabled: boolean = true): Promise<Call> {
  console.log("[Twilio Call] ===== Joining Conference =====");
  console.log("[Twilio Call] Session ID:", sessionId);
  console.log("[Twilio Call] Audio enabled:", audioEnabled);
  
  if (!device) {
    console.error("[Twilio Call] Device not initialized");
    throw new Error("Device not initialized. Call initDevice first.");
  }

  console.log("[Twilio Call] Device state:", device.state);
  console.log("[Twilio Call] Initiating connection...");
  
  callbacks.onStatusChange?.("calling");
  
  // Store original getUserMedia to restore later (defined outside try block for cleanup)
  let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | null = null;

  try {
    // Connect to conference with appropriate audio constraints
    const connectOptions: any = {
      params: { sessionId },
    };
    
    if (!audioEnabled) {
      // Listen-only mode: intercept getUserMedia to return silent stream
      console.log("[Twilio Call] Connecting in LISTEN-ONLY mode");
      console.log("[Twilio Call] Intercepting getUserMedia for silent audio...");
      
      try {
        // Create silent stream
        const silentStream = createSilentAudioStream();
        
        // Store original getUserMedia
        originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        
        // Replace getUserMedia with our version that returns silent stream
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
          console.log("[Twilio Call] Intercepted getUserMedia call:", constraints);
          
          // If requesting audio, return our silent stream
          if (constraints?.audio) {
            console.log("[Twilio Call] Returning silent audio stream instead of real microphone");
            return silentStream;
          }
          
          // For video or other requests, use original
          if (originalGetUserMedia) {
            return originalGetUserMedia(constraints);
          }
          throw new Error("Original getUserMedia not available");
        };
        
        console.log("[Twilio Call] getUserMedia intercepted successfully");
      } catch (err) {
        console.error("[Twilio Call] Failed to intercept getUserMedia:", err);
        // Restore original if we saved it
        if (originalGetUserMedia) {
          navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        }
      }
    } else {
      console.log("[Twilio Call] Connecting with microphone enabled");
    }
    
    activeCall = await device.connect(connectOptions);
    
    // Restore original getUserMedia after connection is established
    if (originalGetUserMedia) {
      console.log("[Twilio Call] Restoring original getUserMedia");
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }

    console.log("[Twilio Call] ✓ Connection established", {
      callSid: activeCall.parameters.CallSid,
      direction: activeCall.direction,
    });

    // Register call event handlers
    activeCall.on("accept", () => {
      console.log("[Twilio Call] ✓ Call ACCEPTED");
      console.log("[Twilio Call] Call parameters:", activeCall?.parameters);
      callbacks.onStatusChange?.("in-call");
    });

    activeCall.on("disconnect", () => {
      console.log("[Twilio Call] Call disconnected");
      activeCall = null;
      callbacks.onStatusChange?.("connected");
      callbacks.onCallDisconnected?.();
    });

    activeCall.on("error", (error) => {
      console.error("[Twilio Call] ✗ Call error:", error);
      console.error("[Twilio Call] Error details:", {
        name: error.name,
        message: error.message,
        code: (error as any).code,
      });
      callbacks.onError?.(error);
    });

    activeCall.on("reconnecting", (error) => {
      console.warn("[Twilio Call] Reconnecting...", error);
    });

    activeCall.on("reconnected", () => {
      console.log("[Twilio Call] ✓ Reconnected");
    });

    activeCall.on("ringing", () => {
      console.log("[Twilio Call] Call ringing...");
    });

    console.log("[Twilio Call] Event handlers registered");
    return activeCall;
  } catch (err) {
    // Restore original getUserMedia on error too
    if (originalGetUserMedia) {
      console.log("[Twilio Call] Restoring original getUserMedia after error");
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }
    console.error("[Twilio Call] ✗ Connection failed:", err);
    throw err;
  }
}

/**
 * Leave conference (disconnect active call)
 */
export function leaveConference(): void {
  if (activeCall) {
    console.log("[Twilio Call] Disconnecting");
    activeCall.disconnect();
    activeCall = null;
  }
}

/**
 * Toggle mute state
 */
export function toggleMute(): boolean {
  console.log("[Twilio Call] Toggle mute requested");
  
  if (!activeCall) {
    console.warn("[Twilio Call] No active call to mute");
    return false;
  }

  const currentlyMuted = activeCall.isMuted();
  const newMutedState = !currentlyMuted;
  
  console.log("[Twilio Call] Changing mute state:", {
    from: currentlyMuted,
    to: newMutedState,
  });
  
  activeCall.mute(newMutedState);
  
  console.log("[Twilio Call] ✓ Mute state changed to:", newMutedState);
  return newMutedState;
}

/**
 * Get current mute state
 */
export function isMuted(): boolean {
  return activeCall?.isMuted() ?? false;
}

/**
 * Get device instance
 */
export function getDevice(): Device | null {
  return device;
}

/**
 * Get active call instance
 */
export function getActiveCall(): Call | null {
  return activeCall;
}

/**
 * Destroy device and cleanup
 */
export function destroyDevice(): void {
  if (activeCall) {
    activeCall.disconnect();
    activeCall = null;
  }

  if (device) {
    device.unregister();
    device.destroy();
    device = null;
  }

  callbacks = {};
}
