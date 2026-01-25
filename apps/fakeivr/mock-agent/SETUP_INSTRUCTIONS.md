# Setup Instructions for Mock IVR Agent

This guide will help you set up and run the Mock IVR Navigation Agent.

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js
- **API Key**: OpenAI, Azure OpenAI, or Anthropic API key

Check your Node.js version:
```bash
node --version
# Should output v18.x.x or higher
```

## Installation Steps

### 1. Navigate to the Project Directory

```bash
cd /root/rose3/apps/fakeivr/mock-agent
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `openai` - OpenAI SDK for API calls
- `dotenv` - Environment variable management
- `chalk` - Terminal colors for pretty output

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp env.example .env
```

Edit the `.env` file and add your API key:
```bash
nano .env
# or
vim .env
# or use any text editor
```

**For OpenAI:**
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
LLM_PROVIDER=openai
MODEL_NAME=gpt-4o-mini
```

**For Azure OpenAI:**
```env
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
LLM_PROVIDER=azure
MODEL_NAME=gpt-4
```

**For Anthropic Claude:**
```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
LLM_PROVIDER=anthropic
MODEL_NAME=claude-3-sonnet-20240229
```

### 4. Verify IVR Tree Data

Make sure the IVR tree JSON file exists:
```bash
ls -la ../ivr-tree.json
```

You should see the file. If not, check that you're in the correct directory.

### 5. Test the Navigator (Optional)

Test the navigator without making API calls:
```bash
node test-navigator.js
```

This will verify that the IVR tree structure is valid and the navigator can traverse it.

### 6. Run the Agent

```bash
npm start
# or
node run.js
```

## Configuration Options

Edit `.env` to customize behavior:

### LLM Settings

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `LLM_PROVIDER` | Which LLM service to use | `openai` | `openai`, `azure`, `anthropic` |
| `MODEL_NAME` | Specific model to use | `gpt-4o-mini` | See below |
| `OPENAI_API_KEY` | OpenAI API key | (required) | Your API key |
| `AZURE_OPENAI_API_KEY` | Azure API key | - | Your Azure key |
| `AZURE_OPENAI_ENDPOINT` | Azure endpoint URL | - | Your endpoint |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | Your Anthropic key |

**Model Options:**
- OpenAI: `gpt-4`, `gpt-4-turbo`, `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`
- Azure: Same as OpenAI (depends on your deployment)
- Anthropic: `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`

### Agent Behavior Settings

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `MAX_ATTEMPTS` | Maximum menu selections before giving up | `20` | 1-100 |
| `ALLOW_MISTAKES` | Whether agent can make wrong choices | `true` | `true`/`false` |
| `MISTAKE_PROBABILITY` | Chance of making a mistake | `0.15` | 0.0-1.0 |

**Examples:**

Perfect agent (no mistakes):
```env
ALLOW_MISTAKES=false
```

Chaotic agent (50% mistakes):
```env
ALLOW_MISTAKES=true
MISTAKE_PROBABILITY=0.5
```

Quick timeout (5 attempts max):
```env
MAX_ATTEMPTS=5
```

## Getting API Keys

### OpenAI

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-proj-` or `sk-`)
6. Add to `.env` as `OPENAI_API_KEY`

**Pricing**: gpt-4o-mini is very cheap (~$0.0002 per run)

### Azure OpenAI

1. Go to Azure Portal (portal.azure.com)
2. Create or select an Azure OpenAI resource
3. Go to "Keys and Endpoint"
4. Copy Key 1 and Endpoint URL
5. Add to `.env` as `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT`

**Note**: You need to deploy a model first in Azure OpenAI Studio

### Anthropic

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key
5. Copy the key (starts with `sk-ant-`)
6. Add to `.env` as `ANTHROPIC_API_KEY`

**Note**: Anthropic provider is not fully implemented yet. Use OpenAI or Azure.

## Troubleshooting

### Error: "No API key found"

**Problem**: `.env` file missing or API key not set

**Solution**:
```bash
# Check if .env exists
ls -la .env

# If not, create it
cp env.example .env

# Edit and add your API key
nano .env
```

### Error: "Cannot find module 'openai'"

**Problem**: Dependencies not installed

**Solution**:
```bash
npm install
```

### Error: "Menu not found"

**Problem**: IVR tree JSON file missing or corrupted

**Solution**:
```bash
# Check if file exists
ls -la ../ivr-tree.json

# Verify JSON is valid
node -e "console.log(JSON.parse(require('fs').readFileSync('../ivr-tree.json')))"
```

### Error: "LLM decision failed"

**Problem**: API key invalid, no credits, or network issue

**Solution**:
1. Verify API key is correct
2. Check you have API credits/quota
3. Test network connection
4. Try a different model

### Agent makes same mistake repeatedly

**Problem**: LLM not understanding the menu structure

**Solution**:
1. Use a more capable model: `MODEL_NAME=gpt-4`
2. Reduce mistake probability: `MISTAKE_PROBABILITY=0.0`
3. Check IVR tree has clear path to human

### Agent takes too long

**Problem**: LLM API calls are slow

**Solution**:
1. Use faster model: `MODEL_NAME=gpt-4o-mini`
2. Reduce max attempts: `MAX_ATTEMPTS=10`
3. Check internet connection speed

## Verification Checklist

Before running, verify:

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Dependencies installed (`npm install` completed)
- [ ] `.env` file exists
- [ ] API key added to `.env`
- [ ] `ivr-tree.json` exists in parent directory
- [ ] `test-navigator.js` runs successfully (optional)

## Next Steps

Once setup is complete:

1. **Run the agent**: `npm start`
2. **Read the output**: Watch real-time navigation
3. **Review the report**: See statistics and path taken
4. **Experiment**: Modify `.env` settings and run again
5. **Customize**: Edit `ivr-tree.json` to test different IVR systems

## File Structure

```
mock-agent/
├── package.json          # Dependencies
├── env.example           # Environment template
├── .env                  # Your config (create this)
├── .gitignore           # Ignore node_modules and .env
├── run.js               # Main entry point
├── agent.js             # Orchestration logic
├── navigator.js         # IVR tree traversal
├── llm-client.js        # LLM API integration
├── logger.js            # Pretty output
├── test-navigator.js    # Test script
├── README.md            # Full documentation
├── QUICKSTART.md        # Quick start guide
├── ARCHITECTURE.md      # Technical details
└── SETUP_INSTRUCTIONS.md # This file
```

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Read `README.md` for detailed documentation
3. Review `ARCHITECTURE.md` for technical details
4. Check the logs for specific error messages

## Success Criteria

You'll know it's working when you see:

```
🤖  MOCK IVR NAVIGATION AGENT
============================================================

⚙️  Configuration:
   LLM Provider: openai
   Model: gpt-4o-mini
   ...

🚀 Starting agent...

📍 Attempt 1: Currently at menu "main_menu"
🧠 Asking LLM to decide...
💡 LLM Decision: Option 1
...

✅ SUCCESS! Connected to human representative!
```

Happy testing! 🎉

