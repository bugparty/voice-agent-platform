#!/usr/bin/env node

/**
 * Interactive IVR Scenario Selector
 * 
 * Prompts user to select which IVR scenario to test,
 * then runs the visual simulator with that scenario.
 */

import { spawn } from 'child_process';
import readline from 'readline';
import chalk from 'chalk';

const scenarios = [
  {
    name: 'Simple Scenario',
    file: 'data/ivr-simple.json',
    description: 'Easy 6-menu demo - Quick success (5-6 steps)',
    difficulty: 'Easy',
    icon: '✅'
  },
  {
    name: 'Complex Scenario',
    file: 'data/ivr-complex.json',
    description: 'Realistic 87-menu pharmacy system - Takes 10-20 steps',
    difficulty: 'Hard',
    icon: '🏗️'
  },
  {
    name: 'Fault Scenario',
    file: 'data/ivr-fault.json',
    description: 'Impossible - No human available (tests failure handling)',
    difficulty: 'Impossible',
    icon: '❌'
  },
  {
    name: 'Hidden Scenario',
    file: 'data/ivr-hide.json',
    description: 'Secret option "0" - Tests discovery ability',
    difficulty: 'Medium-Hard',
    icon: '🔐'
  }
];

function displayMenu() {
  console.log('\n' + '═'.repeat(70));
  console.log(chalk.bold.cyan('           SELECT IVR SCENARIO TO TEST'));
  console.log('═'.repeat(70) + '\n');

  scenarios.forEach((scenario, index) => {
    console.log(chalk.bold(`${scenario.icon} ${index + 1}. ${scenario.name}`));
    console.log(chalk.gray(`   File: ${scenario.file}`));
    console.log(chalk.white(`   ${scenario.description}`));
    console.log(chalk.yellow(`   Difficulty: ${scenario.difficulty}`));
    console.log();
  });

  console.log('═'.repeat(70));
}

function promptUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan('\nEnter your choice (1-4): '), (answer) => {
      rl.close();
      const choice = parseInt(answer);
      
      if (choice >= 1 && choice <= 4) {
        resolve(scenarios[choice - 1]);
      } else {
        console.log(chalk.red('\n❌ Invalid choice. Please run again and select 1-4.'));
        process.exit(1);
      }
    });
  });
}

async function runSimulator(scenario) {
  console.log(chalk.green(`\n✅ Selected: ${scenario.name}`));
  console.log(chalk.gray(`   Loading: ${scenario.file}\n`));
  
  // Small delay for user to see selection
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run visual-simulator with selected scenario
  const env = {
    ...process.env,
    IVR_TREE_PATH: scenario.file
  };

  const child = spawn('node', ['visual-simulator.js'], {
    env: env,
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    process.exit(code);
  });

  child.on('error', (error) => {
    console.error(chalk.red('\n❌ Error running simulator:'), error.message);
    process.exit(1);
  });
}

async function main() {
  displayMenu();
  const scenario = await promptUser();
  await runSimulator(scenario);
}

main();

