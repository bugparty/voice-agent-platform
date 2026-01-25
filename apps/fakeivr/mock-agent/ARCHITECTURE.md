# Architecture Overview

This document explains the technical architecture and design decisions for the Mock IVR Navigation Agent.

## System Design

### Core Concept

The agent simulates an AI assistant that helps users navigate complex phone menu systems (IVR) to reach a human representative. Instead of hardcoded rules, it uses Large Language Models (LLMs) to make intelligent, context-aware decisions.

### Design Philosophy

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Testability**: Navigator can be tested independently without LLM API calls
3. **Flexibility**: Easy to swap LLM providers or modify IVR tree structure
4. **Observability**: Comprehensive logging at every step
5. **Real-world Simulation**: Includes mistake injection to simulate learning behavior

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Mock Agent System                        │ 
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │    run.js       │
                          │  (Entry Point)  │
                          │  - Load config  │
                          │  - Validate API │
                          │  - Display logs │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │    agent.js     │
                          │ (Orchestrator)  │
                          │  - Main loop    │
                          │  - Error handling│
                          │  - Reporting    │
                          └────────┬────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          ┌──────────────────┐         ┌──────────────────┐
          │  navigator.js    │         │ llm-client.js    │
          │  (State Machine) │         │  (AI Decision)   │
          │  - Load tree     │         │  - Call LLM API  │
          │  - Track state   │         │  - Parse response│
          │  - Validate moves│         │  - Return choice │
          └──────────────────┘         └──────────────────┘
                    │                             │
                    ▼                             ▼
          ┌──────────────────┐         ┌──────────────────┐
          │  ivr-tree.json   │         │  OpenAI API      │
          │  (Data Source)   │         │  (External)      │
          └──────────────────┘         └──────────────────┘
                    │
                    └─────────────┐
                                  ▼
                          ┌─────────────────┐
                          │   logger.js     │
                          │ (Output Format) │
                          │  - Pretty print │
                          │  - Color coding │
                          │  - Reports      │
                          └─────────────────┘
```

## Data Flow

### 1. Initialization
```
run.js → Load .env config → Create Agent → Initialize Navigator & LLM Client
```

### 2. Decision Loop (repeats until success or max attempts)
```
Agent → Navigator.getCurrentMenu()
       ↓
Agent → LLM Client.decideOption({currentMenu, history, goal})
       ↓
LLM Client → OpenAI API (with prompt)
       ↓
LLM Client ← JSON response {selectedOption, reasoning, confidence}
       ↓
Agent → [Optional] Inject mistake
       ↓
Agent → Navigator.selectOption(choice)
       ↓
Navigator → Check if TRANSFER_TO_HUMAN reached
       ↓
       ├─ Yes → Set isConnected=true → Return to Agent → SUCCESS
       └─ No  → Update currentMenu → Return to Agent → Continue loop
```

### 3. Completion
```
Agent → Generate report with stats & history
       ↓
Logger → Pretty print results
       ↓
Exit with code 0 (success) or 1 (failure)
```

## Algorithm: LLM-Guided Navigation

### Why LLM Instead of Traditional Algorithms?

Traditional pathfinding algorithms (A*, BFS, DFS) require:
- Known graph structure
- Heuristic functions
- Distance metrics
- Goal node identification

For IVR systems:
- ❌ No explicit "goal node" label in the data
- ❌ Labels are natural language, not machine-readable codes
- ❌ Optimal path is semantic, not geometric
- ❌ Menu structures vary wildly across companies

LLMs provide:
- ✅ Natural language understanding
- ✅ Semantic similarity matching
- ✅ Context awareness
- ✅ Zero-shot learning (works on any IVR tree)

### Algorithm Pseudocode

```
function navigateIVR():
    current = startMenu
    history = []
    attempts = 0

    while not isConnectedToHuman and attempts < MAX_ATTEMPTS:
        attempts++

        // Get current state
        menu = getCurrentMenu(current)
        options = menu.options

        // Ask LLM for decision
        context = {
            menu: menu,
            history: history,
            goal: "connect to human representative"
        }
        decision = callLLM(context)

        // Optional: Inject mistake for testing
        if shouldMakeMistake():
            decision = chooseRandomWrongOption(options, decision)

        // Execute decision
        result = selectOption(decision)
        history.append(result)

        // Check success
        if result.action == "TRANSFER_TO_HUMAN":
            return SUCCESS

        // Update state
        current = result.nextMenu

    return FAILURE
```

### LLM Prompt Engineering

The effectiveness of the agent depends heavily on the prompt design:

**System Prompt** (Role Definition):
- Defines agent as IVR navigation expert
- Lists keywords to look for ("representative", "agent", "human")
- Specifies response format (JSON)
- Provides decision-making guidelines

**User Prompt** (Context):
- Current menu prompt (exact text user would hear)
- Available options with labels
- Navigation history (what we've tried)
- Goal statement (connect to human)

**Response Format** (Structured Output):
```json
{
  "selectedOption": "1",
  "reasoning": "Why this choice makes sense",
  "confidence": "high|medium|low"
}
```

The `response_format: {type: "json_object"}` parameter ensures LLM returns valid JSON.

## Key Design Decisions

### 1. Why Separate Navigator from Agent?

**Benefits**:
- Navigator can be unit tested without API calls
- Easy to verify tree structure independently
- Navigator is reusable with different decision engines
- Clear separation: Navigator handles "what", Agent handles "how"

**Trade-off**: More files, but better maintainability

### 2. Why Inject Mistakes?

Real-world scenarios:
- LLMs can make errors
- Users might provide incorrect IVR trees
- Testing robustness requires failure scenarios

The mistake injection allows studying:
- Error recovery patterns
- How history helps avoid repeated mistakes
- Whether LLM learns from failed attempts

### 3. Why JSON Response Format?

**Alternatives considered**:
- Plain text: Hard to parse reliably
- XML: Verbose, no LLM advantage
- Custom format: Requires special parsing

**JSON chosen because**:
- Native LLM support (OpenAI's JSON mode)
- Easy to parse and validate
- Standard format for APIs
- Type-safe with proper validation

### 4. Why Real-time Logging?

**Problem**: LLM API calls can take 1-5 seconds each. Users need feedback.

**Solution**: Interval-based log printing
```javascript
setInterval(() => {
  printNewLogs();
}, 100);
```

Provides responsive UI without blocking agent execution.

## Configuration Design

Environment variables used instead of config files because:
- ✅ Security: API keys never committed to git
- ✅ 12-factor app compliance
- ✅ Easy deployment to cloud platforms
- ✅ Per-environment customization

## Error Handling Strategy

### Levels of Error Handling

1. **LLM API Errors**: Caught in llm-client.js, thrown to agent
2. **Invalid Options**: Handled by navigator, returns error result
3. **Max Attempts**: Agent terminates gracefully with report
4. **Fatal Errors**: Process exits with code 1

### Recovery Mechanisms

- Invalid option → Stay at same menu, LLM tries again
- LLM timeout → Retry with exponential backoff (could be added)
- Menu not found → Fatal error (indicates tree corruption)

## Performance Characteristics

### Time Complexity
- Per decision: O(1) tree lookup + O(LLM) API call
- Total: O(n × LLM) where n = depth of tree
- Typical: 5-10 menu selections = 5-50 seconds

### Space Complexity
- O(n) for navigation history
- O(m) for menu tree storage (m = total menus)
- O(1) for current state

### API Cost
- ~100-300 tokens per decision
- Typical run: 5 decisions × 300 tokens = 1,500 tokens
- Cost with gpt-4o-mini: ~$0.0002 per run (negligible)

## Scalability Considerations

### Current Limitations
- Single-threaded (one navigation at a time)
- In-memory state (no persistence)
- Synchronous execution

### Future Enhancements
- Parallel agent runs for comparison testing
- Database storage for history analysis
- Async/await optimization
- Batch LLM calls for multiple scenarios

## Testing Strategy

### Unit Tests
- `test-navigator.js`: Navigator without LLM
- Future: Mock LLM responses for agent testing

### Integration Tests
- Full run with real API
- Verify against known-good IVR trees

### Validation Tests
- Mistake injection: Does agent recover?
- Max attempts: Does it terminate gracefully?
- Invalid tree: Does it report errors clearly?

## Extension Points

### Easy to Add

1. **New LLM Provider**
   - Implement in `llm-client.js`
   - Add API key to `.env`
   - No changes to other components

2. **Different IVR Tree**
   - Replace `ivr-tree.json`
   - No code changes needed

3. **Custom Logging Format**
   - Modify `logger.js`
   - Agent and navigator unchanged

4. **Advanced Metrics**
   - Add to `agent._generateReport()`
   - Logger displays new metrics

### Moderate Effort

1. **Backtracking Algorithm**
   - Add "back" option detection in navigator
   - Agent tracks dead ends
   - Implement graph traversal

2. **Multi-Agent Comparison**
   - Run multiple agents with different configs
   - Compare success rates and paths
   - Statistical analysis

3. **Learning from History**
   - Store successful paths in database
   - Use as few-shot examples for LLM
   - Improve decision quality over time

### Complex Changes

1. **Voice Integration**
   - Connect to actual Twilio API
   - Convert to real-time system
   - Handle audio input/output

2. **Reinforcement Learning**
   - Replace LLM with RL agent
   - Train on successful/failed paths
   - Optimize for speed and accuracy

## Security Considerations

- ✅ API keys in `.env` (gitignored)
- ✅ No sensitive data logged
- ✅ No eval() or code execution from LLM responses
- ✅ JSON schema validation for LLM responses
- ⚠️  Future: Rate limiting for API calls
- ⚠️  Future: Input sanitization for custom IVR trees

## Dependencies

### Production
- `openai`: Official OpenAI SDK (MIT license)
- `dotenv`: Load environment variables (BSD license)
- `chalk`: Terminal colors (MIT license)

### Why These?
- **openai**: Industry standard, well-maintained, TypeScript support
- **dotenv**: De facto standard for config management
- **chalk**: Most popular terminal styling library

### Alternatives Considered
- `axios` for API: Rejected - OpenAI SDK handles auth better
- `winston` for logging: Rejected - Overkill for this use case
- `colors` for terminal: Rejected - Chalk has better modern API

## Deployment Options

### Local Development
```bash
node run.js
```

### Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "run.js"]
```

### Cloud Functions
- AWS Lambda: Package as layer, run on demand
- Google Cloud Functions: Deploy as HTTP trigger
- Cloudflare Workers: Modify for edge runtime

### CI/CD Integration
```yaml
- name: Test IVR Agent
  run: |
    cd mock-agent
    npm install
    OPENAI_API_KEY=${{ secrets.OPENAI_KEY }} npm start
```

## Conclusion

This architecture prioritizes:
1. **Simplicity**: Easy to understand and modify
2. **Flexibility**: Swappable components
3. **Reliability**: Comprehensive error handling
4. **Observability**: Detailed logging
5. **Extensibility**: Clear extension points

The LLM-based approach provides a unique advantage: **zero-shot generalization** to any IVR system without manual rule configuration.

