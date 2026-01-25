"""LLM Client for IVR navigation decisions.

Handles communication with LLM APIs (OpenAI-compatible) to make decisions
about which menu option to select.
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional
from openai import OpenAI

logger = logging.getLogger(__name__)


class LLMClient:
    """Client for making LLM-based IVR navigation decisions."""
    
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model: str = "deepseek-chat"
    ):
        """
        Initialize LLM client.
        
        Args:
            api_key: API key for the LLM service
            base_url: Base URL for the API (e.g., https://api.deepseek.com)
            model: Model name to use
        """
        self.model = model
        
        client_config = {"api_key": api_key}
        if base_url:
            client_config["base_url"] = base_url
            
        self.client = OpenAI(**client_config)
        logger.info(f"Initialized LLM client with model: {model}, base_url: {base_url or 'default'}")
    
    def decide_option(
        self,
        transcript: str,
        navigation_history: List[Dict[str, Any]],
        goal: str = "Connect to a human representative"
    ) -> Dict[str, Any]:
        """
        Ask LLM to decide which DTMF option to press based on the transcript.
        
        Args:
            transcript: The IVR menu transcript (what the system said)
            navigation_history: List of previous navigation steps
            goal: The navigation goal
            
        Returns:
            Decision dict with:
                - digit: The DTMF digit to press (e.g., "1", "2", "0")
                - reasoning: Explanation of the decision
                - confidence: "high", "medium", or "low"
        """
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(transcript, navigation_history, goal)
        
        try:
            response_text = self._call_llm(system_prompt, user_prompt)
            decision = self._parse_response(response_text)
            
            logger.info(
                f"LLM Decision: Press '{decision['digit']}' - {decision['reasoning']} "
                f"(confidence: {decision['confidence']})"
            )
            
            return decision
            
        except Exception as e:
            logger.error(f"LLM decision failed: {e}", exc_info=True)
            raise
    
    def _build_system_prompt(self) -> str:
        """Build system prompt that defines the agent's role."""
        return """You are an intelligent IVR (Interactive Voice Response) navigation agent. Your goal is to help users navigate through phone menu systems to reach a human representative.

You will be presented with:
1. The current IVR menu transcript (what the automated system just said)
2. Your navigation history (what you've selected so far)
3. Your goal (connect to human)

Your task is to:
- Analyze the IVR menu transcript
- Identify the available options (usually "press 1 for...", "press 2 for...")
- Choose the DTMF digit that is most likely to lead to a human representative
- Provide clear reasoning for your choice

Important guidelines:
- Look for keywords like "representative", "agent", "human", "speak to", "operator", "customer service", "support"
- If you hear "press 0 for operator" or similar, that's usually the best choice
- If unsure, prefer options that sound like they lead to customer service or support
- Avoid options that loop back to the main menu unless you're stuck
- Learn from your navigation history - don't repeat unsuccessful patterns
- Sometimes the path to human requires going through specific department menus first

You must respond in this exact JSON format:
{
  "digit": "1",
  "reasoning": "Brief explanation of why you chose this digit",
  "confidence": "high"
}

The "digit" field should contain ONLY a single digit (0-9) or * or #."""
    
    def _build_user_prompt(
        self,
        transcript: str,
        navigation_history: List[Dict[str, Any]],
        goal: str
    ) -> str:
        """Build user prompt with current context."""
        history_text = "No navigation history yet (this is the first menu)"
        if navigation_history:
            history_items = []
            for i, step in enumerate(navigation_history, 1):
                transcript_preview = step.get('transcript', '')[:100]
                digit = step.get('digit', '?')
                history_items.append(
                    f"{i}. Heard: \"{transcript_preview}...\" → Pressed: {digit}"
                )
            history_text = "\n".join(history_items)
        
        return f"""GOAL: {goal}

CURRENT IVR TRANSCRIPT:
"{transcript}"

NAVIGATION HISTORY:
{history_text}

Which DTMF digit should I press to achieve the goal? Analyze the transcript carefully and respond only with valid JSON."""
    
    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call the LLM API."""
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=300,
                response_format={"type": "json_object"}
            )
            
            return completion.choices[0].message.content
            
        except Exception as e:
            logger.error(f"LLM API call failed: {e}")
            raise
    
    def _parse_response(self, response_text: str) -> Dict[str, Any]:
        """Parse LLM response into structured decision."""
        try:
            parsed = json.loads(response_text)
            
            # Validate required fields
            if "digit" not in parsed:
                raise ValueError("Response missing 'digit' field")
            
            digit = str(parsed["digit"]).strip()
            
            # Validate digit format (0-9, *, #)
            if not digit or len(digit) != 1 or digit not in "0123456789*#":
                raise ValueError(f"Invalid digit: {digit}")
            
            return {
                "digit": digit,
                "reasoning": parsed.get("reasoning", "No reasoning provided"),
                "confidence": parsed.get("confidence", "unknown")
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {response_text}")
            raise ValueError(f"Invalid JSON response: {e}")
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {response_text}")
            raise ValueError(f"Invalid LLM response format: {e}")

