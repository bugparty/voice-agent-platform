#!/usr/bin/env node

/**
 * Mock Agent Runner
 * 
 * Entry point to run the IVR navigation agent simulation.
 * Loads configuration from .env and runs the agent.
 */

import dotenv from 'dotenv';
import { IVRAgent } from './agent.js';
import { Logger } from './logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖  MOCK IVR NAVIGATION AGENT');
  console.log('='.repeat(60) + '\n');

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY || 
                 process.env.AZURE_OPENAI_API_KEY || 
                 process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: No API key found in environment variables!');
    console.error('Please create a .env file based on .env.example and add your API key.\n');
    console.error('Example:');
    console.error('  cp .env.example .env');
    console.error('  # Then edit .env and add your OPENAI_API_KEY\n');
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

  console.log('⚙️  Configuration:');
  console.log(`   LLM Provider: ${config.llmProvider}`);
  console.log(`   Model: ${config.modelName}`);
  console.log(`   Max Attempts: ${config.maxAttempts}`);
  console.log(`   Allow Mistakes: ${config.allowMistakes}`);
  if (config.allowMistakes) {
    console.log(`   Mistake Probability: ${(config.mistakeProbability * 100).toFixed(0)}%`);
  }
  console.log('');

  // Create and run agent
  const agent = new IVRAgent(config);

  // Print logs in real-time
  const logInterval = setInterval(() => {
    const logs = agent.getLogs();
    const unprinted = logs.slice(lastPrintedIndex);
    unprinted.forEach(log => Logger.printLog(log));
    lastPrintedIndex = logs.length;
  }, 100);

  let lastPrintedIndex = 0;

  try {
    console.log('🚀 Starting agent...\n');
    const report = await agent.run();
    
    // Clear log printing interval
    clearInterval(logInterval);
    
    // Print any remaining logs
    const logs = agent.getLogs();
    const unprinted = logs.slice(lastPrintedIndex);
    unprinted.forEach(log => Logger.printLog(log));

    // Print final report
    Logger.printReport(report);
    Logger.printSummaryTable(report);

    // Exit with appropriate code
    process.exit(report.success ? 0 : 1);
  } catch (error) {
    clearInterval(logInterval);
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

// Run
main();

