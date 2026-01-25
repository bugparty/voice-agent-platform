/**
 * IVR Tree Navigator
 * 
 * Handles navigation through the IVR menu tree structure.
 * Loads the tree from ivr-tree.json and provides methods to:
 * - Get current menu state
 * - Navigate to next menu based on option selection
 * - Check if goal (human connection) is reached
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class IVRNavigator {
  constructor(treeJsonPath = null) {
    // Load IVR tree from JSON
    // Default to simple scenario in data folder
    const treePath = treeJsonPath || join(__dirname, 'data/ivr-simple.json');
    this.tree = JSON.parse(readFileSync(treePath, 'utf-8'));
    
    // Initialize navigation state
    this.currentMenuId = this.tree.entry;
    this.navigationHistory = [];
    this.selectionCount = 0;
    this.isConnectedToHuman = false;
  }

  /**
   * Get the current menu object
   */
  getCurrentMenu() {
    const menu = this.tree.menus[this.currentMenuId];
    if (!menu) {
      throw new Error(`Menu not found: ${this.currentMenuId}`);
    }
    return {
      id: this.currentMenuId,
      prompt: menu.prompt,
      options: menu.options
    };
  }

  /**
   * Get available options for current menu as a formatted string
   */
  getOptionsDescription() {
    const menu = this.getCurrentMenu();
    const optionsList = Object.entries(menu.options).map(([key, opt]) => {
      return `  ${key}: ${opt.label}`;
    });
    
    return `Menu: ${menu.prompt}\n\nAvailable options:\n${optionsList.join('\n')}`;
  }

  /**
   * Select an option and navigate to next menu
   * @param {string} optionKey - The option key to select (e.g., "1", "2", "9")
   * @returns {Object} Result object with success status and message
   */
  selectOption(optionKey) {
    const menu = this.getCurrentMenu();
    const option = menu.options[optionKey];

    // Record this selection in history
    this.navigationHistory.push({
      menuId: this.currentMenuId,
      prompt: menu.prompt,
      selectedOption: optionKey,
      timestamp: new Date().toISOString()
    });
    
    this.selectionCount++;

    // Check if option exists
    if (!option) {
      // Check for hidden options (e.g., pressing "0" for operator)
      const features = this.tree.features || {};
      if (features.hidden_option_enabled && optionKey === features.hidden_option_key) {
        // Hidden option discovered!
        const action = features.hidden_option_action;
        
        if (action === 'TRANSFER_TO_HUMAN') {
          this.isConnectedToHuman = true;
          return {
            success: true,
            message: `🎉 HIDDEN OPTION DISCOVERED! Pressed '${optionKey}' (not listed in menu). Connected to human representative!`,
            isHumanConnection: true,
            isHiddenOption: true,
            totalSteps: this.selectionCount
          };
        }
      }
      
      // No hidden option or wrong key - return error
      return {
        success: false,
        message: `Invalid option '${optionKey}'. Valid options: ${Object.keys(menu.options).join(', ')}`,
        isInvalid: true
      };
    }

    // Check if this connects to human
    if (option.action === 'TRANSFER_TO_HUMAN') {
      this.isConnectedToHuman = true;
      return {
        success: true,
        message: `✅ SUCCESS! Selected option ${optionKey}: "${option.label}". Connected to human representative!`,
        isHumanConnection: true,
        totalSteps: this.selectionCount
      };
    }

    // Navigate to next menu
    if (option.next) {
      const previousMenuId = this.currentMenuId;
      this.currentMenuId = option.next;
      
      return {
        success: true,
        message: `Selected option ${optionKey}: "${option.label}". Moving from ${previousMenuId} to ${this.currentMenuId}`,
        nextMenuId: this.currentMenuId
      };
    }

    return {
      success: false,
      message: `Option ${optionKey} has no next action defined`,
      isError: true
    };
  }

  /**
   * Get navigation history
   */
  getHistory() {
    return this.navigationHistory;
  }

  /**
   * Get current navigation statistics
   */
  getStats() {
    return {
      currentMenu: this.currentMenuId,
      totalSelections: this.selectionCount,
      isConnectedToHuman: this.isConnectedToHuman,
      historyLength: this.navigationHistory.length
    };
  }

  /**
   * Reset navigator to initial state
   */
  reset() {
    this.currentMenuId = this.tree.entry;
    this.navigationHistory = [];
    this.selectionCount = 0;
    this.isConnectedToHuman = false;
  }

  /**
   * Check if currently connected to human
   */
  isConnected() {
    return this.isConnectedToHuman;
  }
}

