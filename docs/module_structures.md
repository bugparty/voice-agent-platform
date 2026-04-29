## Technology Stack Statement

| Layer | Choice |
|------|------|
| Package management | pnpm workspaces |
| Frontend framework | Next.js 14+ (App Router) |
| State management | XState v5 |
| Backend runtime | Node.js 18+ / Python 3.10+ |
| Communication protocol | gRPC (bidirectional streaming) |
| VAD model | Silero VAD (ONNX) |

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## Recommended: Monorepo top-level structure


```bash
repo/
  apps/
    web/                      # Next.js UI + BFF endpoints
    media-service/            # Node: Twilio Media Streams WS + gRPC client + call control
    ai-audio-service/         # Python: gRPC server + VAD (+ room for ASR/classification)
  packages/
    proto/                    # .proto + generation scripts + generated artifacts (optional)
    event-schema/             # TS/Zod event contract + JSON schema + mock events
    shared-config/            # eslint/tsconfig/prettier (optional)
  infra/
    docker/                   # Dockerfiles
    compose/                  # docker-compose for local development
    k8s/                      # Use later when moving to Kubernetes
  scripts/                    # one-click startup, generation, formatting
  docs/
    architecture/             # your current architecture docs
    ui/                       # UI spec + screenshots
    runbooks/                 # local setup and troubleshooting
  .env.example
  README.md

```


---


## apps/web (Next.js: UI + lightweight BFF)


**Responsibilities**: UI, token issuance, TwiML webhook (you can also place Twilio webhooks here if you prefer)


```bash
apps/web/
  src/
    app/                      # App Router
      page.tsx                # Debug Console page
      api/
        token/route.ts        # Twilio Access Token
        twiml/route.ts        # Returns TwiML (voice webhook)
        events/route.ts       # (Optional) SSE/WebSocket gateway
    components/
      status/TopStatusBar.tsx
      panels/ControlPanel.tsx
      transcripts/LiveTranscripts.tsx
      timeline/EventTimeline.tsx
      input/CommandBar.tsx
    state/
      machines/
        callMachine.ts        # XState v5 call state machine
        agentMachine.ts       # Agent state machine
        vadMachine.ts         # VAD state machine
      actors.ts               # XState actors
      store.ts                # Global state store
    lib/
      twilio/                 # Device init and call helpers
      events/                 # event client, parsing, typing
      permissions/            # mic permissions + device selection
    types/
      ui.ts                   # UI state types (derived from event-schema)
  public/
  next.config.js

```


>
> Recommendation: make the UI “event-driven only” from day one, with all state derived from events (aligned with your UI spec).
>
>
>

---


## apps/media-service (Node: Twilio WS + gRPC client + Twilio control)


**Responsibilities**: Receive Twilio Media Streams (WS), forward audio to Python (gRPC streaming), receive VAD/ASR/agent events, then control Twilio (redirect/play/stop, etc.), and push unified events to the Web UI.


```bash
apps/media-service/
  src/
    index.ts                  # Entry point
    config/
      env.ts
    twilio/
      mediaWsServer.ts        # Receives Twilio media stream WS
      twiml.ts                # TwiML templates (listen/speak/transfer, etc.)
      callControl.ts          # Twilio REST API: redirect/hangup/play
      signatures.ts           # webhook signature verification (optional)
    grpc/
      client.ts               # gRPC bidi client (to ai-audio-service)
      codecs.ts               # codec enum mapping, pass-through
    sessions/
      sessionStore.ts         # in-memory/redis store
      types.ts
    events/
      bus.ts                  # internal event bus
      emitters/
        uiWs.ts               # pushes events to UI (WS/SSE)
        logs.ts               # writes to file/console
      normalize.ts            # unified event format (aligned with event-schema)
    agent/
      controller.ts           # agent state machine (if agent is not in Python)
  package.json

```


>
> Key point: `events/normalize.ts` converts incoming data from different sources (twilio/grpc/agent) into one event-schema before sending to UI.
>
> **Event naming conversion rules**:
> - gRPC layer: `UPPER_SNAKE_CASE` (e.g., `SPEECH_START`)
> - UI layer: `category.source.action` (e.g., `vad.remote.start`)
> - Conversion logic: `SPEECH_START` (source: remote) → `vad.remote.start`
>
>
>

---


## apps/ai-audio-service (Python: gRPC server + audio AI)


**Responsibilities**: Receive audio streams, decode/resample, run Silero VAD inference, and output VAD events. Natural extensions later: ASR, beep/busy classification, robot detector.


```bash
apps/ai-audio-service/
  ai_audio_service/
    __init__.py
    main.py                   # gRPC server entry
    config.py
    grpc/
      server.py               # gRPC bidi stream handler
      generated/              # protoc-generated *_pb2.py
    audio/
      decode_mulaw.py         # μ-law -> PCM16
      resample.py             # 8k -> 16k
      framing.py              # 10/20ms framing
    vad/
      silero_vad.py           # Silero VAD ONNX runtime wrapper
      state_machine.py        # hysteresis + min speech/silence
      types.py
    pipeline/
      session_context.py      # per-session buffers/state
      metrics.py              # latency counters
    tests/
  pyproject.toml

```


>
> Recommendation: Python should output only “audio AI events” (VAD/ASR/classification). Keep Twilio control/redirection in Node.
>
>
>

---


## packages/proto (cross-language contract: gRPC)


**Responsibilities**: The single source of truth `.proto` files plus generation scripts (TS + Python).


```bash
packages/proto/
  audioai/
    audioai.proto             # AudioChunk / VadEvent / (future AsrEvent)
  scripts/
    gen-ts.sh                 # Generates TS clients/types
    gen-py.sh                 # Generates Python *_pb2.py
  generated/
    ts/                       # (Optional) generated artifacts committed to repo
    py/

```


>
> In prototyping, you can commit generated outputs to the repository to simplify setup; later switch to build-time generation.
>
>
>

---


## packages/event-schema (UI/system event contract + mocks)


**Responsibilities**: Turn the event names/fields from your UI spec into verifiable schemas (TS/Zod/JSON Schema), and provide mock events so the UI can run first.


```bash
packages/event-schema/
  src/
    events.ts                 # event union types
    zod.ts                    # zod schema for runtime validation
    constants.ts              # event names
    mock/
      sample-session.jsonl    # a complete call event stream (JSON Lines)
      generators.ts           # generates mock stream
  package.json

```


>
> “Remote transcript, local transcript, agent plan, VAD state, user commands, button actions,” and similar concepts should all be uniformly defined here as events.
>
>
>

---


## infra/compose (one-command local run)


```bash
infra/compose/
  docker-compose.yml          # web + media-service + ai-audio-service + redis
infra/docker/
  web.Dockerfile
  media-service.Dockerfile
  ai-audio-service.Dockerfile

```


---


## docs (documentation locations)


```bash
docs/
  architecture/
    vad-grpc-architecture.md
  ui/
    ui-spec.md
  runbooks/
    local-dev.md
    twilio-setup.md
    troubleshooting.md

```


---


## In one sentence: how to define module boundaries


- **web**: only handles UI + small amount of BFF (token/twiml)
- **media-service**: all real-time system glue and call control lives here (Twilio WS, gRPC client, redirect, pushing UI events)
- **ai-audio-service**: all audio AI (VAD/ASR/classification) lives here
- **proto + event-schema**: these two contracts “lock” the system design and prevent coupling from exploding later


---
