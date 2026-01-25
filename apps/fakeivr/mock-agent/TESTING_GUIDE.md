# Testing Guide - All 4 IVR Scenarios

Quick guide to test all scenarios and verify they work correctly.

## Quick Test All Scenarios

### Test 1: Simple Scenario ✅
```bash
cd /root/rose3/apps/fakeivr/mock-agent
IVR_TREE_PATH=data/ivr-simple.json npm run simulate
```

**Expected**: Success in 5-6 steps, connects to human

---

### Test 2: Complex Scenario 🏗️
```bash
cd /root/rose3/apps/fakeivr/mock-agent
IVR_TREE_PATH=data/ivr-complex.json npm run simulate
```

**Expected**: Success in 10-20 steps after navigating escalation paths

---

### Test 3: Fault Scenario ❌
```bash
cd /root/rose3/apps/fakeivr/mock-agent
IVR_TREE_PATH=data/ivr-fault.json npm run simulate
```

**Expected**: FAILURE - no human available, hits max attempts

---

### Test 4: Hidden Scenario 🔐
```bash
cd /root/rose3/apps/fakeivr/mock-agent
IVR_TREE_PATH=data/ivr-hide.json npm run simulate
```

**Expected**: Success IF agent tries option '0', otherwise failure

---

## Verification Checklist

For each test, verify:

- [ ] Correct IVR file loads (shown in configuration)
- [ ] Agent makes intelligent decisions
- [ ] Navigation progresses through menus
- [ ] Expected outcome achieved
- [ ] Statistics displayed at end

## Expected Outcomes Summary

| Scenario | Expected Result | Time | Steps |
|----------|----------------|------|-------|
| Simple | ✅ Success | 30-40s | 5-6 |
| Complex | ✅ Success | 1-2min | 10-20 |
| Fault | ❌ Failure | 2-3min | 20 (max) |
| Hidden | 🎲 Varies | 30s-2min | 1-20 |

## What Success Looks Like

```
══════════════════════════════════════════════════════════════════════
✅ 👤 CONNECTED TO HUMAN REPRESENTATIVE! 👤 ✅
══════════════════════════════════════════════════════════════════════

🔊 "Hello, this is a pharmacy representative. How can I help you?"

🎉 SUCCESS! Agent successfully navigated to human support! 🎉
══════════════════════════════════════════════════════════════════════

📊 Call Statistics:
   Total Menu Selections: 6
   Time Elapsed: 38.2s
   Success Rate: 100%
```

## What Failure Looks Like

```
❌ FAILED: Could not connect to human within maximum attempts

📊 Call Statistics:
   Total Menu Selections: 20
   Time Elapsed: 127.5s
   Success Rate: 0%
```

## All Tests Pass Criteria

✅ **Simple**: Connects successfully  
✅ **Complex**: Connects successfully (may take longer)  
✅ **Fault**: Fails gracefully with proper error message  
✅ **Hidden**: Either succeeds (if discovers '0') or fails gracefully  

## Quick Commands Reference

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

## Files Updated

✅ `navigator.js` - Now loads from `data/` folder  
✅ `agent.js` - Accepts `ivrTreePath` parameter  
✅ `run.js` - Reads `IVR_TREE_PATH` from `.env`  
✅ `visual-simulator.js` - Shows which scenario is active  
✅ `.env` - Added `IVR_TREE_PATH` configuration  
✅ `env.example` - Documented all 4 scenarios  

## All Working! 🎉

