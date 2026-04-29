# Phase 2 Setup Guide

This document explains how to configure the Twilio Console and set environment variables to enable Conference functionality.

---

## 1. Twilio Console Setup

### 1.1 Create a TwiML App

1. Sign in to [Twilio Console](https://console.twilio.com/)
2. Go to **Voice → TwiML Apps**
3. Click **Create new TwiML App**
4. Fill in the form:
   - **Friendly Name**: `voip-agent-web-join` (or any name)
   - **Voice Configuration - Request URL**: `https://YOUR_PUBLIC_BASE/twiml/webJoin`
   - **HTTP Method**: `POST`
5. Click **Save**
6. **Record the App SID** (format: `APxxxx...`)

### 1.2 Create an API Key

1. In Twilio Console, go to **Account → API Keys & Tokens**
2. Click **Create API Key**
3. Fill in the form:
   - **Friendly Name**: `voip-agent-api-key` (or any name)
   - **Key Type**: select **Standard**
4. Click **Create**
5. **Copy and save the Key SID and Secret immediately** (the Secret is shown only once!)

---

## 2. Environment Variable Setup

### 2.1 media-service Environment Variables

Add the following variables to `apps/media-service/.env`:

```bash
# Existing variables (keep unchanged)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
FIXED_TO_NUMBER=+0987654321
PUBLIC_BASE_URL=https://your-public-domain.com

# New variables for Phase 2
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxx
```

**Variable descriptions:**

| Variable | Description | How to obtain |
|------|------|----------|
| `TWILIO_API_KEY` | API Key SID | Copy from step 1.2 |
| `TWILIO_API_SECRET` | API Secret | Copy from step 1.2 (shown only once!) |
| `TWILIO_TWIML_APP_SID` | TwiML App SID | Copy from step 1.1 |

### 2.2 web Environment Variables

Add this to `apps/web/.env.local`:

```bash
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:4001
```

For production, change it to:

```bash
NEXT_PUBLIC_MEDIA_SERVICE_URL=https://your-media-service-domain.com
```

---

## 3. Install Dependencies

### 3.1 media-service

```bash
cd apps/media-service
pnpm install
```

### 3.2 web

```bash
cd apps/web
pnpm install
```

This installs `@twilio/voice-sdk@^2.11.2`.

---

## 4. Start Services

### 4.1 Start media-service

```bash
cd apps/media-service
pnpm start
```

Or use pnpm workspace:

```bash
pnpm --filter media-service start
```

### 4.2 Start web UI

```bash
cd apps/web
pnpm dev
```

Or use pnpm workspace:

```bash
pnpm --filter web dev
```

---

## 5. Verification Flow

### 5.1 Basic Call Test

1. Open `http://localhost:3000` in your browser
2. Click the **Call** button
3. Confirm:
   - The PSTN callee phone should ring
   - The UI shows `IN_CALL` status
   - The Timeline shows a `twilio.call.start` event
   - `sessionId` and `confName` are displayed

### 5.2 User Join Test

1. While in a call, click the **Join Conference** button
2. Browser requests microphone permission → click **Allow**
3. Confirm:
   - User status changes from `DISCONNECTED` → `CONNECTING` → `IN-CALL`
   - The **Join Conference** button is disabled
   - **Leave** and **Mute** buttons are enabled
4. Speak into your microphone → PSTN callee should hear your voice
5. Let the PSTN callee speak → you should hear them through your speakers

### 5.3 Mute Test

1. In `IN-CALL` state, click the **Mute** button
2. Mic status shows `MUTED`
3. Speak into your microphone → PSTN callee should not hear you
4. Click **Mute** again → unmute

### 5.4 Leave Test

1. Click the **Leave** button
2. User disconnects from the conference, but PSTN call remains active
3. User status changes to `CONNECTED`

### 5.5 Hangup Test

1. Click the **Hangup** button
2. Entire call ends
3. Call status changes to `DISCONNECTED`

---

## 6. FAQ

### Q1: Token generation fails with "Token generation not configured"

**Cause:** Environment variables are not configured correctly.

**Solution:**
1. Check that `.env` contains all three new variables
2. Restart media-service
3. Check console for warning messages

### Q2: Join Conference fails with "Failed to connect"

**Possible causes:**
1. **Incorrect TwiML App URL configuration**
   - Check whether TwiML App Voice URL points to `/twiml/webJoin`
   - URL must be publicly accessible (if using ngrok, ensure URL is updated)

2. **Microphone permission denied**
   - Browser will show an error prompt
   - Allow microphone access in browser settings

### Q3: User cannot hear the PSTN callee

**Cause:** Browser audio output device issue.

**Solution:**
1. Check browser volume
2. Check system volume
3. In browser DevTools Console, check for audio playback errors

### Q4: PSTN callee cannot hear the user

**Possible causes:**
1. **Muted state** - check if Mute was clicked
2. **Microphone device** - check if system microphone works
3. **Conference not created correctly** - check media-service logs

### Q5: Connection fails after ngrok URL changes

**Cause:** Twilio Console TwiML App URL still points to the old address.

**Solution:**
1. Update TwiML App Voice URL to the new ngrok URL
2. Update `PUBLIC_BASE_URL` in `.env`
3. Restart media-service

---

## 7. Debugging Tips

### 7.1 Check Browser Console

Open DevTools (F12) and check:
- Twilio Device connection logs
- Audio device enumeration info
- Error messages

### 7.2 Check media-service Logs

Watch for these key logs:
- `[media-service] Token generated for ...` - Token generation succeeded
- `[media-service] Web join TwiML requested` - Web leg requested TwiML
- `[Twilio Device] Registered` - Device registration succeeded

### 7.3 Twilio Console Debugger

Go to **Monitor → Logs → Errors & Warnings** to check:
- TwiML execution errors
- Conference create/join errors
- Media Stream errors

---

## 8. Security Notes

1. **Never** commit `.env` files to Git
2. **Rotate** API Key and Secret regularly
3. **Production environments** must use HTTPS (required by Twilio)
4. **Token expiration** defaults to 1 hour and can be adjusted during generation

---

## 9. Next Steps

After Phase 2, you can consider:
- Adding a device selector (microphone/speaker switching)
- Implementing a DTMF keypad (for IVR navigation)
- Adding AI TTS output to PSTN
- Implementing call recording
