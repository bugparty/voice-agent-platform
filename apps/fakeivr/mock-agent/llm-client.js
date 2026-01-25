/**
 * LLM Client
 *
 * Handles communication with LLM APIs (OpenAI, Azure OpenAI, Anthropic)
 * to make decisions about which menu option to select.
 *
 * The LLM is given:
 * - Current menu prompt and options
 * - Goal: connect to human
 * - Navigation history
 *
 * And returns: the option number to select with reasoning
 */

import OpenAI from 'openai';

export class LLMClient {
  constructor(config) {
    this.provider = config.provider || 'openai';
    this.modelName = config.modelName || 'gpt-4o-mini';
    this.apiKey = config.apiKey;

    // Initialize OpenAI client (works for OpenAI and Azure)
    if (this.provider === 'openai' || this.provider === 'azure') {
      const clientConfig = {
        apiKey: this.apiKey
      };

      // Custom base URL (for DeepSeek, etc.)
      if (config.baseUrl) {
        clientConfig.baseURL = config.baseUrl;
      }

      // Azure-specific configuration
      if (this.provider === 'azure') {
        clientConfig.baseURL = config.azureEndpoint;
        clientConfig.defaultQuery = { 'api-version': '2024-02-01' };
        clientConfig.defaultHeaders = { 'api-key': this.apiKey };
      }

      this.client = new OpenAI(clientConfig);
    } else if (this.provider === 'anthropic') {
      // For Anthropic, we'd use their SDK
      // For now, keeping it simple with OpenAI-compatible interface
      throw new Error('Anthropic provider not yet implemented. Use openai or azure.');
    }
  }

  /**
   * Ask LLM to decide which option to select
   * @param {Object} context - Context object with current menu info and history
   * @returns {Object} Decision object with selectedOption and reasoning
   */
  async decideOption(context) {
    const { currentMenu, navigationHistory, goal } = context;

    // Build the prompt for the LLM
    const systemPrompt = this._buildSystemPrompt();
    const userPrompt = this._buildUserPrompt(currentMenu, navigationHistory, goal);

    try {
      const response = await this._callLLM(systemPrompt, userPrompt);
      return this._parseResponse(response);
    } catch (error) {
      console.error('LLM API Error:', error);
      throw new Error(`LLM decision failed: ${error.message}`);
    }
  }

  /**
   * Build system prompt that defines the agent's role
   */
  _buildSystemPrompt() {
    return `You are an intelligent IVR (Interactive Voice Response) navigation agent. Your goal is to help users navigate through phone menu systems to reach a human representative.

You will be presented with:
1. The current menu prompt and available options
2. Your navigation history (what you've selected so far)
3. Your goal (connect to human)

Your task is to:
- Analyze the available menu options
- Choose the option that is most likely to lead to a human representative
- Provide clear reasoning for your choice

Important guidelines:
- Look for keywords like "representative", "agent", "human", "speak to", "operator", "customer service"
- If unsure, prefer options that sound like they lead to customer service or support
- Avoid options that loop back to the main menu unless you're stuck
- Learn from your navigation history - don't repeat unsuccessful patterns
- Sometimes the path to human requires going through several specific menus first

You must respond in this exact JSON format:
{
  "selectedOption": "1",
  "reasoning": "Brief explanation of why you chose this option",
  "confidence": "high|medium|low"
}`;
  }

  /**
   * Build user prompt with current context
   */
  _buildUserPrompt(currentMenu, navigationHistory, goal) {
    const historyText = navigationHistory.length > 0
      ? navigationHistory.map((h, i) =>
          `${i + 1}. At "${h.menuId}": Selected option ${h.selectedOption}`
        ).join('\n')
      : 'No navigation history yet (this is the first menu)';

    const optionsText = Object.entries(currentMenu.options)
      .map(([key, opt]) => `  Option ${key}: ${opt.label}`)
      .join('\n');

    return `GOAL: ${goal}

CURRENT MENU:
Prompt: "${currentMenu.prompt}"

Available Options:
${optionsText}

NAVIGATION HISTORY:
${historyText}

Which option should I select to achieve the goal? Respond only with valid JSON.`;
  }

  /**
   * Call the LLM API
   */
  async _callLLM(systemPrompt, userPrompt) {
    if (this.provider === 'openai' || this.provider === 'azure') {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300,
        response_format: { type: "json_object" }
      });

      return completion.choices[0].message.content;
    }

    throw new Error(`Unsupported provider: ${this.provider}`);
  }

  /**
   * Parse LLM response into structured decision
   */
  _parseResponse(responseText) {
    try {
      const parsed = JSON.parse(responseText);

      // Validate required fields
      if (!parsed.selectedOption) {
        throw new Error('Response missing selectedOption field');
      }

      return {
        selectedOption: String(parsed.selectedOption).trim(),
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 'unknown'
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', responseText);
      throw new Error(`Invalid LLM response format: ${error.message}`);
    }
  }
}

