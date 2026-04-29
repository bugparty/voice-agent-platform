# Outbound PSTN + User Voice Takeover: Implementation Guide

> Goal:
>
> * **Node.js media-service** handles outbound calling, call orchestration, Media Streams, and event distribution.
> * **Web UI** only provides controls (Call/Join/Mute/Hangup/DTMF/Agent Start-Pause...), and user voice goes directly into the call.
> * **Python ai-audio-service** only handles audio AI (VAD/ASR/classification), outputs events only, and does not control calls.
>
> Key principles:
>
> * **"Audio for AI"** goes through Media Streams (output path).
> * **"Audio for the callee"** goes through the Voice JS SDK (WebRTC → Twilio → PSTN). Do not try to feed microphone audio back into Media Streams.

---

## 1. High-Level Architecture

### 1.1 Component Responsibilities

* **Web (Next.js)**

  * Displays state (call / vad / asr / agent).
  * Provides controls and inputs (DTMF, commands, Join/Leave).
  * Uses the **Twilio Voice JS SDK** to join calls (sending the user's microphone into the call).

* **Node media-service**

  * Places outbound PSTN calls (`calls.create`).
  * Serves TwiML (attaches PSTN leg into a bridge).
  * Enables Media Streams and pushes PSTN audio to its own WS endpoint in real time.
  * Forwards WS audio to Python (gRPC bidi).
  * Normalizes AI + Twilio events and pushes them to Web (WS/SSE).

* **Python ai-audio-service**

  * μ-law decode / resample / VAD / ASR.
  * Outputs structured events (`vad.remote.start/end`, `asr.remote.partial/final`, ...).

### 1.2 Two Audio Paths (Must Be Separated)

* **Path A: Monitor (audio for AI)**

  * PSTN/Conference → Twilio Media Streams → Node WS → Python gRPC → AI events → Web UI

* **Path B: Speak (audio for callee)**

  * Web microphone → Twilio Voice JS SDK (WebRTC) → Twilio bridge (Conference recommended) → PSTN

---

## 2. Recommended Bridging Method: Conference

> Why this is recommended:
>
> * It allows the **PSTN callee** and **Web user** to join the same room.
> * Your UI only needs a Join/Leave button to support "take over speaking."
> * It matches your current product boundary: "Agent is silent by default and only assists."

### 2.1 Minimum Flow

1. User clicks **Call**

* Node creates `session_id` and `conf_name`.
* Node calls PSTN outbound; once answered, TwiML adds the PSTN leg to the conference.
* Media Streams starts at the same time (monitoring PSTN and/or one conference leg).

2. User clicks **Join**

* Web fetches token from Node.
* Web uses Voice JS SDK `device.connect()` to join the same conference.
* From this point, user microphone audio can go directly to PSTN.

3. User clicks **Mute / Unmute / Leave**

* All controlled on Web side via local microphone track (or built-in Twilio SDK mute).

---

## 3. Node Implementation Checklist (media-service)

### 3.1 Required Endpoints

* `POST /call/start`

  * Input: `to` (phone number)
  * Output: `{ session_id, conf_name, callSid }`

* `POST /twiml/outbound`

  * Callback after outbound Twilio call is connected; returns TwiML.
  * Goal: add PSTN leg into `conf_name` and enable `<Stream>`.

* `POST /token`

  * Called by Web when joining; returns Twilio access token.
  * Token must allow Web side to "dial" a TwiML App/Voice URL (or dial conference directly).

* `WS /media`

  * Twilio Media Streams ingress endpoint.
  * Receives `connected/start/media/stop` messages.
  * Base64-decodes `media.payload` into μ-law bytes.
  * Converts to `AudioChunk` and sends to Python gRPC.

* `WS/SSE /events`

  * Pushes normalized events to Web.

### 3.2 Session Structure (Minimum Fields)

* `session_id`
* `conf_name`
* `callSid` (PSTN leg)
* `streamSid` (Media Streams)
* `grpc_stream` (bidi stream to Python)
* `state` (`CALLING` / `IN_CALL` / `USER_JOINED` / `USER_LEFT` / `ENDING` ...)

### 3.3 TwiML: PSTN Leg Joins Conference + Stream

> Note: this sample focuses on structure. Add fields like `statusCallback`, `record`, `beep`, etc. as needed.

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR_PUBLIC_BASE/media">
      <Parameter name="session_id" value="{{SESSION_ID}}" />
      <Parameter name="role" value="pstn" />
    </Stream>
  </Connect>

  <Dial>
    <Conference>
      {{CONF_NAME}}
    </Conference>
  </Dial>
</Response>
```

> Notes:
>
> * In production, timing/order between `<Stream>` and `<Conference>` is often controlled more carefully.
> * You can also send the PSTN leg into conference first, then start stream on conference/participant level (depending on which leg you need to monitor).

### 3.4 Dial Target for Web Join Conference

Approach: let Web-side `device.connect()` trigger Twilio to request a Node TwiML endpoint; Node responds with TwiML that joins this Web leg to the same conference.

```xml
<Response>
  <Dial>
    <Conference>
      {{CONF_NAME}}
    </Conference>
  </Dial>
</Response>
```

Web includes `conf_name/session_id` as params in `connect`, and Node uses them to generate TwiML.

---

## 4. Web Implementation Checklist (Next.js UI)

### 4.1 Core Buttons Needed in UI

* **Call**: triggers `POST /call/start`
* **Join**: fetch token, init Device, `device.connect({ params: { conf_name, session_id }})`
* **Leave**: disconnect connection
* **Mute**: mute local microphone
* **Hangup**: triggers Node `POST /call/hangup` (optional)
* **DTMF keypad**: sends DTMF to PSTN leg (handled by Node)
* **Agent Start/Pause**: state switch only (Node decides whether auto DTMF/prompt playback is allowed)

### 4.2 UI Event-Driven Model

Web does not maintain "source-of-truth call state" by itself; it only consumes events pushed from Node:

* `twilio.call.status` (`connecting` / `in_call` / `ended`)
* `vad.remote.*` / `vad.local.*`
* `asr.remote.*` / `asr.local.*`
* `agent.phase` / `agent.plan` / `agent.speak.*`

---

## 5. Python Implementation Checklist (ai-audio-service)

### 5.1 gRPC Bidi

* Input: `AudioChunk(session_id, seq, codec=MULAW_8K, payload, timestamp_ms, track)`
* Output: `AiEvent(vad=..., asr=...)`

### 5.2 Suggested `track` Semantics

* `track = "remote"`: other side (PSTN callee / agent)
* `track = "local"`: local side (user microphone / or Twilio leg outbound)

> Note:
>
> * If you stream only PSTN via Media Streams, you'll likely receive mainly remote/inbound direction.
> * If AI must hear both sides, you need an extra stream for Web leg or a separate local Web upload path (not recommended).

---

## 6. Agent Only Needs Buttons: Minimal Control Surface

> Your current product boundary:
>
> * Agent is silent by default.
> * Agent only performs "explainable, reversible" actions when user presses buttons.

### 6.1 Suggested Button Action Set

* `agent.navigate_ivr_step`: sends a predefined DTMF sequence based on rules
* `agent.force_bargein`: stops playback/redirect
* `agent.pause`: fully stops automatic actions

### 6.2 Hard Boundaries on Node Side (Enforced)

* When entering `IDENTITY_VERIFICATION` or `HUMAN_REACHED`:

  * Force `agent.pause`
  * Disable automatic DTMF
  * Disable automatic TTS injection
  * Only allow captions/prompts (copilot mode)

---

## 7. Minimum Acceptance Criteria (MVP Checklist)

1. Click Call: PSTN callee phone rings and connects.
2. UI can display `callSid` and `in_call` state.
3. Media Streams WS receives `start/media`, and Python VAD outputs `vad.remote.start/end`.
4. Click Join: user speaks into microphone, callee can hear.
5. Click Mute: callee cannot hear user.
6. Click Hangup: call ends, WS/gRPC resources are cleaned up.

---

## 8. Common Pitfalls (Avoid in Advance)

* Do not treat "user microphone audio" as Media Streams input: Media Streams is **output for your monitoring**.
* In Conference mode, TwiML endpoints must be separated:

  * PSTN leg joins conference
  * Web leg joins conference
* If AI can only hear remote side and not local side: that's expected. Hearing both requires explicit additional design.
* Be strict about state cleanup: Twilio WS close, gRPC end, sessionStore cleanup.

---

## 9. Suggested File Locations for Direct Implementation

* `apps/media-service/src/twilio/twiml.ts`

  * `renderOutboundToConference(session)`
  * `renderWebJoinConference(session)`
* `apps/media-service/src/twilio/mediaWsServer.ts`

  * `onMediaMessage(session, msg)`
* `apps/media-service/src/sessions/sessionStore.ts`
* `apps/web/src/lib/twilio/device.ts`

  * `initDevice(token)`
  * `joinConference(confName, sessionId)`

---

## 10. Next-Step Extensions (Optional)

* Add `DTMF keypad` (UI → Node → Twilio) for manual IVR navigation
* Add classification for `beep/busy/ivr detector`
* Add `barge-in` (if VAD detects remote speech, redirect to stop playback)
* Add `event-schema` and UI timeline filters
