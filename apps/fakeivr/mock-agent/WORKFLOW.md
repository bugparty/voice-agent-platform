# Mock IVR Agent - Workflow Visualization

This document provides visual representations of how the agent works.

## 🔄 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTION                              │
│                     npm start / node run.js                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INITIALIZATION PHASE                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Load .env configuration                                      │
│  2. Validate API key exists                                      │
│  3. Create IVRNavigator (load ivr-tree.json)                    │
│  4. Create LLMClient (initialize OpenAI SDK)                    │
│  5. Create IVRAgent (orchestrator)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NAVIGATION LOOP                               │
│                (Repeats until success or max attempts)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Step 1: Get Current State                               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Agent → Navigator.getCurrentMenu()                      │   │
│  │  Returns: {id, prompt, options}                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Step 2: Ask LLM for Decision                            │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Agent → LLMClient.decideOption({menu, history, goal})  │   │
│  │  LLMClient → OpenAI API (with prompt)                    │   │
│  │  OpenAI API → JSON response                              │   │
│  │  Returns: {selectedOption, reasoning, confidence}        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Step 3: Optional Mistake Injection                      │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  if (ALLOW_MISTAKES && random() < MISTAKE_PROBABILITY)  │   │
│  │      selectedOption = randomWrongOption()                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Step 4: Execute Selection                               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Agent → Navigator.selectOption(choice)                  │   │
│  │  Navigator validates and updates state                   │   │
│  │  Returns: {success, message, isHumanConnection}          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Step 5: Check Goal                                      │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  if (result.action === "TRANSFER_TO_HUMAN")             │   │
│  │      SUCCESS! Exit loop                                  │   │
│  │  else                                                     │   │
│  │      Continue to next iteration                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REPORTING PHASE                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Generate report (stats, path, logs)                         │
│  2. Format with Logger (colors, tables)                         │
│  3. Display to user                                              │
│  4. Exit with code 0 (success) or 1 (failure)                   │
└─────────────────────────────────────────────────────────────────┘
```

## 🧠 LLM Decision Making Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM DECISION PROCESS                          │
└─────────────────────────────────────────────────────────────────┘

INPUT: Current Context
├── Current Menu
│   ├── ID: "menu_5"
│   ├── Prompt: "Menu 5. Please select an option."
│   └── Options:
│       ├── 1: "Speak to a pharmacy representative"
│       └── 9: "Back to main menu"
│
├── Navigation History
│   ├── Step 1: main_menu → Option 1
│   ├── Step 2: menu_1 → Option 1
│   ├── Step 3: menu_2 → Option 1
│   └── Step 4: menu_3 → Option 1
│
└── Goal: "Connect to a human representative"

                    ↓
                    
┌─────────────────────────────────────────────────────────────────┐
│                  PROMPT CONSTRUCTION                             │
├─────────────────────────────────────────────────────────────────┤
│  System Prompt:                                                  │
│  "You are an IVR navigation expert. Your goal is to connect     │
│   to a human. Look for keywords like 'representative',          │
│   'agent', 'human', 'speak to'. Respond in JSON format."        │
│                                                                   │
│  User Prompt:                                                    │
│  "GOAL: Connect to a human representative                        │
│                                                                   │
│   CURRENT MENU:                                                  │
│   Prompt: 'Menu 5. Please select an option.'                    │
│                                                                   │
│   Available Options:                                             │
│     Option 1: Speak to a pharmacy representative                │
│     Option 9: Back to main menu                                 │
│                                                                   │
│   NAVIGATION HISTORY:                                            │
│   1. At 'main_menu': Selected option 1                          │
│   2. At 'menu_1': Selected option 1                             │
│   3. At 'menu_2': Selected option 1                             │
│   4. At 'menu_3': Selected option 1                             │
│                                                                   │
│   Which option should I select? Respond only with valid JSON."  │
└─────────────────────────────────────────────────────────────────┘

                    ↓
                    
┌─────────────────────────────────────────────────────────────────┐
│                    OPENAI API CALL                               │
├─────────────────────────────────────────────────────────────────┤
│  POST https://api.openai.com/v1/chat/completions                │
│  {                                                               │
│    "model": "gpt-4o-mini",                                       │
│    "messages": [                                                 │
│      {"role": "system", "content": "..."},                       │
│      {"role": "user", "content": "..."}                          │
│    ],                                                            │
│    "response_format": {"type": "json_object"},                  │
│    "temperature": 0.7,                                           │
│    "max_tokens": 300                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘

                    ↓
                    
OUTPUT: LLM Response
{
  "selectedOption": "1",
  "reasoning": "Option 1 'Speak to a pharmacy representative' 
                explicitly mentions speaking to a representative, 
                which directly aligns with the goal of connecting 
                to a human. This is clearly the correct choice.",
  "confidence": "high"
}

                    ↓
                    
AGENT EXECUTES: Navigator.selectOption("1")
RESULT: ✅ TRANSFER_TO_HUMAN action → SUCCESS!
```

## 📊 State Transitions

```
IVR Navigation State Machine:

    START
      │
      ▼
┌──────────┐
│main_menu │  (Entry point)
└────┬─────┘
     │ Option 1: "Store information"
     │ Option 2: "Prescription services"
     │ Option 3: "Insurance questions"
     │ Option 9: "Repeat menu" → loops back
     │
     ▼
┌──────────┐
│ menu_1   │  (Level 1)
└────┬─────┘
     │ Option 1: "Option 1-A"
     │ Option 9: "Back to main menu" → main_menu
     │
     ▼
┌──────────┐
│ menu_2   │  (Level 2)
└────┬─────┘
     │ Option 1: "Option 2-A"
     │ Option 9: "Back to main menu" → main_menu
     │
     ▼
┌──────────┐
│ menu_3   │  (Level 3)
└────┬─────┘
     │ Option 1: "Option 3-A"
     │ Option 9: "Back to main menu" → main_menu
     │
     ▼
┌──────────┐
│ menu_4   │  (Level 4)
└────┬─────┘
     │ Option 1: "Option 4-A"
     │ Option 9: "Back to main menu" → main_menu
     │
     ▼
┌──────────┐
│ menu_5   │  (Level 5 - Final)
└────┬─────┘
     │ Option 1: "Speak to a pharmacy representative"
     │            → TRANSFER_TO_HUMAN ✅
     │ Option 9: "Back to main menu" → main_menu
     │
     ▼
  SUCCESS!
  Connected to Human
```

## 🎲 Mistake Injection Flow

```
When ALLOW_MISTAKES = true:

LLM Decision: "1"
      │
      ▼
┌─────────────────────────────────────┐
│ Generate random number 0.0 - 1.0    │
└─────────────┬───────────────────────┘
              │
              ▼
    Is random < MISTAKE_PROBABILITY?
              │
      ┌───────┴───────┐
      │               │
     YES              NO
      │               │
      ▼               ▼
  Make Mistake    Use LLM Decision
      │               │
      ▼               │
  Pick random         │
  wrong option        │
  (not "1")          │
      │               │
      └───────┬───────┘
              │
              ▼
      Execute Selection
              │
              ▼
      Log if mistake made
```

## 📈 Example Run Timeline

```
Time    Event                           State
─────────────────────────────────────────────────────────────
0.0s    Start agent                     main_menu
0.1s    Get current menu                main_menu
0.2s    Call LLM API                    [waiting]
1.5s    LLM returns: Option 1           main_menu
1.6s    Execute selection               → menu_1
1.7s    Get current menu                menu_1
1.8s    Call LLM API                    [waiting]
3.2s    LLM returns: Option 1           menu_1
3.3s    Execute selection               → menu_2
3.4s    Get current menu                menu_2
3.5s    Call LLM API                    [waiting]
4.8s    LLM returns: Option 1           menu_2
4.9s    Execute selection               → menu_3
5.0s    Get current menu                menu_3
5.1s    Call LLM API                    [waiting]
6.4s    LLM returns: Option 1           menu_3
6.5s    Execute selection               → menu_4
6.6s    Get current menu                menu_4
6.7s    Call LLM API                    [waiting]
8.1s    LLM returns: Option 1           menu_4
8.2s    Execute selection               → menu_5
8.3s    Get current menu                menu_5
8.4s    Call LLM API                    [waiting]
9.7s    LLM returns: Option 1           menu_5
9.8s    Execute selection               → HUMAN!
9.9s    Generate report                 [complete]
10.0s   Display results                 ✅ SUCCESS
```

## 🔍 Error Recovery Example

```
Scenario: Agent makes a mistake and selects "Back" option

Step 1: At menu_3
  LLM Decision: Option 1 (correct)
  Mistake Injected: Option 9 (back to main)
  Result: Now at main_menu

Step 2: At main_menu (again)
  LLM sees history: "We were at menu_3, went back to main_menu"
  LLM Decision: Option 1 (try again)
  No mistake this time
  Result: Now at menu_1

Step 3: At menu_1
  LLM Decision: Option 1
  Result: Now at menu_2

Step 4: At menu_2
  LLM Decision: Option 1
  Result: Now at menu_3

Step 5: At menu_3
  LLM Decision: Option 1
  Result: Now at menu_4

[... continues to success ...]

Recovery Strategy: LLM learns from history and retries the path
```

## 🎯 Success Paths

```
Optimal Path (5 selections):
main_menu → menu_1 → menu_2 → menu_3 → menu_4 → menu_5 → HUMAN
   (1)       (1)       (1)       (1)       (1)       (1)

Path with 1 Mistake (7 selections):
main_menu → menu_1 → menu_2 → main_menu → menu_1 → menu_2 → menu_3 → menu_4 → menu_5 → HUMAN
   (1)       (1)       (9)       (1)        (1)       (1)       (1)       (1)       (1)
                    ↑ mistake

Path with Multiple Mistakes (10 selections):
main_menu → menu_1 → main_menu → menu_1 → menu_2 → main_menu → menu_1 → menu_2 → menu_3 → menu_4 → menu_5 → HUMAN
   (1)       (9)       (1)        (1)       (9)       (1)        (1)       (1)       (1)       (1)       (1)
          ↑ mistake                      ↑ mistake
```

## 💾 Data Structures

```javascript
// Navigator State
{
  currentMenuId: "menu_3",
  navigationHistory: [
    {
      menuId: "main_menu",
      prompt: "Welcome to XXX Pharmacy...",
      selectedOption: "1",
      timestamp: "2026-01-24T10:30:00.000Z"
    },
    {
      menuId: "menu_1",
      prompt: "Menu 1. Please select an option.",
      selectedOption: "1",
      timestamp: "2026-01-24T10:30:02.000Z"
    }
  ],
  selectionCount: 2,
  isConnectedToHuman: false
}

// LLM Decision
{
  selectedOption: "1",
  reasoning: "Option 1 appears to continue the path forward",
  confidence: "medium"
}

// Agent Report
{
  success: true,
  stats: {
    totalAttempts: 5,
    totalSelections: 5,
    mistakesMade: 0,
    successRate: "100.0"
  },
  navigationPath: [...],
  logs: [...],
  finalState: {
    currentMenu: "menu_5",
    connectedToHuman: true
  }
}
```

## 🔄 Component Interaction Diagram

```
┌──────────┐
│  run.js  │
└────┬─────┘
     │ creates
     ▼
┌──────────┐        uses        ┌──────────────┐
│  agent   │◄────────────────────│   logger     │
└────┬─────┘                     └──────────────┘
     │
     │ uses
     ├────────────────┬──────────────────┐
     ▼                ▼                  ▼
┌──────────┐    ┌──────────┐     ┌──────────┐
│navigator │    │llm-client│     │  .env    │
└────┬─────┘    └────┬─────┘     └──────────┘
     │               │
     │ reads         │ calls
     ▼               ▼
┌──────────┐    ┌──────────┐
│ivr-tree  │    │ OpenAI   │
│  .json   │    │   API    │
└──────────┘    └──────────┘
```

This visualization shows the complete workflow of the Mock IVR Navigation Agent!

