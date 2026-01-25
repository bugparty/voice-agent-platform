# 🎉 Updated Usage - Interactive Scenario Selection!

## New Feature: Interactive Menu

When you run `npm run simulate`, you now get an **interactive menu** to select which IVR scenario to test!

## How to Run

### Step 1: Navigate to directory
```bash
cd /root/rose3/apps/fakeivr/mock-agent
```

### Step 2: Run simulate command
```bash
npm run simulate
```

### Step 3: Select scenario
You'll see this menu:

```
══════════════════════════════════════════════════════════════════════
           SELECT IVR SCENARIO TO TEST
══════════════════════════════════════════════════════════════════════

✅ 1. Simple Scenario
   File: data/ivr-simple.json
   Easy 6-menu demo - Quick success (5-6 steps)
   Difficulty: Easy

🏗️ 2. Complex Scenario
   File: data/ivr-complex.json
   Realistic 87-menu pharmacy system - Takes 10-20 steps
   Difficulty: Hard

❌ 3. Fault Scenario
   File: data/ivr-fault.json
   Impossible - No human available (tests failure handling)
   Difficulty: Impossible

🔐 4. Hidden Scenario
   File: data/ivr-hide.json
   Secret option "0" - Tests discovery ability
   Difficulty: Medium-Hard

══════════════════════════════════════════════════════════════════════

Enter your choice (1-4):
```

### Step 4: Enter your choice
Type `1`, `2`, `3`, or `4` and press Enter!

The simulator will start with your selected scenario.

---

## What Each Option Does

### Option 1: Simple Scenario ✅
```
Enter your choice (1-4): 1
```
- **Best for**: Quick demo, first-time testing
- **Duration**: ~30 seconds
- **Expected**: Success in 5-6 steps

### Option 2: Complex Scenario 🏗️
```
Enter your choice (1-4): 2
```
- **Best for**: Realistic testing, impressive demo
- **Duration**: 1-2 minutes
- **Expected**: Success after navigating 87 menus

### Option 3: Fault Scenario ❌
```
Enter your choice (1-4): 3
```
- **Best for**: Testing failure handling
- **Duration**: 2-3 minutes
- **Expected**: Graceful failure (no human available)

### Option 4: Hidden Scenario 🔐
```
Enter your choice (1-4): 4
```
- **Best for**: Testing agent's discovery ability
- **Duration**: 30 seconds - 2 minutes
- **Expected**: Success if agent tries option '0'

---

## Old Methods Still Work

### Method 1: Edit .env file
```bash
# Edit .env
nano .env
# Change: IVR_TREE_PATH=data/ivr-complex.json

# Run directly
npm run simulate:direct
```

### Method 2: Environment variable override
```bash
IVR_TREE_PATH=data/ivr-hide.json npm run simulate:direct
```

---

## Commands Summary

| Command | Description |
|---------|-------------|
| `npm run simulate` | **Interactive menu** (NEW! Recommended) |
| `npm run call` | Same as simulate (interactive) |
| `npm run simulate:direct` | Run without menu (uses .env setting) |
| `npm start` | Technical report mode |

---

## Example Session

```bash
$ cd /root/rose3/apps/fakeivr/mock-agent
$ npm run simulate

> mock-agent@1.0.0 simulate
> node interactive-run.js


══════════════════════════════════════════════════════════════════════
           SELECT IVR SCENARIO TO TEST
══════════════════════════════════════════════════════════════════════

✅ 1. Simple Scenario
   File: data/ivr-simple.json
   Easy 6-menu demo - Quick success (5-6 steps)
   Difficulty: Easy

🏗️ 2. Complex Scenario
   File: data/ivr-complex.json
   Realistic 87-menu pharmacy system - Takes 10-20 steps
   Difficulty: Hard

❌ 3. Fault Scenario
   File: data/ivr-fault.json
   Impossible - No human available (tests failure handling)
   Difficulty: Impossible

🔐 4. Hidden Scenario
   File: data/ivr-hide.json
   Secret option "0" - Tests discovery ability
   Difficulty: Medium-Hard

══════════════════════════════════════════════════════════════════════

Enter your choice (1-4): 1

✅ Selected: Simple Scenario
   Loading: data/ivr-simple.json


══════════════════════════════════════════════════════════════════════
          📞 SIMULATED IVR PHONE CALL 📞
══════════════════════════════════════════════════════════════════════

⚙️  Configuration:
   IVR Scenario: data/ivr-simple.json
   Model: deepseek-chat
   Max Attempts: 20

📞 Dialing XXX Pharmacy...
📞 Ring... Ring... Ring...
📞 Call connected!

[... simulation continues ...]
```

---

## Quick Start

**Just run these two commands:**

```bash
cd /root/rose3/apps/fakeivr/mock-agent
npm run simulate
```

Then select `1` for a quick demo!

---

## Benefits of Interactive Mode

✅ **No config editing needed**  
✅ **See all options at once**  
✅ **Quick switching between scenarios**  
✅ **Clear descriptions of each scenario**  
✅ **Perfect for demos and testing**  

---

## Files Updated

- ✅ **NEW**: `interactive-run.js` - Interactive menu script
- ✅ **UPDATED**: `package.json` - Changed `simulate` command to use interactive mode
- ✅ **ADDED**: `simulate:direct` command for old behavior

---

## That's It!

Just run:
```bash
npm run simulate
```

And select your scenario! 🎉

