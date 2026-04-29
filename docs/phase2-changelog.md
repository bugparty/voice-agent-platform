# Phase 2 Changelog

## Overview

Phase 2 introduces Twilio Conference integration and web-based user voice access, allowing users to join calls directly from the browser and talk with PSTN callees.

---

## Major Changes

### 1. Node.js media-service refactor

#### 1.1 Session Store extensions
**File:** `apps/media-service/src/sessions/sessionStore.js`

**New features:**
- `sessionId` - globally unique session identifier
- `confName` - Twilio Conference name
- `webCallSid` - Call SID of the web leg
- `state` - session state machine (CALLING/IN_CALL/USER_JOINED/ENDING)
- `generateSessionId()` - generates a unique session ID
- `generateConfName()` - generates a conference name based on session ID
- `getSessionByCallSid()` - retrieves a session by Call SID
- `getSessionBySessionId()` - retrieves a session by Session ID

**Impact:**
- All sessions now include unique `sessionId` and `confName`
- Session lookup now supports multiple query methods

#### 1.2 TwiML generator refactor
**File:** `apps/media-service/src/twilio/twiml.js`

**New functions:**
- `buildOutboundConferenceTwiml()` - generates TwiML for PSTN leg to join conference
  - Enables Media Streams at the same time (for AI monitoring)
  - Configures conference parameters
- `buildWebJoinConferenceTwiml()` - generates TwiML for web leg to join conference

**Retained function:**
- `buildTwiml()` - backward-compatible TwiML generator

#### 1.3 New API endpoints
**File:** `apps/media-service/src/index.js`

| Endpoint | Method | Purpose |
|------|------|------|
| `/twiml/outbound` | POST | Returns Conference TwiML for PSTN leg |
| `/twiml/webJoin` | POST | Returns Conference TwiML for web leg |
| `/token` | POST | Generates Twilio Access Token |

**Modified endpoint:**
- `/call/start` - now returns `sessionId` and `confName`

#### 1.4 Environment configuration extensions
**File:** `apps/media-service/src/config/env.js`

**New environment variables:**
```
TWILIO_API_KEY          # Twilio API Key SID
TWILIO_API_SECRET       # Twilio API Secret
TWILIO_TWIML_APP_SID    # TwiML App SID
```

#### 1.5 Event system extensions
**File:** `apps/media-service/src/events/normalize.js`

**New event generator:**
- `conferenceEvent()` - generates conference-related events

**New event types:**
- `conference.user.joined`
- `conference.user.left`
- `conference.user.muted`
- `conference.user.unmuted`

---

### 2. Web UI implementation

#### 2.1 Twilio Device management module
**File:** `apps/web/src/lib/twilio/device.ts` (new)

**Exported functions:**
- `initDevice(token, callbacks)` - initializes Twilio Device
- `joinConference(sessionId)` - joins conference
- `leaveConference()` - leaves conference
- `toggleMute()` - toggles mute state
- `isMuted()` - gets current mute state
- `getDevice()` / `getActiveCall()` - gets instances
- `destroyDevice()` - cleans up resources

**Type definitions:**
- `DeviceStatus` - device status enum
- `DeviceCallbacks` - callback interface

#### 2.2 Audio permission management module
**File:** `apps/web/src/lib/permissions/audio.ts` (new)

**Exported functions:**
- `requestMicPermission()` - requests microphone permission
- `checkMicPermission()` - checks permission status
- `getAudioDevices()` - gets list of audio devices
- `setAudioOutputDevice()` - sets audio output device

**Type definitions:**
- `PermissionState` - permission state enum

#### 2.3 UI component updates
**File:** `apps/web/src/app/page.tsx`

**New state:**
- `callState` - call state (includes sessionId, confName)
- `userState` - user state (deviceStatus, micPermission, isMuted)
- `error` - error message

**New controls:**
- **Join Conference** button - joins the call
- **Leave** button - leaves the call
- **Mute** button - toggles mute
- Session/Conference information display
- User status indicator
- Error alert bar

**New interactions:**
- Automatically request microphone permission
- Fetch token and initialize Device
- Conference join/leave flow
- Mute state management

#### 2.4 Dependency updates
**File:** `apps/web/package.json`

**New dependency:**
```json
{
  "@twilio/voice-sdk": "^2.11.2"
}
```

---

## Architecture Change Summary

### Audio paths

#### Before (Phase 1)
```
PSTN → Media Streams → Node → Python AI
```

#### Now (Phase 2)
```
Path A (monitoring): 
PSTN → Conference → Media Streams → Node → Python AI → VAD/ASR events

Path B (user speaking):
Web microphone → Twilio Voice SDK (WebRTC) → Conference → PSTN

Path C (user listening):
PSTN → Conference → Twilio (WebRTC) → Web speaker
```

**Key features:**
- Node.js does **not** handle user audio streams directly (lower latency)
- Users and PSTN parties talk directly in Twilio Conference
- AI continues monitoring PSTN audio through Media Streams

---

## Backward Compatibility

### Retained functionality
- `/twiml` endpoint (legacy)
- `buildTwiml()` function
- Existing session creation logic (fallback)

### Incompatible changes
- No breaking changes
- Legacy flow remains available

---

## Test Checklist

- [x] PSTN outbound call succeeds
- [x] Media Streams connect correctly
- [x] VAD events are pushed correctly
- [x] Web token generation
- [x] Web Device initialization
- [x] User joins conference
- [x] Bidirectional audio between user and PSTN
- [x] Mute functionality
- [x] Leave conference
- [x] Hangup cleanup

---

## Known Limitations

1. **Local VAD not implemented** - currently only monitors PSTN audio, not user microphone
   - Monitoring user audio requires additional Media Stream configuration
2. **AI TTS output not implemented** - Agent cannot proactively speak yet
   - Can be implemented via TwiML redirect or bidirectional Media Streams
3. **Device selection not implemented** - users cannot manually switch microphone/speaker
   - Requires adding a device selector in UI

---

## File List

### New files
```
apps/web/src/lib/twilio/device.ts
apps/web/src/lib/permissions/audio.ts
docs/phase2-plan.md
docs/phase2-setup.md
docs/phase2-changelog.md
```

### Modified files
```
apps/media-service/src/sessions/sessionStore.js
apps/media-service/src/twilio/twiml.js
apps/media-service/src/config/env.js
apps/media-service/src/events/normalize.js
apps/media-service/src/index.js
apps/web/src/app/page.tsx
apps/web/package.json
```

---

## Configuration Checklist

### Twilio Console
- [x] Create TwiML App
- [x] Configure Voice URL to point to `/twiml/webJoin`
- [x] Create API Key & Secret

### Environment variables
