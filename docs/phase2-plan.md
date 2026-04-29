# Phase 2: Twilio Conference + Web Voice Access Implementation Plan

> Goal: Integrate Twilio Conference into the Node.js media-service, and implement Twilio Voice SDK-based microphone/speaker functionality in the Web UI so users can join calls from the browser and speak directly with the PSTN callee.

---

## 0. Architecture Overview

### Two Audio Paths

| Direction | Audio Path | Node.js Role |
|------|----------|--------------|
| **User speaking → PSTN** | Web → Twilio (WebRTC) → Conference → PSTN | Only provides token; does not handle audio |
| **PSTN → AI analysis** | PSTN → Media Streams → Node → Python | Forwards audio to AI |
| **PSTN → User listening** | Conference → Twilio (WebRTC) → Web | Does not handle audio |

### Sequence Diagram

```
User (Web UI)          media-service          Twilio              PSTN Callee
     │                      │                   │                      │
     │ POST /call/start     │                   │                      │
     │─────────────────────>│                   │                      │
     │                      │ calls.create      │                      │
     │                      │──────────────────>│                      │
     │                      │                   │ GET /twiml/outbound  │
     │                      │<──────────────────│                      │
     │                      │ TwiML (Conf+Stream)                      │
     │                      │──────────────────>│                      │
     │                      │                   │ PSTN dial            │
     │                      │                   │─────────────────────>│
     │                      │ WS /media         │                      │
     │                      │<──────────────────│ Media Streams        │
     │                      │                   │                      │
     │ POST /token          │                   │                      │
     │─────────────────────>│                   │                      │
     │ Access Token         │                   │                      │
     │<─────────────────────│                   │                      │
     │                      │                   │                      │
     │ Voice SDK connect    │                   │                      │
     │─────────────────────────────────────────>│                      │
     │                      │ GET /twiml/webJoin│                      │
     │                      │<──────────────────│                      │
     │                      │ TwiML (join conf) │                      │
     │                      │──────────────────>│                      │
     │                      │                   │                      │
     │<═══════════════════ WebRTC audio ═══════════════════════════════>│
```

---

## 1. Node.js media-service Changes

### 1.1 Session Store Extension

Extend `apps/media-service/src/sessions/sessionStore.js` with conference-related fields:

```javascript
{
  sessionId,      // UUID (new)
  confName,       // conference name (new)
  callSid,        // PSTN leg
  streamSid,      // Media Streams
  webCallSid,     // Web leg - after user joins (new)
  state,          // CALLING | IN_CALL | USER_JOINED | USER_LEFT | ENDING (new)
  createdAt,
  callStartAt,
  lastAudioAt,
  grpcStream,
  seq
}
```

### 1.2 TwiML Endpoint Refactor

Modify `apps/media-service/src/twilio/twiml.js` and split into two TwiML builders:

#### buildOutboundConferenceTwiml(session)

PSTN leg joins conference + starts Media Stream:

```xml
<Response>
  <Start>
    <Stream url="wss://YOUR_PUBLIC_BASE/media">
      <Parameter name="session_id" value="{{SESSION_ID}}" />
    </Stream>
  </Start>
  <Dial>
    <Conference>{{CONF_NAME}}</Conference>
  </Dial>
</Response>
```

#### buildWebJoinConferenceTwiml(session)

Web leg joins the same conference:

```xml
<Response>
  <Dial>
    <Conference>{{CONF_NAME}}</Conference>
  </Dial>
</Response>
```

### 1.3 Add API Endpoints

Add the following in `apps/media-service/src/index.js`:

| Endpoint | Method | Purpose |
|------|------|------|
| `/twiml/outbound` | POST | Returns Conference TwiML after PSTN is connected |
| `/twiml/webJoin` | POST | Returns Conference TwiML when Web SDK connects |
| `/token` | POST | Generates Twilio Access Token for the web client |

### 1.4 Token Generation

Use `twilio.jwt.AccessToken` to generate a token with Voice Grant:

```javascript
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

function generateToken(identity) {
  const token = new AccessToken(
    config.twilioAccountSid,
    config.twilioApiKey,
    config.twilioApiSecret,
    { identity }
  );
  
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: config.twilioTwimlAppSid,
    incomingAllow: false
  });
  
  token.addGrant(voiceGrant);
  return token.toJwt();
}
```

---

## 2. Web UI Implementation

### 2.1 Install Dependency

```bash
cd apps/web
pnpm add @twilio/voice-sdk
```

### 2.2 Twilio Device Management Module

Create `apps/web/src/lib/twilio/device.ts`:

```typescript
import { Device, Call } from '@twilio/voice-sdk';

let device: Device | null = null;
let activeCall: Call | null = null;

export async function initDevice(token: string): Promise<Device> {
  device = new Device(token, {
    codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU]
  });
  
  await device.register();
  return device;
}

export async function joinConference(sessionId: string): Promise<Call> {
  if (!device) throw new Error('Device not initialized');
  
  activeCall = await device.connect({
    params: { sessionId }
  });
  
  return activeCall;
}

export function leaveConference(): void {
  activeCall?.disconnect();
  activeCall = null;
}

export function toggleMute(): boolean {
  if (!activeCall) return false;
  const isMuted = activeCall.isMuted();
  activeCall.mute(!isMuted);
  return !isMuted;
}

export function getDevice(): Device | null {
  return device;
}
```

### 2.3 Audio Permission Management

Create `apps/web/src/lib/permissions/audio.ts`:

```typescript
export type PermissionState = 'granted' | 'prompt' | 'denied';

export async function requestMicPermission(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return 'granted';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return 'denied';
    }
    throw err;
  }
}

export async function getAudioDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
}
```

### 2.4 UI Control Enhancements

Add the following in `apps/web/src/app/page.tsx`:

- **Join / Leave button** - User joins/leaves the call
- **Mute button** - Mute microphone
- **Device selector** - Select microphone/speaker (optional)
- **Connection status indicator** - Show web leg connection status

---

## 3. Environment Configuration

### 3.1 Add Environment Variables

Add to `apps/media-service/src/config/env.js`:

```
TWILIO_TWIML_APP_SID    # TwiML App SID (must be created in Twilio Console)
TWILIO_API_KEY          # API Key
TWILIO_API_SECRET       # API Secret
```

### 3.2 Twilio Console Configuration

1. **Create a TwiML App**
   - Go to Twilio Console → Voice → TwiML Apps
   - Create a new app, set Voice URL to `https://YOUR_PUBLIC_BASE/twiml/webJoin`
   - Record the App SID

2. **Create an API Key**
   - Go to Twilio Console → Account → API Keys
   - Create a Standard API Key
   - Record the Key SID and Secret

---

## 4. Event Flow Enhancements

Extend event types to support conference states:

```javascript
// New event types
'conference.user.joined'   // User joined
'conference.user.left'     // User left
'conference.user.muted'    // User muted
'conference.user.unmuted'  // User unmuted
```

---

## 5. Implementation Order

| No. | Task | Dependencies |
|------|------|------|
| 1 | Extend `sessionStore.js` with `confName` / `sessionId` / `state` fields | - |
| 2 | Refactor `twiml.js` to support combined Conference + Stream TwiML | - |
| 3 | Add `/twiml/outbound` endpoint to handle PSTN leg joining conference | 1, 2 |
| 4 | Create TwiML App and API Key in Twilio Console | - |
| 5 | Add `/token` endpoint to generate Twilio Access Token | 1, 4 |
| 6 | Add `/twiml/webJoin` endpoint to handle web leg joining conference | 2 |
| 7 | Create web Twilio Device management module (`device.ts`) | 5 |
| 8 | Create microphone permission management module (`audio.ts`) | - |
| 9 | Implement Join/Leave/Mute buttons and device selection UI | 7, 8 |
| 10 | Extend event bus with conference state events | 6 |

---

## 6. Acceptance Criteria

1. ✅ Click **Call**: PSTN callee answers, UI shows `IN_CALL`
2. ✅ Click **Join**: User microphone is connected, callee can hear the user
3. ✅ Click **Mute**: Callee cannot hear the user
4. ✅ Click **Leave**: User exits, PSTN call remains active
5. ✅ Click **Hangup**: Entire call ends

---

## 7. Future Extensions (Out of Scope for Phase 2)

- AI TTS output to PSTN (Option A: TwiML redirect / Option B: bidirectional Media Streams)
- DTMF keypad (UI → Node → Twilio)
- Local VAD (requires additional Media Stream or local processing)
- Call recording
