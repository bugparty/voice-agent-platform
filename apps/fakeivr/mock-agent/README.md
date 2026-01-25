# Mock IVR Navigation Agent

This is a mock system that simulates an AI agent navigating through an IVR (Interactive Voice Response) phone system to connect a user to a human representative.

## Overview

The agent uses a Large Language Model (LLM) to make intelligent decisions about which menu options to select at each step. The system is designed to:

1. **Navigate autonomously** through a 5-level menu system
2. **Make intelligent decisions** using LLM reasoning
3. **Learn from mistakes** (can be configured to make intentional errors for testing)
4. **Successfully connect to a human** at the end of the journey

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Mock Agent System                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │   run.js    │────▶│   agent.js   │────▶│ navigator.js │ │
│  │  (CLI Entry)│     │ (Orchestrator)│     │ (IVR Tree)   │ │
│  └─────────────┘     └──────┬───────┘     └──────────────┘ │
│                             │                                │
│                             ▼                                │
│                      ┌──────────────┐                        │
│                      │llm-client.js │                        │
│                      │ (LLM API)    │                        │
│                      └──────────────┘                        │
│                             │                                │
│                             ▼                                │
│                   ┌──────────────────┐                       │
│                   │  OpenAI / Azure  │                       │
│                   │   (External API) │                       │
│                   └──────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. `navigator.js` - IVR Tree Navigator
- Loads and parses the IVR menu tree from `ivr-tree.json`
- Tracks current position in the menu system
- Validates menu selections
- Detects when "TRANSFER_TO_HUMAN" action is reached
- Maintains navigation history

### 2. `llm-client.js` - LLM Integration
- Communicates with LLM APIs (OpenAI, Azure OpenAI)
- Constructs prompts with context (current menu, history, goal)
- Parses LLM responses to extract decisions
- Returns structured decision with reasoning and confidence

### 3. `agent.js` - Main Orchestration
- Coordinates between navigator and LLM client
- Implements the decision loop
- Handles error recovery
- Optionally injects mistakes for testing/learning
- Generates comprehensive reports

### 4. `logger.js` - Pretty Logging
- Formats logs with colors using chalk
- Provides real-time status updates
- Generates final reports and summary tables

### 5. `run.js` - CLI Runner
- Entry point for the application
- Loads configuration from `.env`
- Validates API keys
- Runs the agent and displays results

## Setup

### 1. Install Dependencies

```bash
cd /root/rose3/apps/fakeivr/mock-agent
npm install
```

### 2. Configure API Keys

Copy the example environment file and add your API key:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run the Agent

```bash
npm start
# or
node run.js
```

## Configuration Options

Edit `.env` to customize behavior:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `LLM_PROVIDER` | LLM provider (openai/azure/anthropic) | `openai` |
| `MODEL_NAME` | Model to use | `gpt-4o-mini` |
| `MAX_ATTEMPTS` | Maximum menu selections before giving up | `20` |
| `ALLOW_MISTAKES` | Whether agent can make wrong choices | `true` |
| `MISTAKE_PROBABILITY` | Probability of making a mistake (0.0-1.0) | `0.15` |

## How It Works

### The Decision Loop

1. **Get Current State**: Agent asks navigator for current menu and options
2. **LLM Decision**: Agent sends context to LLM and gets a decision
3. **Optional Mistake**: Based on probability, may choose wrong option instead
4. **Execute Selection**: Navigator processes the selection
5. **Check Goal**: If "TRANSFER_TO_HUMAN" reached, success! Otherwise, repeat.

### LLM Prompt Strategy

The LLM is given:
- **System Prompt**: Defines its role as an IVR navigation expert
- **User Prompt**: Current menu options, navigation history, and goal
- **Response Format**: Structured JSON with option, reasoning, and confidence

Example LLM response:
```json
{
  "selectedOption": "1",
  "reasoning": "Option 1 'Speak to a pharmacy representative' explicitly mentions speaking to a representative, which aligns with the goal of connecting to a human",
  "confidence": "high"
}
```

## Example Output

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
🧠 Asking LLM to decide...
💡 LLM Decision: Option 1
   reasoning: This appears to be the first step in navigating to services
   confidence: medium
➡️  Selected option 1: "Store information". Moving to menu_1

📍 Attempt 2: Currently at menu "menu_1"
...

✅ SUCCESS! Connected to human representative!

============================================================
           AGENT NAVIGATION REPORT
============================================================

✅ STATUS: SUCCESS - Connected to Human!

📊 Statistics:
  Total Attempts: 5
  Total Selections: 5
  Mistakes Made: 1
  Success Rate: 80.0%

🗺️  Navigation Path:
  1. main_menu → Option 1
  2. menu_1 → Option 1
  3. menu_2 → Option 9  (mistake - went back)
  4. menu_2 → Option 1
  5. menu_3 → Option 1
  6. menu_4 → Option 1
  7. menu_5 → Option 1
     Connected to human!
```

## Algorithm Explanation

The agent uses **LLM-based reasoning** rather than traditional algorithms like A* or BFS. Here's why:

1. **Semantic Understanding**: The LLM can understand natural language menu options and reason about which is most likely to lead to a human
2. **Context Awareness**: It learns from navigation history and avoids repeating mistakes
3. **Flexibility**: Works with any IVR tree structure without hardcoding rules
4. **Human-like Reasoning**: Makes decisions similar to how a human would navigate

The LLM essentially performs a **greedy best-first search** guided by semantic similarity to the goal "connect to human representative".

## Extending the System

### Add Support for More LLM Providers

Edit `llm-client.js` and add new provider logic:

```javascript
if (this.provider === 'anthropic') {
  // Implement Anthropic API calls
}
```

### Change the IVR Tree

Edit `../ivr-tree.json` to use a different menu structure. The agent will automatically adapt.

### Add More Sophisticated Error Recovery

Edit `agent.js` to implement backtracking or more intelligent retry strategies.

## Testing

The agent includes built-in mistake injection for testing robustness:

```bash
# Run with no mistakes (100% LLM decisions)
ALLOW_MISTAKES=false npm start

# Run with high mistake rate (50%)
MISTAKE_PROBABILITY=0.5 npm start
```

## Troubleshooting

### "No API key found"
- Make sure you created `.env` file
- Check that `OPENAI_API_KEY` is set correctly

### "LLM decision failed"
- Check your API key is valid
- Verify you have API credits/quota
- Check internet connection

### Agent makes same mistake repeatedly
- The LLM might need more context
- Try a more capable model (gpt-4 instead of gpt-3.5-turbo)
- Check if the menu structure has a clear path to human

## License

This is a mock system for educational/testing purposes only.

