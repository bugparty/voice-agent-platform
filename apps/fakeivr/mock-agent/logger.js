/**
 * Pretty Logger
 * 
 * Formats and displays agent logs in a readable format with colors
 */

import chalk from 'chalk';

export class Logger {
  static formatLog(logEntry) {
    const { timestamp, level, message, data } = logEntry;
    const time = new Date(timestamp).toLocaleTimeString();
    
    let coloredMessage;
    switch (level) {
      case 'success':
        coloredMessage = chalk.green.bold(message);
        break;
      case 'error':
        coloredMessage = chalk.red(message);
        break;
      case 'warning':
        coloredMessage = chalk.yellow(message);
        break;
      case 'info':
      default:
        coloredMessage = chalk.white(message);
        break;
    }

    let output = `${chalk.gray(time)} ${coloredMessage}`;
    
    // Add data if present
    if (data && Object.keys(data).length > 0) {
      const dataStr = Object.entries(data)
        .map(([key, value]) => `${chalk.cyan(key)}: ${chalk.white(value)}`)
        .join(', ');
      output += `\n  ${chalk.gray('└─')} ${dataStr}`;
    }

    return output;
  }

  static printLog(logEntry) {
    console.log(this.formatLog(logEntry));
  }

  static printReport(report) {
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold.cyan('           AGENT NAVIGATION REPORT'));
    console.log('='.repeat(60) + '\n');

    // Status
    if (report.success) {
      console.log(chalk.green.bold('✅ STATUS: SUCCESS - Connected to Human!\n'));
    } else {
      console.log(chalk.red.bold('❌ STATUS: FAILED - Could not connect to human\n'));
    }

    // Statistics
    console.log(chalk.bold('📊 Statistics:'));
    console.log(`  Total Attempts: ${chalk.yellow(report.stats.totalAttempts)}`);
    console.log(`  Total Selections: ${chalk.yellow(report.stats.totalSelections)}`);
    console.log(`  Mistakes Made: ${chalk.yellow(report.stats.mistakesMade)}`);
    console.log(`  Success Rate: ${chalk.yellow(report.stats.successRate + '%')}\n`);

    // Navigation Path
    console.log(chalk.bold('🗺️  Navigation Path:'));
    report.navigationPath.forEach((step) => {
      console.log(`  ${chalk.gray(step.step)}. ${chalk.cyan(step.menu)} → Option ${chalk.yellow(step.selected)}`);
      console.log(`     ${chalk.gray(step.prompt)}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }

  static printSummaryTable(report) {
    console.log(chalk.bold('\n📋 Quick Summary:'));
    console.log('┌─────────────────────────┬──────────────┐');
    console.log(`│ ${chalk.bold('Metric')}                 │ ${chalk.bold('Value')}        │`);
    console.log('├─────────────────────────┼──────────────┤');
    console.log(`│ Success                 │ ${report.success ? chalk.green('✓ Yes') : chalk.red('✗ No')}        │`);
    console.log(`│ Total Attempts          │ ${String(report.stats.totalAttempts).padStart(12)} │`);
    console.log(`│ Mistakes Made           │ ${String(report.stats.mistakesMade).padStart(12)} │`);
    console.log(`│ Final Menu              │ ${String(report.finalState.currentMenu).padStart(12)} │`);
    console.log('└─────────────────────────┴──────────────┘\n');
  }
}

