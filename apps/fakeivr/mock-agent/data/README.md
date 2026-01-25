# IVR Test Scenarios

This folder contains different IVR tree configurations for testing the agent.

## Files

### 1. `ivr-simple.json` (Original)
- **Purpose**: Basic 5-level menu system
- **Path to human**: Straightforward (6 steps)
- **Difficulty**: Easy
- **Has human transfer**: ✅ Yes
- **Use case**: Initial testing, demo

### 2. `ivr-complex.json` 
- **Purpose**: Realistic complex pharmacy IVR with 87 menus
- **Path to human**: Multiple paths via escalation
- **Difficulty**: Hard (many dead ends and loops)
- **Has human transfer**: ✅ Yes (via `escalation_gate_menu` → option 3)
- **Use case**: Testing agent intelligence and navigation
- **Features**:
  - 26+ escalation points throughout
  - Verification menus
  - Multiple service categories
  - Realistic dead ends

### 3. `ivr-fault.json` ⚠️
- **Purpose**: Impossible scenario (no human available)
- **Path to human**: ❌ NONE - Designed to fail
- **Difficulty**: Impossible
- **Has human transfer**: ❌ NO (`human_transfer_available: false`)
- **Use case**: Testing agent behavior in failure scenarios
- **Features**:
  - 50 menus with 470 lines
  - All "speak to agent" options → unavailable
  - Most paths lead to "use website" (dead end)
  - Infinite wait loops (`wait_more_menu`)
  - Verification loops that never succeed
  - Email/callback services "unavailable"
  - Everything redirects online

### 4. `ivr-hide.json` 🔐
- **Purpose**: Hidden human transfer option (secret key)
- **Path to human**: Press '0' at specific menus (NOT advertised)
- **Difficulty**: Medium-Hard (requires discovery)
- **Has human transfer**: ✅ Yes (9 hidden locations)
- **Use case**: Testing agent's ability to discover undocumented options
- **Features**:
  - 66 menus with 557 lines
  - Option '0' exists but NOT mentioned in prompts
  - 9 strategic locations with TRANSFER_TO_HUMAN
  - Labels say "Hidden direct line" etc. (but voice doesn't say this)
  - Simulates real companies that hide human option
  - Agent must try '0' to discover it

## How to Use Different Scenarios

### Test with Simple IVR (default)
```bash
cd /root/rose3/apps/fakeivr/mock-agent
# Uses ../ivr-tree.json by default
npm run simulate
```

### Test with Complex IVR
```bash
# Modify navigator.js to load data/ivr-complex.json
# Or pass it as parameter (if implemented)
npm run simulate
```

### Test with Fault Scenario (No Human)
```bash
# Modify navigator.js to load data/ivr-fault.json
npm run simulate
# Expected: Agent will try many paths and eventually give up
```

## Fault Scenario Details

**Company**: FrustrationCo Services (fictional)

**Design Pattern**: Dead Loop Hell
- Every "speak to representative" → "all agents busy, wait 2 hours"
- Wait option → infinite loop
- All solutions → "please visit website"
- Website help → "use website to find help on website"
- Verification → always fails → loops back
- Email/callback → "service unavailable"

**Purpose**: Test how agent handles:
- Impossible goals
- Circular references
- No path to success
- Maximum attempts reached
- Failure reporting

## Comparison Table

| Feature | Simple | Complex | Fault | Hide |
|---------|--------|---------|-------|------|
| Menus | 6 | 87 | 50 | 66 |
| Lines | 121 | 958 | 470 | 557 |
| Human Transfer | ✅ Yes | ✅ Yes | ❌ No | 🔐 Hidden |
| Difficulty | Easy | Hard | Impossible | Medium-Hard |
| Loops | Few | Some | Many | Few |
| Escalation | Direct | 26 paths | Fake | Secret (0) |
| Advertised | Yes | Yes | Fake | ❌ No |
| Success Rate | ~100% | ~80% | 0% | ~30-50% |
| Test Purpose | Demo | Realism | Failure handling | Discovery |

## Expected Agent Behavior

### Simple IVR
- ✅ Succeeds in 5-6 steps
- ✅ Direct path
- ✅ High confidence

### Complex IVR
- ✅ Eventually succeeds (10-20 steps)
- ⚠️ May hit dead ends
- ⚠️ May make mistakes
- ✅ Learns from history

### Fault IVR
- ❌ Cannot succeed (no human exists)
- ⚠️ Tries many paths
- ⚠️ Hits max attempts
- ❌ Reports failure
- 📊 Good for testing error handling

### Hide IVR
- 🔐 Can succeed if discovers secret
- 🔍 Must try unlisted option '0'
- ⚠️ Most paths are dead ends
- ✅ Success if explores thoroughly
- 📊 Tests discovery and exploration

## Modifying Navigator to Use Different Files

Edit `navigator.js` constructor:

```javascript
// Default (uses ivr-tree.json in parent folder)
this.tree = JSON.parse(readFileSync(treePath, 'utf-8'));

// Use complex IVR
const treePath = treeJsonPath || join(__dirname, 'data/ivr-complex.json');

// Use fault IVR
const treePath = treeJsonPath || join(__dirname, 'data/ivr-fault.json');
```

Or pass path when creating navigator:
```javascript
const navigator = new IVRNavigator('data/ivr-fault.json');
```

## Hidden Option Scenario Details

**File**: `ivr-hide.json`
**Company**: SneakyTech Solutions (fictional)

### The Secret

Many real-world IVR systems have **undocumented shortcuts**:
- Pressing `0` often connects to operator
- Pressing `*` or `#` might have special functions
- These are NOT mentioned in voice prompts

**This scenario simulates that!**

### Hidden Option Locations

Option `0` leads to human at these menus:
1. `welcome_menu` - Main menu (immediate connection)
2. `support_menu` - Product support
3. `software_menu` - Software support
4. `software_v4_menu` - Version 4 support
5. `update_help_menu` - Update issues
6. `advanced_menu` - Advanced features
7. `hardware_menu` - Hardware support
8. `warranty_menu` - Warranty services
9. `sales_menu` - Sales department

### What Voice Says vs What Exists

**Voice Prompt Example**:
```
"Product support. Press 1 for technical issues, 
2 for returns, 3 for warranty, or 9 to go back."
```

**Available Options in JSON**:
- 1: Technical issues ✅ (mentioned)
- 2: Returns ✅ (mentioned)
- 3: Warranty ✅ (mentioned)
- 9: Go back ✅ (mentioned)
- **0: TRANSFER_TO_HUMAN** 🔐 (NOT mentioned!)

### How Agent Should Discover

**Strategies the agent might use**:
1. **Try common shortcuts**: Always attempt `0`, `*`, `#`
2. **Learn from patterns**: Notice when `0` works
3. **Explore systematically**: Try all digits 0-9
4. **Read metadata**: Check if `human_option_advertised: false`

### Success Scenarios

**Fast discovery** (3-5 steps):
- Agent tries `0` at welcome menu immediately → Connected!

**Medium discovery** (8-12 steps):
- Agent navigates normally
- Gets frustrated with dead ends
- Tries `0` at support menu → Connected!

**Slow discovery** (15-20 steps):
- Agent explores many paths
- Eventually tries `0` somewhere → Connected!

**No discovery** (hits max attempts):
- Agent never tries `0`
- Exhausts all advertised options
- Gives up → Failure

### Testing Value

This scenario tests:
- ✅ **Exploration**: Does agent try undocumented options?
- ✅ **Learning**: Does it remember when `0` works?
- ✅ **Creativity**: Does it think outside advertised options?
- ✅ **Common knowledge**: Does it know typical IVR shortcuts?
- ✅ **Persistence**: Does it keep trying after dead ends?

### Expected Agent Performance

| Agent Type | Success Rate | Explanation |
|------------|--------------|-------------|
| Basic LLM | 30-40% | May try `0` based on common knowledge |
| Smart LLM | 50-70% | Likely tries common shortcuts |
| Fine-tuned | 80-90% | Trained on IVR patterns |
| Random | 10-20% | Might hit `0` by chance |

### Real-World Examples

Companies that use hidden options:
- **Banks**: Press `0` for operator (rarely mentioned)
- **Airlines**: Press `*` for main menu
- **Telecom**: Press `#` repeatedly to reach human
- **Insurance**: Press `0` twice quickly

**Our mock simulates this real behavior!**
