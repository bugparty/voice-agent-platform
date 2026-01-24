# 4-Service Architecture (Web UI + Node media-service + Python AI Audio + Python Agent)

> Goal: add an explicit **Agent Service** (Python) while keeping **Node media-service** as the single authoritative orchestrator that executes telephony actions.

---

## 0. Services

### A) Web UI (Next.js)

**Role:** Remote control + observability console.

* Sends **intent commands** (call/hangup/start agent/execute suggestion).
* Renders **authoritative state/events** pushed from Node.
* Handles **browser-local** concerns (mic permission, device selection, UI-only filters).

### B) media-service (Node.js)

**Role:** **Authoritative orchestrator** and policy gate.

* Owns call/session truth: `callSid`, `streamSid`, phase, timers.
* Integrates with Twilio: REST + TwiML + Media Streams (WS).
* Streams audio to AI Audio Service.
* Maintains and enforces **safety boundaries** (IVR vs HUMAN vs COPILOT).
* Pushes normalized events to the Web UI.
* Feeds structured context to Agent Service.
* **Executes** actions (DTMF, redirect/barge-in, play TTS, hangup/transfer).

### C) ai-audio-service (Python)

**Role:** Audio AI only.

* Decodes μ-law, resamples, frames.
* Runs VAD (and later ASR/classification).
* Emits structured audio events (VAD/ASR), never telephony control.

### D) agent-service (Python)

**Role:** Planning + suggestion only.

* Consumes structured context (transcripts, phase, constraints).
* Produces structured **suggestions** (plan + proposed actions).
* **Never** calls Twilio directly.
* Node decides what is allowed to execute.

---

## 1. Key Principle: Suggest vs Execute

* **Agent Service suggests**: “Say this”, “Press 2”, “Ask user to take over”.
* **Node executes** (after policy checks): Twilio DTMF, TwiML redirect, TTS, etc.
* **UI displays** and can request execution, but cannot directly operate Twilio.

---

## 2. High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Web UI (Next.js)                            │
│  - Control buttons  - Status bar  - Transcripts  - Timeline          │
│  - Device/mic permission (browser-local)                             │
└───────────────┬──────────────────────────────────────────────────────┘
                │ (1) UI Commands (HTTP/WS)
                │ (2) Events Push (WS/SSE)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Node.js media-service (Authoritative)           │
│  Twilio REST + TwiML + MediaStreams WS                               │
│  Session store + Phase machine + Policy gate + Event normalize       │
│  - streams audio to ai-audio-service (gRPC bidi)                     │
│  - streams context to agent-service (gRPC/HTTP)                      │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ (3) Audio chunks (gRPC bidi)   │ (4) Context / Ask
                ▼                               ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Python ai-audio-service       │       │ Python agent-service         │
│ - decode/resample/frame       │       │ - planning + suggestions     │
│ - VAD (+ASR later)            │       │ - outputs structured actions │
│ - emits audio events          │       │ - never touches Twilio       │
└───────────────┬──────────────┘       └───────────────┬──────────────┘
                │ (5) Audio events (gRPC)               │ (6) Suggestions
                └───────────────────────────────┬───────┘
                                                ▼
                                    (Node policy gate + execution)
                                                │
                                                ▼
                                          Twilio actions
```

---

## 3. Data Contracts

### 3.1 UI ⇄ Node

#### UI → Node (intent commands)

Examples:

* `ui.call.start {to}`
* `ui.call.hangup {sessionId}`
* `ui.agent.start {sessionId}`
* `ui.agent.pause {sessionId}`
* `ui.agent.executeSuggestion {sessionId, suggestionId, actionId}`

#### Node → UI (authoritative events)

* `twilio.call.status` (connecting/in_call/ending)
* `twilio.stream.status` (connected/disconnected)
* `pipeline.health` (media/grpc/asr/tts)
* `vad.remote.*` / `vad.local.*`
* `asr.remote.partial/final` / `asr.local.partial/final`
* `agent.phase` / `agent.plan` / `agent.speak.partial/final`
* `agent.suggestion` (plan + actions)
* `error.*`

**Rule:** UI state is derived from these events; it is not the source of truth.

---

### 3.2 Node ⇄ AI Audio (gRPC bidi)

**Node → AI Audio:** `AudioChunk(session_id, seq, codec, payload, timestamp_ms, track)`

**AI Audio → Node:** `AiEvent` (oneof: `VadEvent`, later `AsrEvent`, etc.)

**Rule:** AI Audio never triggers telephony operations directly.

---

### 3.3 Node ⇄ Agent (Python)

#### Option A (recommended): gRPC (request/stream)

Two common patterns:

1. **Request/Response** for each decision:

* Node sends `AgentRequest{session_id, phase, constraints, transcript_summary, last_events}`
* Agent returns `AgentSuggestion{suggestion_id, plan, actions[], confidence}`

2. **Streaming context** + streaming suggestions:

* Node streams `AgentContextUpdate` events (transcripts, phase changes)
* Agent streams `AgentSuggestion` as they are produced

#### Option B: HTTP

* `/suggest` endpoint with JSON payload; simpler for hackathon but less real-time.

**AgentRequest should include:**

* `session_id`, `call_phase` (IVR/HUMAN/COPILOT)
* `constraints.allowed_actions[]`
* transcripts (remote/local latest + history summary)
* current goal/scenario (e.g. “pharmacy pickup status”)
* last executed actions (DTMF digits, last TTS)

**AgentSuggestion should include:**

* `plan` (short)
* `actions[]` (structured)

  * `SAY_TTS{text}`
  * `SEND_DTMF{digits}`
  * `WAIT{reason}`
  * `REQUEST_USER_TAKEOVER{reason}`
  * `COPILOT_HINT{text}`
* `confidence`

---

## 4. Call Phases and Policy Gate (Node)

### 4.1 Phases

* **IVR**: automated menus. Node may execute DTMF/TTS that is allowed by rules.
* **HUMAN**: human agent reached or identity verification requested.
* **COPILOT**: AI is display-only; user speaks; AI provides captions/hints.

### 4.2 Policy Gate

Node enforces hard rules:

* In **HUMAN**/**COPILOT**: disallow `SAY_TTS` and `SEND_DTMF` unless explicitly permitted.
* When identity verification detected: force `REQUEST_USER_TAKEOVER`.
* If pipeline degraded: pause agent and notify UI.

Node writes every allow/deny decision into Timeline:

* `agent.action.allowed`
* `agent.action.denied {reason}`

---

## 5. End-to-End Event Flow (Typical)

1. UI: `ui.call.start`
2. Node: Twilio call start → emits `twilio.call.start` to UI
3. Twilio Media Streams → Node WS → Node streams AudioChunk to AI Audio
4. AI Audio emits `vad.remote.start` → Node forwards to UI
5. ASR (later) emits `asr.remote.final` → Node updates context and calls Agent
6. Agent returns `AgentSuggestion(plan + actions)`
7. Node policy gate → executes allowed actions (DTMF/TTS)
8. Node emits `agent.phase`, `agent.plan`, `agent.speak.*`, timeline entries

---

## 6. Deployment Notes (Hackathon-Friendly)

* Run **4 processes** locally with pnpm + python venv.
* Use ngrok (or Cloudflare Tunnel) for Twilio webhooks to Node.
* Keep Agent and AI Audio separate even if both are Python: different ports, separate responsibilities.

Suggested ports:

* Web UI: 3000
* Node media-service: 4001 (HTTP) + 4002 (WS) (or same)
* AI Audio gRPC: 50051
* Agent gRPC/HTTP: 50052

---

## 7. Minimal Directory Additions

If you keep current monorepo shape:

```
apps/
  web/
  media-service/
  ai-audio-service/
  agent-service/      # NEW (Python)
packages/
  proto/              # add agent.proto if using gRPC
  event-schema/
```

---

## 8. Implementation Checklist (Shortest Path)

1. Define `call_phase` in Node session state and emit it to UI.
2. Add `agent-service` with a `/suggest` (HTTP) or `Suggest()` (gRPC) endpoint.
3. In Node, on `asr.remote.final` (or a placeholder event), call Agent.
4. Implement policy gate + execution mapping in Node.
5. Emit timeline events for: request → suggestion → allow/deny → executed.

---

## 9. Audio Pipeline (Authoritative, Merged)

This chapter is the **single source of truth** for real-time audio handling, VAD/ASR events, barge-in behavior, and how audio-driven events trigger the Agent.

---

## 9.1 End-to-End Audio Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Next.js)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 通话控制按钮 │  │ VAD 状态显示 │  │ 转写文本显示 │  │ Agent 状态/Timeline │ │
│  └──────┬──────┘  └──────▲──────┘  └──────▲──────┘  └──────────▲──────────┘ │
│         │ HTTP/WS        │ WS             │ WS                  │ WS         │
│         │ 命令           │ 事件           │ 事件                │ 事件       │
└─────────┼────────────────┼────────────────┼─────────────────────┼───────────┘
          │                │                │                     │
          ▼                │                │                     │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Node.js media-service (Authoritative)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ HTTP API     │  │ Twilio REST  │  │ WS Server    │  │ 事件总线         │ │
│  │ (命令接收)   │  │ (发起呼叫)   │  │ (Media Stream)│  │ (normalize+推送) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                 │                    │           │
│         │    ┌────────────┴─────────────────┤                    │           │
│         │    │                              │                    │           │
│         │    ▼                              ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Session Manager                                   │   │
│  │  - callSid / streamSid / phase                                        │   │
│  │  - per-session gRPC streams                                           │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │ gRPC bidi stream                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Python ai-audio-service                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ gRPC Server  │  │ 音频解码     │  │ Silero VAD   │  │ VAD 状态机       │ │
│  │ (bidi stream)│  │ μ-law→PCM    │  │ (ONNX)       │  │ (hysteresis)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9.2 Twilio Media Streams → Node

* Twilio sends WebSocket events: `connected`, `start`, `media`.
* `media.payload` is **base64 μ-law @ 8kHz**, typically 20ms per frame.

Node responsibilities:

* Maintain authoritative session state (`callSid`, `streamSid`, `phase`).
* Decode base64 → raw bytes.
* Wrap audio into `AudioChunk` messages.
* Preserve ordering via monotonically increasing `seq`.
* Assign `track`:

  * `inbound` = remote speaker
  * `outbound` = local mic (if present)

---

## 9.3 Node → AI Audio (gRPC bidi)

Node streams audio frames to Python via a **bidirectional gRPC stream**.

### Audio Framing

| Stage        | Sample Rate  | Frame Size          |
| ------------ | ------------ | ------------------- |
| Twilio input | 8 kHz μ-law  | 20 ms (160 samples) |
| Resampled    | 16 kHz PCM16 | 20 ms (320 samples) |
| VAD window   | 16 kHz PCM16 | 32 ms (512 samples) |

### Silero VAD Parameters (example)

* `START_THRESHOLD = 0.6`
* `END_THRESHOLD = 0.3`
* `MIN_SPEECH_MS = 200`
* `MIN_SILENCE_MS = 300`

AI Audio emits structured `AiEvent` messages only.

---

## 9.4 gRPC Contract (AudioAI)

```protobuf
syntax = "proto3";

package audioai;

service AudioAI {
  rpc Stream(stream AudioChunk) returns (stream AiEvent);
}

enum Codec {
  CODEC_UNSPECIFIED = 0;
  MULAW_8K = 1;
  PCM16_8K = 2;
  PCM16_16K = 3;
}

message AudioChunk {
  string session_id = 1;
  uint32 seq = 2;
  Codec codec = 3;
  bytes payload = 4;
  uint64 timestamp_ms = 5;
  string track = 6; // inbound / outbound
}

enum VadEventType {
  VAD_EVENT_UNSPECIFIED = 0;
  SPEECH_START = 1;
  SPEECH_UPDATE = 2;
  SPEECH_END = 3;
}

message AiEvent {
  string session_id = 1;
  uint64 timestamp_ms = 2;
  oneof event {
    VadEvent vad = 10;
    // future: AsrEvent, ClassifyEvent
  }
}

message VadEvent {
  VadEventType type = 1;
  float probability = 2;
  string track = 3;
}
```

---

## 9.5 Event Mapping (AI → Node → UI)

| gRPC Event      | Track    | UI Event            | Meaning                 |
| --------------- | -------- | ------------------- | ----------------------- |
| `SPEECH_START`  | inbound  | `vad.remote.start`  | Remote started speaking |
| `SPEECH_UPDATE` | inbound  | `vad.remote.update` | Remote speaking         |
| `SPEECH_END`    | inbound  | `vad.remote.end`    | Remote stopped          |
| `SPEECH_START`  | outbound | `vad.local.start`   | Local mic started       |
| `SPEECH_UPDATE` | outbound | `vad.local.update`  | Local mic speaking      |
| `SPEECH_END`    | outbound | `vad.local.end`     | Local mic stopped       |

Node normalizes all events before pushing them to UI.

---

## 9.6 Agent Trigger Point (Critical)

**Authoritative trigger:**

* `asr.remote.final`

**Fallback / equivalent:**

* `vad.remote.end` **AND** last ASR segment is stable

At this moment, Node:

1. Freezes the remote utterance.
2. Aggregates context (recent history, call phase, constraints).
3. Sends an `AgentRequest` to agent-service.

The Agent never listens to raw audio directly.

---

## 9.7 Barge-in Mechanism (Authoritative)

### Trigger

* Receive `vad.remote.start`
* Current Node state: `agentPhase = SPEAKING`

### Action (Node-only)

```
ai-audio-service    media-service         Twilio            Browser
       │                  │                  │                  │
       │                  │ <Play> TTS       │                  │
       │                  │<─────────────────│                  │
       │ SPEECH_START     │                  │                  │
       │ (inbound)        │                  │                  │
       │─────────────────>│                  │                  │
       │                  │ calls.update()   │                  │
       │                  │ url:/twiml/redirect                  │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │ WS: agent.interrupted                │
       │                  │───────────────────────────────────>│
```

### TwiML Used

```xml
<Response>
  <Connect>
    <Stream url="wss://your-domain.com/media" />
  </Connect>
</Response>
```

Node emits `agent.interrupted` into the timeline.

---

## 9.8 Failure Handling

| Failure         | Detection    | Strategy                   |
| --------------- | ------------ | -------------------------- |
| gRPC drop       | stream error | Reconnect (≤3 attempts)    |
| AI Audio crash  | timeout      | Disable VAD, continue call |
| Frame loss      | seq gap      | Log + continue             |
| Twilio WS close | close event  | End session                |

---

## 9.9 Performance Targets

| Path                 | Target   |
| -------------------- | -------- |
| Audio → VAD event    | < 50 ms  |
| VAD → UI             | < 20 ms  |
| VAD start → barge-in | < 100 ms |

---

## 9.10 Summary

* Node is the **only executor**.
* Python AI Audio is a **pure signal processor**.
* Agent is triggered by **finalized linguistic events**, not audio frames.
* UI consumes normalized events only.

This chapter supersedes all previous standalone “Audio Pipeline” documents.
