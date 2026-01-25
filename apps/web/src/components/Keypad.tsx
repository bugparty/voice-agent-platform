"use client";

import { useState } from "react";
import "./keypad.css";

interface KeypadProps {
  onKeyPress: (digit: string) => void;
  disabled?: boolean;
  highlightedKey?: string | null;
}

const KEYPAD_BUTTONS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

export function Keypad({ onKeyPress, disabled = false, highlightedKey = null }: KeypadProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [displayValue, setDisplayValue] = useState<string>("");

  const handleKeyPress = (digit: string) => {
    if (disabled) return;
    
    setActiveKey(digit);
    setDisplayValue((prev) => prev + digit);
    onKeyPress(digit);
    
    // Visual feedback duration
    setTimeout(() => setActiveKey(null), 150);
  };
  
  // Determine which key should be highlighted (user press or agent press)
  const currentHighlight = activeKey || highlightedKey;

  const handleClear = () => {
    setDisplayValue("");
  };

  const handleBackspace = () => {
    setDisplayValue((prev) => prev.slice(0, -1));
  };

  return (
    <div className="keypad-container">
      <div className="keypad-display">
        <div className="display-screen">
          {displayValue || <span className="display-placeholder">Enter digits...</span>}
        </div>
        <div className="display-controls">
          <button
            className="display-control-btn backspace"
            onClick={handleBackspace}
            disabled={disabled || displayValue.length === 0}
            title="Backspace"
          >
            ←
          </button>
          <button
            className="display-control-btn clear"
            onClick={handleClear}
            disabled={disabled || displayValue.length === 0}
            title="Clear all"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="keypad">
        {KEYPAD_BUTTONS.map((row, rowIndex) => (
          <div key={rowIndex} className="keypad-row">
            {row.map((digit) => (
              <button
                key={digit}
                className={`keypad-button ${currentHighlight === digit ? "active" : ""} ${highlightedKey === digit ? "agent-highlight" : ""} ${disabled ? "disabled" : ""}`}
                onClick={() => handleKeyPress(digit)}
                disabled={disabled}
              >
                <span className="keypad-digit">{digit}</span>
                {digit !== "*" && digit !== "#" && (
                  <span className="keypad-letters">
                    {getLettersForDigit(digit)}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function getLettersForDigit(digit: string): string {
  const letterMap: Record<string, string> = {
    "2": "ABC",
    "3": "DEF",
    "4": "GHI",
    "5": "JKL",
    "6": "MNO",
    "7": "PQRS",
    "8": "TUV",
    "9": "WXYZ",
  };
  return letterMap[digit] || "";
}

