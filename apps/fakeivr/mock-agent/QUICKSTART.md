# Quick Start Guide

Get the mock IVR agent running in 3 steps:

## Step 1: Install Dependencies

```bash
cd /root/rose3/apps/fakeivr/mock-agent
npm install
```

## Step 2: Configure API Key

Create `.env` file with your OpenAI API key:

```bash
# Copy the example file
cp env.example .env

# Edit .env and add your API key
nano .env
```

Add this line to `.env`:
```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Where to get API keys:**
- OpenAI: https://platform.openai.com/api-keys
- Azure OpenAI: Azure Portal → Your OpenAI Resource → Keys and Endpoint
- Anthropic: https://console.anthropic.com/

## Step 3: Run the Agent

```bash
npm start
```

That's it! The agent will start navigating the IVR system and show you real-time progress.

## What You'll See

```
🤖  MOCK IVR NAVIGATION AGENT
============================================================

⚙️  Configuration:
   LLM Provider: openai
   Model: gpt-4o-mini
   Max Attempts: 20
   Allow Mistakes: true
   Mistake Probability: 15%

🚀 Starting agent...

📍 Attempt 1: Currently at menu "main_menu"
Menu prompt: "Welcome to XXX Pharmacy..."
🧠 Asking LLM to decide...
💡 LLM Decision: Option 1
   reasoning: Store information is the first logical step...
   confidence: medium
➡️  Selected option 1: "Store information". Moving to menu_1

[... more navigation steps ...]

✅ SUCCESS! Connected to human representative!
```

## Troubleshooting

### "No API key found"
Make sure your `.env` file exists and contains valid API key.

### "npm install" fails
Make sure you have Node.js 18+ installed:
```bash
node --version  # Should be v18 or higher
```

### Agent can't connect
- Check that `ivr-tree.json` exists in parent directory
- Verify your API key has credits/quota
- Try with a more capable model: `MODEL_NAME=gpt-4` in `.env`

## Next Steps

- Read `README.md` for detailed documentation
- Modify `env.example` configuration to tune agent behavior
- Edit `../ivr-tree.json` to test with different IVR structures

