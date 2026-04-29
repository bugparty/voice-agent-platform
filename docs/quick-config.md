# Quick Configuration Guide

## Set the Dial-Out Number

The system is currently configured to dial: **+1 (619) 859-7172**

### Method 1: Use Environment Variables (Recommended)

Create a `.env` file in the `apps/media-service` directory:

```bash
# Create .env file
cd apps/media-service
touch .env  # On Windows, use: type nul > .env
```

Edit the `.env` file and add the following:

```bash
# Twilio configuration (required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# Dial target number
FIXED_TO_NUMBER=+16198597172

# Public URL (for Twilio webhook, requires ngrok)
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
```

### Method 2: Modify Code Directly (Not Recommended)

If you do not want to use a `.env` file, you can modify `apps/media-service/src/config/env.js` directly:

```javascript
function getConfig() {
  return {
    // ... other config
    fixedToNumber: process.env.FIXED_TO_NUMBER || "+16198597172",  // add default value
    // ...
  };
}
```

---

## Complete `.env` Configuration Example

```bash
# ============================================
# Twilio basic configuration (required)
# ============================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# ============================================
# Phase 2: Conference features (optional)
# ============================================
# To allow web clients to join a call, configure the following:
# TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_API_SECRET=your_api_secret_here
# TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# Dial configuration
# ============================================
# Fixed dial-out number (called when clicking Call)
FIXED_TO_NUMBER=+16198597172

# ============================================
# Service configuration
# ============================================
# Public URL (Twilio webhook will call this address)
# For local development with ngrok: ngrok http 4001
# Then fill in the URL provided by ngrok, for example:
PUBLIC_BASE_URL=https://abc123.ngrok.io

# Service port (default 4001)
MEDIA_SERVICE_PORT=4001

# ============================================
# Audio AI configuration (optional)
# ============================================
# Whether to use Python VAD (false uses mock)
USE_PYTHON_VAD=false

# Python ai-audio-service endpoint
AI_AUDIO_GRPC_URL=localhost:50051
```

---

## Verify Configuration

After starting the service, check the logs:

```bash
pnpm --filter media-service start
```

You should see:

```
[media-service] Starting call {
  to: '+16198597172',    ← Confirm the number is correct
  from: '+1234567890',
  sessionId: 'sess_...',
  confName: 'conf_...'
}
```

---

## Expose Local Service with ngrok

```bash
# Install ngrok (if not installed yet)
# https://ngrok.com/download

# Start ngrok
ngrok http 4001

# Copy the Forwarding URL, for example:
# Forwarding: https://abc123.ngrok.io -> http://localhost:4001

# Set it in .env:
PUBLIC_BASE_URL=https://abc123.ngrok.io
```

**Note:** Each time ngrok restarts, the URL changes. You need to update the `.env` file and the TwiML App configuration in Twilio Console.

---

## Test Workflow

1. **Configure `.env`**
   ```bash
   cd apps/media-service
   # Edit .env and fill in configuration values
   ```

2. **Start ngrok** (if needed)
   ```bash
   ngrok http 4001
   # Copy URL to PUBLIC_BASE_URL in .env
   ```

3. **Start services**
   ```bash
   # Terminal 1: media-service
   pnpm --filter media-service start

   # Terminal 2: web UI
   pnpm --filter web dev
   ```

4. **Test dialing**
   - Open browser at http://localhost:3000
   - Click the "Call" button
   - Confirm that +16198597172 receives the call

5. **Test Conference** (Phase 2)
   - After call is connected
   - Click "Join Conference"
   - Speak and confirm the other side can hear you

---

## FAQ

### Q: How do I change the dial-out number?

**A:** Update `FIXED_TO_NUMBER` in the `.env` file, then restart media-service.

### Q: Is dynamic number input supported?

**A:** The current version uses a fixed number. To support dynamic input, you need to modify:
1. Add an input field in Web UI
2. Make `/call/start` API accept a `to` parameter
3. Update `apps/media-service/src/index.js`

### Q: What phone number format is required?

**A:** Use E.164 format: `+[country code][area code][number]`
- US: `+16198597172`
- China: `+8613812345678`

### Q: Why is my `.env` file not taking effect?

**A:** Make sure:
1. Filename is `.env` (no extension)
2. File is located in `apps/media-service/`
3. media-service was restarted
4. Use `console.log(config.fixedToNumber)` to verify it loaded
