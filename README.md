# CallBuddy for Access
 
##  pitch
Waiting on the phone is a tax on people who can least afford it.

Many low-income residents, seniors, and non-native English speakers struggle to access basic community resources—not because they don’t exist, but because everything requires long, stressful phone calls.

Our project helps users navigate phone calls without replacing them.
We use AI to prepare call scripts, wait through automated systems, and summarize essential information—while clearly disclosing that it’s an AI assistant and allowing the user to stay in control at all times.

The result: fewer missed resources, less anxiety, and more equitable access to help that already exists.

This is not about replacing humans—it’s about giving people their time and dignity back.


## Architecture

- **Node.js** (Twilio Media Streams, gRPC client, call control)
- **Python** (Silero VAD, audio processing, AI inference)
- **Next.js** (Debug Console UI with XState v5)

## Tech Stack

- **Package Manager**: pnpm workspaces
- **Frontend**: Next.js 14+ (App Router), XState v5
- **Backend**: Node.js 18+, Python 3.10+
- **Communication**: gRPC (bidirectional streaming)
- **VAD Model**: Silero VAD (ONNX)

## Project Structure

```
voip_agent/
├── apps/
│   ├── web/                 # Next.js UI + BFF
│   ├── media-service/       # Node: Twilio WS + gRPC client
│   └── ai-audio-service/    # Python: gRPC server + VAD
├── packages/
│   ├── proto/               # gRPC .proto definitions
│   ├── event-schema/        # Event contracts (TS/Zod)
│   └── shared-config/       # Shared configs
├── infra/
│   ├── docker/              # Dockerfiles
│   ├── compose/             # docker-compose
│   └── k8s/                 # Kubernetes (future)
├── scripts/                 # Utility scripts
└── docs/                    # Documentation
```

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a `.env` with your Twilio credentials (see template below)

3. Start services:
   ```bash
   # Start media service
   pnpm --filter media-service dev

   # Start python mock VAD service
   python -m venv .venv
   .\\.venv\\Scripts\\Activate.ps1
   pip install -r apps/ai-audio-service/requirements.txt
   python apps/ai-audio-service/ai_audio_service/main.py

   # Start web
   pnpm --filter web dev
   ```

## Local Twilio + ngrok setup

1. Run ngrok:
   ```bash
   ngrok http 4001
   ```
2. Set `PUBLIC_BASE_URL` to your ngrok https URL.
3. Configure Twilio Voice webhook (or let `/call/start` create outbound calls).
4. Use the Web UI Call button to dial the fixed number.

## .env template

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+15550001111
FIXED_TO_NUMBER=+15550002222
PUBLIC_BASE_URL=https://your-ngrok-domain.ngrok-free.app
MEDIA_SERVICE_PORT=4001
MEDIA_WS_PATH=/media
EVENTS_PATH=/events
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:4001
USE_PYTHON_VAD=true
AI_AUDIO_GRPC_URL=localhost:50051
```

## Documentation

See `docs/` for detailed architecture and module structure documentation.
