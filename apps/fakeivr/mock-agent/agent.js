/**
 * Mock IVR Navigation Agent
 * 
 * Main orchestration logic that combines:
 * - IVR Navigator (tree traversal)
 * - LLM Client (decision making)
 * - Logging and error handling
 * 
 * The agent will attempt to navigate through the IVR system
 * until it successfully connects to a human or reaches max attempts.
 */

import { IVRNavigator } from './navigator.js';
import { LLMClient } from './llm-client.js';

export class IVRAgent {
  constructor(config) {
    this.navigator = new IVRNavigator();
    this.llmClient = new LLMClient({
      provider: config.llmProvider || 'openai',
      modelName: config.modelName || 'gpt-4o-mini',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      azureEndpoint: config.azureEndpoint
    });

    this.maxAttempts = config.maxAttempts || 20;
    this.allowMistakes = config.allowMistakes !== false; // default true
    this.mistakeProbability = config.mistakeProbability || 0.15;
    this.goal = 'Connect to a human representative';
    
    this.logs = [];
    this.attempts = 0;
    this.mistakesMade = 0;
  }

  /**
   * Log a message with timestamp
   */
  log(message, level = 'info', data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    this.logs.push(logEntry);
    return logEntry;
  }

  /**
   * Run the agent to navigate the IVR system
   */
  async run() {
    this.log(`🤖 Agent starting navigation with goal: "${this.goal}"`, 'info');
    this.log(`Configuration: Max attempts=${this.maxAttempts}, Allow mistakes=${this.allowMistakes}`, 'info');
    
    while (!this.navigator.isConnected() && this.attempts < this.maxAttempts) {
      this.attempts++;
      
      try {
        await this._makeOneDecision();
        
        // Small delay to simulate real-world timing
        await this._sleep(500);
        
        if (this.navigator.isConnected()) {
          this.log('🎉 SUCCESS! Connected to human representative!', 'success', {
            totalAttempts: this.attempts,
            mistakesMade: this.mistakesMade
          });
          break;
        }
      } catch (error) {
        this.log(`❌ Error during navigation: ${error.message}`, 'error');
        
        // If we hit an error, try to recover by going back
        // (in real scenario, we might have a "back" option)
        if (this.attempts >= this.maxAttempts) {
          this.log('Maximum attempts reached. Giving up.', 'error');
          break;
        }
      }
    }

    if (!this.navigator.isConnected()) {
      this.log('❌ FAILED: Could not connect to human within maximum attempts', 'error');
    }

    return this._generateReport();
  }

  /**
   * Make one navigation decision
   */
  async _makeOneDecision() {
    const currentMenu = this.navigator.getCurrentMenu();
    const history = this.navigator.getHistory();
    
    this.log(`\n📍 Attempt ${this.attempts}: Currently at menu "${currentMenu.id}"`, 'info');
    this.log(`Menu prompt: "${currentMenu.prompt}"`, 'info');
    
    // Get LLM decision
    this.log('🧠 Asking LLM to decide...', 'info');
    const decision = await this.llmClient.decideOption({
      currentMenu,
      navigationHistory: history,
      goal: this.goal
    });

    this.log(`💡 LLM Decision: Option ${decision.selectedOption}`, 'info', {
      reasoning: decision.reasoning,
      confidence: decision.confidence
    });

    // Potentially inject a mistake for learning/testing
    let finalOption = decision.selectedOption;
    if (this._shouldMakeMistake()) {
      finalOption = this._makeRandomMistake(currentMenu, decision.selectedOption);
      this.mistakesMade++;
      this.log(`🔀 Injected mistake: Choosing ${finalOption} instead of ${decision.selectedOption}`, 'warning');
    }

    // Execute the selection
    const result = this.navigator.selectOption(finalOption);
    
    if (result.success) {
      if (result.isHumanConnection) {
        this.log(`✅ ${result.message}`, 'success');
      } else {
        this.log(`➡️  ${result.message}`, 'info');
      }
    } else {
      this.log(`⚠️  ${result.message}`, 'warning');
      
      // If invalid option, the navigator stays at same menu
      // Agent will try again with new LLM decision
    }
  }

  /**
   * Decide whether to inject a mistake
   */
  _shouldMakeMistake() {
    if (!this.allowMistakes) return false;
    return Math.random() < this.mistakeProbability;
  }

  /**
   * Make a random wrong choice (different from LLM's choice)
   */
  _makeRandomMistake(currentMenu, correctOption) {
    const availableOptions = Object.keys(currentMenu.options);
    const wrongOptions = availableOptions.filter(opt => opt !== correctOption);
    
    if (wrongOptions.length === 0) {
      return correctOption; // No wrong option available
    }
    
    const randomIndex = Math.floor(Math.random() * wrongOptions.length);
    return wrongOptions[randomIndex];
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate final report
   */
  _generateReport() {
    const stats = this.navigator.getStats();
    const history = this.navigator.getHistory();
    
    return {
      success: this.navigator.isConnected(),
      stats: {
        totalAttempts: this.attempts,
        totalSelections: stats.totalSelections,
        mistakesMade: this.mistakesMade,
        successRate: this.mistakesMade > 0 
          ? ((this.attempts - this.mistakesMade) / this.attempts * 100).toFixed(1)
          : 100
      },
      navigationPath: history.map((h, i) => ({
        step: i + 1,
        menu: h.menuId,
        selected: h.selectedOption,
        prompt: h.prompt
      })),
      logs: this.logs,
      finalState: {
        currentMenu: stats.currentMenu,
        connectedToHuman: stats.isConnectedToHuman
      }
    };
  }

  /**
   * Get current logs
   */
  getLogs() {
    return this.logs;
  }
}

