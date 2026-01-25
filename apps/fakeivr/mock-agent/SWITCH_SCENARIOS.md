# How to Switch Between IVR Scenarios

You have 4 different IVR scenarios to test. Here's how to switch between them:

## Method 1: Edit `.env` File (Recommended)

Edit the `.env` file and change the `IVR_TREE_PATH` variable:

```bash
nano .env
# or
vim .env
```

Change this line:
```env
IVR_TREE_PATH=data/ivr-simple.json
```

To one of these:

### Option 1: Simple Scenario (Default)
```env
IVR_TREE_PATH=data/ivr-simple.json
```
- **Difficulty**: Easy
- **Menus**: 6
- **Human transfer**: ✅ Yes (advertised)
- **Expected result**: Success in 5-6 steps

### Option 2: Complex Scenario
```env
IVR_TREE_PATH=data/ivr-complex.json
```
- **Difficulty**: Hard
- **Menus**: 87
- **Human transfer**: ✅ Yes (via escalation)
- **Expected result**: Success in 10-20 steps with some mistakes

### Option 3: Fault Scenario (Impossible)
```env
IVR_TREE_PATH=data/ivr-fault.json
```
- **Difficulty**: Impossible
- **Menus**: 50
- **Human transfer**: ❌ No (none available)
- **Expected result**: Failure after max attempts

### Option 4: Hidden Scenario (Discovery Challenge)
```env
IVR_TREE_PATH=data/ivr-hide.json
```
- **Difficulty**: Medium-Hard
- **Menus**: 66
- **Human transfer**: 🔐 Yes (hidden option '0')
- **Expected result**: Success if agent tries option '0'

## Method 2: Command Line (One-Time Override)

Set environment variable before running:

```bash
# Simple
IVR_TREE_PATH=data/ivr-simple.json npm run simulate

# Complex
IVR_TREE_PATH=data/ivr-complex.json npm run simulate

# Fault
IVR_TREE_PATH=data/ivr-fault.json npm run simulate

# Hidden
IVR_TREE_PATH=data/ivr-hide.json npm run simulate
```

## Quick Test Commands

### Test Simple Scenario
```bash
cd /root/rose3/apps/fakeivr/mock-agent
echo "IVR_TREE_PATH=data/ivr-simple.json" >> .env
npm run simulate
```

### Test Complex Scenario
```bash
cd /root/rose3/apps/fakeivr/mock-agent
sed -i 's|IVR_TREE_PATH=.*|IVR_TREE_PATH=data/ivr-complex.json|' .env
npm run simulate
```

### Test Fault Scenario
```bash
cd /root/rose3/apps/fakeivr/mock-agent
sed -i 's|IVR_TREE_PATH=.*|IVR_TREE_PATH=data/ivr-fault.json|' .env
npm run simulate
```

### Test Hidden Scenario
```bash
cd /root/rose3/apps/fakeivr/mock-agent
sed -i 's|IVR_TREE_PATH=.*|IVR_TREE_PATH=data/ivr-hide.json|' .env
npm run simulate
```

## What You'll See

### Simple Scenario Output
```
⚙️  Configuration:
   IVR Scenario: data/ivr-simple.json
   Model: deepseek-chat
   Max Attempts: 20

🔊 IVR SYSTEM:
   "Welcome to XXX Pharmacy..."

[... 5-6 menu selections ...]

✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
```

### Complex Scenario Output
```
⚙️  Configuration:
   IVR Scenario: data/ivr-complex.json

[... many menus, escalations, verifications ...]
[... 10-20 selections with some backtracking ...]

✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
```

### Fault Scenario Output
```
⚙️  Configuration:
   IVR Scenario: data/ivr-fault.json

[... tries many paths ...]
[... all lead to "agents unavailable" or "use website" ...]
[... reaches max attempts ...]

❌ FAILED: Could not connect to human within maximum attempts
```

### Hidden Scenario Output (If Agent Discovers)
```
⚙️  Configuration:
   IVR Scenario: data/ivr-hide.json

[... navigates through menus ...]
[... tries option '0' ...]

✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
```

### Hidden Scenario Output (If Agent Doesn't Discover)
```
⚙️  Configuration:
   IVR Scenario: data/ivr-hide.json

[... tries advertised options only ...]
[... hits dead ends ...]
[... reaches max attempts ...]

❌ FAILED: Could not connect to human within maximum attempts
```

## Verification

Check which scenario is currently active:

```bash
grep IVR_TREE_PATH .env
```

Should output:
```
IVR_TREE_PATH=data/ivr-simple.json
```

## Tips

### For Testing Agent Intelligence
1. Start with **simple** - verify basic functionality
2. Try **complex** - test realistic navigation
3. Try **hidden** - test discovery ability
4. Try **fault** - test failure handling

### For Demonstrations
- **Simple**: Quick demo (30 seconds)
- **Complex**: Impressive navigation (2-3 minutes)
- **Hidden**: Show discovery (varies)
- **Fault**: Show graceful failure (2 minutes)

### For Development
- Use **simple** for quick iteration
- Use **complex** for realistic testing
- Use **fault** for error handling
- Use **hidden** for exploration logic

## Troubleshooting

### "Cannot find module data/ivr-simple.json"
Make sure you're in the correct directory:
```bash
cd /root/rose3/apps/fakeivr/mock-agent
ls data/*.json  # Should show all 4 files
```

### Agent behavior doesn't change
Make sure you edited `.env` and saved it:
```bash
cat .env | grep IVR_TREE_PATH
```

### Want to reset to default
```bash
cp env.example .env
# Then add your API key back
```

## Summary

| Scenario | File | Command |
|----------|------|---------|
| Simple | `data/ivr-simple.json` | Default |
| Complex | `data/ivr-complex.json` | Edit `.env` |
| Fault | `data/ivr-fault.json` | Edit `.env` |
| Hidden | `data/ivr-hide.json` | Edit `.env` |

**Current active scenario shown in output:**
```
⚙️  Configuration:
   IVR Scenario: data/ivr-simple.json  ← This line!
```

