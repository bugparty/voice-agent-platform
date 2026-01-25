# Hidden Option Implementation

## Overview
The "hidden option" feature allows IVR scenarios to have secret options that are **NOT shown** in the menu but **still work** if the LLM agent is smart enough to try them.

## How It Works

### 1. JSON Configuration (ivr-hide.json)
```json
{
  "features": {
    "hidden_option_enabled": true,
    "hidden_option_key": "0",
    "hidden_option_action": "TRANSFER_TO_HUMAN"
  },
  "menus": {
    "welcome_menu": {
      "prompt": "Press 1, 2, 3, or 9",
      "options": {
        "1": { "label": "Support", "next": "support_menu" },
        "2": { "label": "Sales", "next": "sales_menu" },
        "9": { "label": "Repeat", "next": "welcome_menu" }
        // Note: NO option "0" listed here!
      }
    }
  }
}
```

### 2. Code Logic (navigator.js)
```javascript
selectOption(optionKey) {
  const option = menu.options[optionKey];
  
  if (!option) {
    // Check for hidden options
    const features = this.tree.features || {};
    if (features.hidden_option_enabled && 
        optionKey === features.hidden_option_key) {
      // Hidden option discovered!
      if (features.hidden_option_action === 'TRANSFER_TO_HUMAN') {
        this.isConnectedToHuman = true;
        return { success: true, isHiddenOption: true };
      }
    }
    
    // Regular invalid option error
    return { success: false, message: "Invalid option" };
  }
  
  // Regular option processing...
}
```

## Execution Flow

### Scenario A: LLM Sees Available Options
```
Agent queries: getOptionsDescription()
Response:
  Menu: "Press 1, 2, 3, or 9"
  Available options:
    1: Support
    2: Sales
    9: Repeat

⚠️ Option "0" is NOT visible to the LLM!
```

### Scenario B: Smart LLM Tries "0"
```
Agent action: selectOption("0")

Check 1: Is "0" in menu.options? → NO
Check 2: Is hidden_option_enabled? → YES
Check 3: Does optionKey match hidden_key? → YES ("0" === "0")
Check 4: Execute hidden_option_action → TRANSFER_TO_HUMAN

Result: ✅ SUCCESS! Human connected!
Message: "🎉 HIDDEN OPTION DISCOVERED!"
```

### Scenario C: LLM Tries Wrong Invalid Option
```
Agent action: selectOption("5")

Check 1: Is "5" in menu.options? → NO
Check 2: Is hidden_option_enabled? → YES
Check 3: Does optionKey match hidden_key? → NO ("5" ≠ "0")

Result: ❌ FAILURE! Invalid option
Message: "Invalid option '5'. Valid options: 1, 2, 9"
```

## Key Design Decisions

### Why NOT List "0" in JSON?
- Tests LLM creativity and real-world knowledge
- Many real IVR systems have unlisted "0" operator options
- LLM must explore beyond what it sees

### Why Add Hidden Option Logic to JS?
- Keeps JSON clean (no "hidden" labels revealing the secret)
- Centralized logic in navigator
- Easy to extend (multiple hidden keys, conditional triggers, etc.)

### Why Check features.hidden_option_enabled?
- Only applies to specific scenarios (ivr-hide.json)
- Other scenarios (simple, complex, fault) work normally
- Backward compatible

## Testing

Run the simulator and select "Hidden Scenario":
```bash
cd /root/rose3/apps/fakeivr/mock-agent
npm run simulate
# Select option 4: Hidden Scenario
```

Watch if the LLM:
- ✅ Discovers the hidden "0" option
- ❌ Gives up after exploring visible options
- ❌ Tries many invalid options before finding "0"

## Future Enhancements

1. **Multiple hidden keys**: Support array of hidden options
   ```json
   "hidden_option_keys": ["0", "#", "*"]
   ```

2. **Menu-specific hidden options**: Different hidden keys per menu
   ```json
   "menus": {
     "support_menu": {
       "hidden_options": {
         "0": "TRANSFER_TO_HUMAN",
         "#": "PRIORITY_SUPPORT"
       }
     }
   }
   ```

3. **Conditional hidden options**: Only available after N steps
   ```json
   "hidden_option_requirements": {
     "min_steps": 5,
     "visited_menus": ["support_menu", "billing_menu"]
   }
   ```

4. **Progressive hints**: If agent fails many times, provide subtle hints
   ```javascript
   if (invalidAttempts > 10) {
     hint: "Many IVR systems have undocumented options..."
   }
   ```

## Real-World Analogy

This mimics real IVR systems where:
- Companies don't advertise "Press 0 for operator" (they want automation)
- Experienced users know the secret shortcuts
- Smart systems (and LLMs) can discover hidden paths

The hidden option tests if the LLM has "common sense" knowledge about IVR systems!
