#!/usr/bin/env node

/**
 * Visual IVR Call Simulator
 * 
 * Simulates a phone call experience in the terminal with:
 * - IVR voice prompts (what the system "says")
 * - Agent's option selections (what gets pressed)
 * - Realistic timing and visual feedback
 * - Clear indication when human is reached
 */

import dotenv from 'dotenv';
import { IVRAgent } from './agent.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Visual elements
const PHONE_ICON = '📞';
const SPEAKER_ICON = '🔊';
const ROBOT_ICON = '🤖';
const HUMAN_ICON = '👤';
const CHECK_ICON = '✅';
const PRESS_ICON = '⌨️';
const THINKING_ICON = '💭';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printDivider() {
  console.log(chalk.gray('─'.repeat(70)));
}

function printHeader() {
  console.log('\n' + '═'.repeat(70));
  console.log(chalk.bold.cyan('          📞 SIMULATED IVR PHONE CALL 📞'));
  console.log('═'.repeat(70) + '\n');
}

function printCallStart() {
  console.log(chalk.yellow(`${PHONE_ICON} Dialing XXX Pharmacy...`));
  console.log(chalk.yellow(`${PHONE_ICON} Ring... Ring... Ring...`));
  console.log(chalk.green(`${PHONE_ICON} Call connected!\n`));
}

function printIVRPrompt(prompt, options) {
  console.log(chalk.cyan(`${SPEAKER_ICON} IVR SYSTEM:`));
  console.log(chalk.white(`   "${prompt}"`));
  console.log();
  
  Object.entries(options).forEach(([key, opt]) => {
    console.log(chalk.gray(`   ${key}. ${opt.label}`));
  });
  console.log();
}

function printAgentThinking() {
  console.log(chalk.yellow(`${THINKING_ICON} Agent analyzing options...`));
}

function printAgentDecision(option, reasoning, label) {
  console.log(chalk.magenta(`${ROBOT_ICON} AGENT DECISION:`));
  console.log(chalk.white(`   Selected: Option ${option} - "${label}"`));
  console.log(chalk.gray(`   Reasoning: ${reasoning}`));
  console.log();
}

function printKeyPress(option) {
  console.log(chalk.yellow(`${PRESS_ICON} *BEEP* Pressing ${option}...`));
  console.log();
}

function printHumanConnection() {
  console.log('\n' + '═'.repeat(70));
  console.log(chalk.green.bold(`${CHECK_ICON} ${HUMAN_ICON} CONNECTED TO HUMAN REPRESENTATIVE! ${HUMAN_ICON} ${CHECK_ICON}`));
  console.log('═'.repeat(70));
  console.log();
  console.log(chalk.green(`${SPEAKER_ICON} "Hello, this is a pharmacy representative. How can I help you?"`));
  console.log();
  console.log(chalk.bold.green('🎉 SUCCESS! Agent successfully navigated to human support! 🎉'));
  console.log('═'.repeat(70) + '\n');
}

function printCallStats(attempts, timeElapsed) {
  console.log(chalk.cyan('📊 Call Statistics:'));
  console.log(chalk.white(`   Total Menu Selections: ${attempts}`));
  console.log(chalk.white(`   Time Elapsed: ${timeElapsed.toFixed(1)}s`));
  console.log(chalk.white(`   Success Rate: 100%`));
  console.log();
}

class VisualAgent extends IVRAgent {
  constructor(config) {
    super(config);
    this.startTime = Date.now();
  }

  async _makeOneDecision() {
    const currentMenu = this.navigator.getCurrentMenu();
    const history = this.navigator.getHistory();
    
    // Print IVR prompt
    printIVRPrompt(currentMenu.prompt, currentMenu.options);
    await sleep(800);

    // Show agent thinking
    printAgentThinking();
    await sleep(500);

    // Get LLM decision
    const decision = await this.llmClient.decideOption({
      currentMenu,
      navigationHistory: history,
      goal: this.goal
    });

    // Show agent's decision
    const optionLabel = currentMenu.options[decision.selectedOption]?.label || 'Unknown';
    printAgentDecision(decision.selectedOption, decision.reasoning, optionLabel);
    await sleep(600);

    // Potentially inject a mistake
    let finalOption = decision.selectedOption;
    if (this._shouldMakeMistake()) {
      finalOption = this._makeRandomMistake(currentMenu, decision.selectedOption);
      this.mistakesMade++;
      console.log(chalk.red(`⚠️  Agent made a mistake! Pressing ${finalOption} instead of ${decision.selectedOption}`));
      console.log();
      await sleep(500);
    }

    // Show key press
    printKeyPress(finalOption);
    await sleep(400);

    // Execute the selection
    const result = this.navigator.selectOption(finalOption);
    
    if (result.success) {
      if (result.isHumanConnection) {
        // Success!
        const timeElapsed = (Date.now() - this.startTime) / 1000;
        printHumanConnection();
        printCallStats(this.attempts, timeElapsed);
      } else {
        // Moving to next menu
        console.log(chalk.gray(`📍 Navigating to next menu...`));
        printDivider();
        console.log();
        await sleep(300);
      }
    } else {
      // Invalid option
      console.log(chalk.red(`${SPEAKER_ICON} IVR: "Sorry, that was not a valid selection."`));
      console.log();
      await sleep(500);
    }
  }
}

async function main() {
  printHeader();

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY || 
                 process.env.AZURE_OPENAI_API_KEY || 
                 process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error(chalk.red('❌ Error: No API key found!'));
    console.error(chalk.yellow('Please create a .env file with your API key.\n'));
    process.exit(1);
  }

  // Load configuration
  const config = {
    llmProvider: process.env.LLM_PROVIDER || 'openai',
    modelName: process.env.MODEL_NAME || 'gpt-4o-mini',
    apiKey: apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '20'),
    allowMistakes: process.env.ALLOW_MISTAKES !== 'false',
    mistakeProbability: parseFloat(process.env.MISTAKE_PROBABILITY || '0.15'),
    ivrTreePath: process.env.IVR_TREE_PATH || 'data/ivr-simple.json'
  };

  console.log(chalk.cyan('⚙️  Configuration:'));
  console.log(chalk.white(`   IVR Scenario: ${config.ivrTreePath || 'data/ivr-simple.json'}`));
  console.log(chalk.white(`   Model: ${config.modelName}`));
  console.log(chalk.white(`   Max Attempts: ${config.maxAttempts}`));
  if (config.allowMistakes) {
    console.log(chalk.white(`   Mistake Probability: ${(config.mistakeProbability * 100).toFixed(0)}%`));
  }
  console.log();

  await sleep(1000);

  // Simulate call start
  printCallStart();
  await sleep(1500);

  printDivider();
  console.log();

  // Create and run visual agent
  const agent = new VisualAgent(config);

  try {
    await agent.run();
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('\n❌ Error during call:'), error.message);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unexpected error:'), error);
  process.exit(1);
});

// Run
main();

