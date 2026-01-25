# Usage Examples

## Example 1: Perfect Agent (No Mistakes)

```bash
# Edit .env
ALLOW_MISTAKES=false

# Run
npm run simulate
```

**Result:** Agent navigates perfectly through all menus in 6 steps.

---

## Example 2: Realistic Agent (15% Mistakes)

```bash
# Edit .env
ALLOW_MISTAKES=true
MISTAKE_PROBABILITY=0.15

# Run
npm run simulate
```

**Result:** Agent makes occasional mistakes, goes back, but eventually succeeds.

---

## Example 3: Chaotic Agent (50% Mistakes)

```bash
# Edit .env
ALLOW_MISTAKES=true
MISTAKE_PROBABILITY=0.5

# Run
npm run simulate
```

**Result:** Agent makes many mistakes, takes longer, but still succeeds through persistence.

---

## Example 4: Quick Timeout Test

```bash
# Edit .env
MAX_ATTEMPTS=5

# Run
npm run simulate
```

**Result:** Agent has only 5 attempts to reach human. May fail if unlucky.

---

## Example 5: Test Without API Calls

```bash
node test-navigator.js
```

**Result:** Tests navigation structure without calling LLM API. Instant results.

---

## What Each Command Does

### `npm run simulate` or `npm run call`
Visual phone call experience with:
- IVR prompts shown
- Agent decisions displayed
- Key presses simulated
- Human connection celebrated

### `npm start`
Technical report with:
- Detailed logs
- Navigation statistics
- Final summary report

### `node test-navigator.js`
Quick structure test:
- No API calls
- No LLM decisions
- Just validates JSON structure
- Hardcoded path through tree
