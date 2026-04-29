# media-service

Node.js media service responsible for Twilio call control, Media Streams ingestion, and event distribution.

## Configuration

Create a `.env` file under `apps/media-service`:

```env
# Twilio base configuration
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Phase 2: Conference & Web Join (optional)
TWILIO_API_KEY=
TWILIO_API_SECRET=
TWILIO_TWIML_APP_SID=

# Fixed outbound target number
FIXED_TO_NUMBER=+16198597172

# Public base URL (for Twilio webhooks)
PUBLIC_BASE_URL=https://xxxx.ngrok.io

# Optional config
PORT=8787
AI_AUDIO_GRPC_ADDR=localhost:50051
```

## Quick dial target setup

Current fixed dial target: **+1 (619) 859-7172**.

To change it, edit `FIXED_TO_NUMBER` in `.env`.

## Start

```bash
# install dependencies at repo root
pnpm install

# start from repo root
pnpm --filter media-service dev

# or start inside apps/media-service
cd apps/media-service
pnpm dev
```

## API endpoints

- `POST /call/start` - Start outbound call
- `POST /call/hangup` - Hang up call
- `POST /call/dtmf` - Send DTMF digits
- `POST /twiml` - Legacy TwiML (backward compatibility)
- `POST /twiml/outbound` - PSTN leg Conference TwiML
- `POST /twiml/webJoin` - Web leg Conference TwiML
- `POST /token` - Create Twilio access token (for web join)
- `GET /events` - SSE event stream for Web UI
- `POST /ivr/next-digits` - Queue next digits to send after prompt
- `WS /media` - Twilio Media Streams WebSocket ingress

## Directory structure

- `src/config/env.js` - environment config
- `src/events/bus.js` - event bus
- `src/events/normalize.js` - event normalization
- `src/grpc/client.js` - gRPC client to ai-audio-service
- `src/vad/vadMock.js` - VAD mock
- `src/session/sessionStore.js` - session management
- `src/twilio/callControl.js` - Twilio call control
- `src/twilio/twiml.js` - TwiML generator
- `src/index.js` - main service entry

## Dependencies

- **ai-audio-service** (optional) - Python audio AI service (VAD/ASR)
- **Twilio** - telephony provider

## Development

### Logs

All key operations include logs with `[media-service]` prefix.

### Conference flow smoke test

1. Configure all required environment variables.
2. Start media-service.
3. Start Web UI.
4. Click `Call`.
5. Check logs for session creation and updates.
6. Click `Join Conference` to test web participant join.

### DTMF/IVR quick test checklist

1. Start media-service and web UI.
2. Click `Call`.
3. Enter digits in DTMF keypad.
4. Click `Send Now` or `Queue For Prompt`.
5. Verify `DTMF` and `IVR` timeline events.
6. Validate retry/escalation behavior on timeout or no response.

## Troubleshooting

See [`docs/phase2-setup.md`](../../docs/phase2-setup.md).
