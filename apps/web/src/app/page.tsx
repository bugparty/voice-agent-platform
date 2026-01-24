"use client";

import { useEffect, useMemo, useState } from "react";
import { createEventStream, type UiEvent } from "../lib/events/sse";
import {
  initDevice,
  joinConference,
  leaveConference,
  toggleMute,
  isMuted,
  destroyDevice,
  type DeviceStatus,
} from "../lib/twilio/device";
import {
  requestMicPermission,
  type PermissionState,
} from "../lib/permissions/audio";

type CallState = {
  callStatus: string;
  callSid?: string;
  sessionId?: string;
  confName?: string;
  vadRemote: "SILENT" | "SPEAKING";
  vadProb: number;
};

type UserState = {
  deviceStatus: DeviceStatus;
  micPermission: PermissionState;
  isMuted: boolean;
};

const DEFAULT_CALL_STATE: CallState = {
  callStatus: "DISCONNECTED",
  vadRemote: "SILENT",
  vadProb: 0,
};

const DEFAULT_USER_STATE: UserState = {
  deviceStatus: "disconnected",
  micPermission: "prompt",
  isMuted: false,
};

export default function Page() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [callState, setCallState] = useState<CallState>(DEFAULT_CALL_STATE);
  const [userState, setUserState] = useState<UserState>(DEFAULT_USER_STATE);
  const [error, setError] = useState<string | null>(null);
  
  const baseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_MEDIA_SERVICE_URL || "http://localhost:4001",
    []
  );

  useEffect(() => {
    const unsubscribe = createEventStream(baseUrl, (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 200));
      if (event.category === "TWILIO") {
        if (event.payload?.event === "twilio.call.start") {
          const data = event.payload?.data as any;
          setCallState((prev) => ({
            ...prev,
            callStatus: "IN_CALL",
            sessionId: data?.sessionId,
            confName: data?.confName,
            callSid: data?.callSid,
          }));
        }
        if (event.payload?.event === "twilio.call.hangup") {
          setCallState(DEFAULT_CALL_STATE);
          // Cleanup device on hangup
          destroyDevice();
          setUserState(DEFAULT_USER_STATE);
        }
      }
      if (event.category === "VAD") {
        const action = event.payload?.event as string | undefined;
        if (action?.endsWith(".start")) {
          setCallState((prev) => ({ ...prev, vadRemote: "SPEAKING" }));
        } else if (action?.endsWith(".end")) {
          setCallState((prev) => ({ ...prev, vadRemote: "SILENT", vadProb: 0 }));
        } else if (action?.endsWith(".update")) {
          const prob = Number(event.payload?.prob ?? 0);
          setCallState((prev) => ({ ...prev, vadProb: prob }));
        }
      }
    });
    return () => {
      unsubscribe();
      destroyDevice();
    };
  }, [baseUrl]);

  async function handleStartCall() {
    try {
      setError(null);
      const res = await fetch(`${baseUrl}/call/start`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to start call");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
    }
  }

  async function handleHangup() {
    try {
      setError(null);
      await fetch(`${baseUrl}/call/hangup`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hangup");
    }
  }

  async function handleJoinConference() {
    console.log("[Web UI] ===== Join Conference Flow Start =====");
    try {
      setError(null);

      // Step 1: Check if we have a session
      console.log("[Web UI] Step 1: Checking session", {
        sessionId: callState.sessionId,
        confName: callState.confName,
        callStatus: callState.callStatus,
      });
      
      if (!callState.sessionId) {
        console.error("[Web UI] No active call session");
        setError("No active call session");
        return;
      }

      // Step 2: Request mic permission (optional - can continue without mic)
      console.log("[Web UI] Step 2: Requesting microphone permission...");
      const permission = await requestMicPermission();
      console.log("[Web UI] Microphone permission result:", permission);
      
      setUserState((prev) => ({ ...prev, micPermission: permission }));

      if (permission !== "granted") {
        console.warn("[Web UI] ⚠️ Microphone permission not granted:", permission);
        console.log("[Web UI] Continuing in LISTEN-ONLY mode (you can hear but cannot speak)");
        // Don't return - continue to join in listen-only mode
      } else {
        console.log("[Web UI] ✓ Microphone permission granted");
        // Wait a bit to let browser release the microphone
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Step 3: Get token from backend
      const identity = `user_${Date.now()}`;
      console.log("[Web UI] Step 3: Requesting token from backend", {
        identity,
        sessionId: callState.sessionId,
        endpoint: `${baseUrl}/token`,
      });
      
      const tokenRes = await fetch(`${baseUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity,
          sessionId: callState.sessionId,
        }),
      });

      const tokenData = await tokenRes.json();
      console.log("[Web UI] Token response received", {
        hasToken: !!tokenData.token,
        hasError: !!tokenData.error,
        identity: tokenData.identity,
      });
      
      if (tokenData.error) {
        console.error("[Web UI] Token error:", tokenData.error);
        setError(tokenData.error);
        return;
      }

      // Step 4: Initialize device
      console.log("[Web UI] Step 4: Initializing Twilio Device...");
      await initDevice(tokenData.token, {
        onStatusChange: (status) => {
          console.log("[Web UI] Device status changed:", status);
          setUserState((prev) => ({ ...prev, deviceStatus: status }));
        },
        onError: (err) => {
          console.error("[Web UI] Device error:", err);
          setError(err.message);
        },
        onCallDisconnected: () => {
          console.log("[Web UI] Call disconnected");
          setUserState((prev) => ({ ...prev, isMuted: false }));
        },
      });

      // Step 5: Join conference
      console.log("[Web UI] Step 5: Joining conference", {
        sessionId: callState.sessionId,
        audioEnabled: permission === "granted",
      });
      
      // Pass audio enabled flag based on permission
      await joinConference(callState.sessionId, permission === "granted");
      
      console.log("[Web UI] ===== Join Conference Flow Success =====");
    } catch (err) {
      console.error("[Web UI] Join conference failed:", err);
      setError(err instanceof Error ? err.message : "Failed to join conference");
    }
  }

  function handleLeaveConference() {
    leaveConference();
    setUserState((prev) => ({ ...prev, isMuted: false }));
  }

  function handleToggleMute() {
    const muted = toggleMute();
    setUserState((prev) => ({ ...prev, isMuted: muted }));
  }

  const canJoin = callState.callStatus === "IN_CALL" && userState.deviceStatus === "disconnected";
  const canLeave = userState.deviceStatus === "in-call";
  const canMute = userState.deviceStatus === "in-call";

  // Debug: log button states
  console.log("[Web UI] Button states:", {
    canJoin,
    callStatus: callState.callStatus,
    deviceStatus: userState.deviceStatus,
    sessionId: callState.sessionId,
  });

  return (
    <div className="page">
      <div className="top-bar">
        <div className="status-pill">
          <span>Call</span>
          <strong>{callState.callStatus}</strong>
        </div>
        <div className="status-pill">
          <span className={`status-dot ${callState.vadRemote === "SILENT" ? "silent" : ""}`} />
          <span>VAD Remote</span>
          <strong>{callState.vadRemote}</strong>
          <small>{callState.vadProb.toFixed(2)}</small>
        </div>
        <div className="status-pill">
          <span>User</span>
          <strong>{userState.deviceStatus.toUpperCase()}</strong>
        </div>
        {userState.deviceStatus === "in-call" && (
          <div className="status-pill">
            <span>Mic</span>
            <strong>{userState.isMuted ? "MUTED" : "ACTIVE"}</strong>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px", background: "#fee", color: "#c00", marginBottom: "12px" }}>
          {error}
        </div>
      )}

      <div className="content">
        <div className="panel">
          <h3>Call Controls</h3>
          <p>Fixed target number is configured in the media-service.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleStartCall} disabled={callState.callStatus !== "DISCONNECTED"}>
              Call
            </button>
            <button 
              className="secondary" 
              onClick={handleHangup}
              disabled={callState.callStatus === "DISCONNECTED"}
            >
              Hangup
            </button>
          </div>

          <h3 style={{ marginTop: "20px" }}>User Controls</h3>
          <p>Join the conference to speak with the callee.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button 
              onClick={handleJoinConference} 
              disabled={!canJoin}
              title={!canJoin ? `Cannot join: callStatus=${callState.callStatus}, deviceStatus=${userState.deviceStatus}` : ""}
            >
              Join Conference
            </button>
            <button className="secondary" onClick={handleLeaveConference} disabled={!canLeave}>
              Leave
            </button>
            <button onClick={handleToggleMute} disabled={!canMute}>
              {userState.isMuted ? "Unmute" : "Mute"}
            </button>
          </div>
          
          {/* Debug info */}
          <div style={{ marginTop: "12px", fontSize: "11px", color: "#999", fontFamily: "monospace" }}>
            <div>canJoin: {canJoin ? "✓ true" : "✗ false"}</div>
            <div>callStatus: {callState.callStatus} (need: IN_CALL)</div>
            <div>deviceStatus: {userState.deviceStatus} (need: disconnected)</div>
          </div>

          {callState.sessionId && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "#666" }}>
              <div>Session: {callState.sessionId}</div>
              <div>Conference: {callState.confName}</div>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Timeline</h3>
          <div className="timeline">
            {events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <div>
                  <strong>{event.category}</strong> · {event.payload?.event as string}
                </div>
                <small>{JSON.stringify(event.payload)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
