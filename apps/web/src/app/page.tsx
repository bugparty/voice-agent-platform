"use client";

import { useEffect, useMemo, useState } from "react";
import { createEventStream, type UiEvent } from "../lib/events/sse";

type CallState = {
  callStatus: string;
  vadRemote: "SILENT" | "SPEAKING";
  vadProb: number;
};

const DEFAULT_STATUS: CallState = {
  callStatus: "DISCONNECTED",
  vadRemote: "SILENT",
  vadProb: 0
};

export default function Page() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [status, setStatus] = useState<CallState>(DEFAULT_STATUS);
  const baseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_MEDIA_SERVICE_URL || "http://localhost:4001",
    []
  );

  useEffect(() => {
    const unsubscribe = createEventStream(baseUrl, (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 200));
      if (event.category === "TWILIO") {
        if (event.payload?.event === "twilio.call.start") {
          setStatus((prev) => ({ ...prev, callStatus: "IN_CALL" }));
        }
        if (event.payload?.event === "twilio.call.hangup") {
          setStatus((prev) => ({ ...prev, callStatus: "DISCONNECTED" }));
        }
      }
      if (event.category === "VAD") {
        const action = event.payload?.event as string | undefined;
        if (action?.endsWith(".start")) {
          setStatus((prev) => ({ ...prev, vadRemote: "SPEAKING" }));
        } else if (action?.endsWith(".end")) {
          setStatus((prev) => ({ ...prev, vadRemote: "SILENT", vadProb: 0 }));
        } else if (action?.endsWith(".update")) {
          const prob = Number(event.payload?.prob ?? 0);
          setStatus((prev) => ({ ...prev, vadProb: prob }));
        }
      }
    });
    return () => unsubscribe();
  }, [baseUrl]);

  async function handleStartCall() {
    await fetch(`${baseUrl}/call/start`, { method: "POST" });
  }

  async function handleHangup() {
    await fetch(`${baseUrl}/call/hangup`, { method: "POST" });
  }

  return (
    <div className="page">
      <div className="top-bar">
        <div className="status-pill">
          <span>Call</span>
          <strong>{status.callStatus}</strong>
        </div>
        <div className="status-pill">
          <span className={`status-dot ${status.vadRemote === "SILENT" ? "silent" : ""}`} />
          <span>VAD</span>
          <strong>{status.vadRemote}</strong>
          <small>{status.vadProb.toFixed(2)}</small>
        </div>
        <div className="status-pill">
          <span>Media</span>
          <strong>CONNECTED</strong>
        </div>
      </div>

      <div className="content">
        <div className="panel">
          <h3>Call Controls</h3>
          <p>Fixed target number is configured in the media-service.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleStartCall}>Call</button>
            <button className="secondary" onClick={handleHangup}>
              Hangup
            </button>
          </div>
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
