# How to Run the Mock IVR Agent

There are two ways to run the mock agent:

## Option 1: Visual Phone Call Simulator (Recommended)

**Shows realistic phone call experience with:**
- 📞 IVR voice prompts (what the system "says")
- 🤖 Agent's decision process and reasoning
- ⌨️ Key presses (what option gets selected)
- 👤 Human connection confirmation
- 📊 Call statistics

### Run it:
```bash
npm run simulate
# or
npm run call
# or
node visual-simulator.js
```

### Example Output:
```
══════════════════════════════════════════════════════════════════════
          📞 SIMULATED IVR PHONE CALL 📞
══════════════════════════════════════════════════════════════════════

📞 Dialing XXX Pharmacy...
📞 Ring... Ring... Ring...
📞 Call connected!

🔊 IVR SYSTEM:
   "Welcome to XXX Pharmacy. Please choose from the following options."

   1. Store information
   2. Prescription services
   3. Insurance questions
   9. Repeat menu

💭 Agent analyzing options...

🤖 AGENT DECISION:
   Selected: Option 2 - "Prescription services"
   Reasoning: Prescription services likely leads to human support

⌨️ *BEEP* Pressing 2...

[... continues through menus ...]

══════════════════════════════════════════════════════════════════════
✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
══════════════════════════════════════════════════════════════════════

🔊 "Hello, this is a pharmacy representative. How can I help you?"

🎉 SUCCESS! Agent successfully navigated to human support! 🎉

📊 Call Statistics:
   Total Menu Selections: 6
   Time Elapsed: 23.5s
   Success Rate: 100%
```

---

## Option 2: Technical Report Mode

**Shows detailed logs and final report:**
- Real-time progress updates
- LLM decision details
- Navigation statistics
- Complete path taken

### Run it:
```bash
npm start
# or
node run.js
```

### Example Output:
```
🤖  MOCK IVR NAVIGATION AGENT
============================================================

⚙️  Configuration:
   LLM Provider: openai
   Model: deepseek-chat
   Max Attempts: 20

🚀 Starting agent...

📍 Attempt 1: Currently at menu "main_menu"
🧠 Asking LLM to decide...
💡 LLM Decision: Option 2
   reasoning: Prescription services likely to lead to human
   confidence: medium
➡️  Selected option 2. Moving to menu_1

[... continues ...]

✅ SUCCESS! Connected to human representative!

============================================================
           AGENT NAVIGATION REPORT
============================================================

📊 Statistics:
  Total Attempts: 6
  Success Rate: 100%

🗺️  Navigation Path:
  1. main_menu → Option 2
  2. menu_1 → Option 1
  [...]
```

---

## What You See in the Mock

### 1. IVR Voice Prompts
```
🔊 IVR SYSTEM:
   "Welcome to XXX Pharmacy. Please choose from the following options."
```
This is what the phone system would "say" to a caller.

### 2. Available Options
```
   1. Store information
   2. Prescription services
   3. Insurance questions
   9. Back to main menu
```
These are the menu options presented to the caller.

### 3. Agent Thinking
```
💭 Agent analyzing options...
```
The LLM is processing the menu and deciding which option to select.

### 4. Agent's Decision
```
🤖 AGENT DECISION:
   Selected: Option 2 - "Prescription services"
   Reasoning: Prescription services likely leads to human support
```
Shows what option the agent chose and WHY.

### 5. Key Press (User Action)
```
⌨️ *BEEP* Pressing 2...
```
Simulates the user pressing a button on their phone.

### 6. Navigation Progress
```
📍 Navigating to next menu...
```
Moving to the next menu level.

### 7. Mistakes (If Enabled)
```
⚠️  Agent made a mistake! Pressing 1 instead of 2
```
When configured, the agent occasionally makes wrong choices for testing.

### 8. Human Connection!
```
══════════════════════════════════════════════════════════════════════
✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
══════════════════════════════════════════════════════════════════════

🔊 "Hello, this is a pharmacy representative. How can I help you?"

🎉 SUCCESS! Agent successfully navigated to human support! 🎉
```
Final success message when human is reached.

---

## Configuration

Edit `.env` to customize behavior:

### Disable Mistakes (Perfect Agent)
```env
ALLOW_MISTAKES=false
```

### Increase Mistakes (More Realistic)
```env
ALLOW_MISTAKES=true
MISTAKE_PROBABILITY=0.3  # 30% error rate
```

### Change Maximum Attempts
```env
MAX_ATTEMPTS=10  # Give up after 10 selections
```

---

## Quick Commands

| Command | Description |
|---------|-------------|
| `npm run simulate` | Visual phone call experience |
| `npm run call` | Same as simulate |
| `npm start` | Technical report mode |
| `node test-navigator.js` | Test without API calls |

---

## Understanding the Process

**The mock data comes from:** `../ivr-tree.json`

**The agent's job:**
1. Read current menu from JSON
2. Ask LLM which option is best
3. Select that option (or make a mistake)
4. Repeat until "TRANSFER_TO_HUMAN" found

**When human is reached:**
- The JSON has `"action": "TRANSFER_TO_HUMAN"`
- Agent detects this and stops
- Success message is displayed

---

## Tips

- **First time?** Use `npm run simulate` for best experience
- **Testing?** Enable mistakes with `MISTAKE_PROBABILITY=0.3`
- **Debugging?** Use `npm start` for detailed logs
- **No API?** Use `node test-navigator.js` to test structure

---

## What This Simulates

In a real IVR system:
1. User calls pharmacy
2. Automated voice says "Press 1 for..., Press 2 for..."
3. User presses buttons on phone
4. System navigates through menus
5. Eventually connects to human

**Our mock system:**
1. Agent "calls" pharmacy (loads JSON)
2. Prints what IVR would "say" (menu prompts)
3. LLM decides which button to "press"
4. System navigates through JSON structure
5. Eventually reaches "TRANSFER_TO_HUMAN" action

**It's all text-based because:**
- No actual phone call
- No audio/speech
- Just terminal output showing the process
- Perfect for testing and demonstration!

---

## Success!

When you see:
```
✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
```

The agent has successfully navigated the IVR tree and reached a human! 🎉

