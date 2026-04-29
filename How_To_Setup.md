# How to Set Up

Run these three services locally. Start each from its own directory.

---

## 1. AI VAD backend (Python)

Path: `apps/ai-audio-service`

```bash
cd apps/ai-audio-service
./start.sh      # Linux / macOS
.\start.ps1     # Windows (PowerShell)
```

## 2. Media Service backend (Node.js)

```bash
cd apps/media-service
pnpm i
pnpm run dev
```

## 3. Frontend (Next.js)

```bash
cd apps/web
pnpm i
pnpm run dev
```

---

Once all three are running, you can use the app. For Twilio, ngrok, and env config, see `README.md` and the `docs/` folder.
