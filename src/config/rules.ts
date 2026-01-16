// src/config/rules.ts
import { getConfig } from './settings.js';

export function shouldIgnorePhrase(text: string): boolean {
  const config = getConfig();
  const lowerText = text.toLowerCase();
  return config.rules.ignorePatterns.some(pattern =>
    lowerText.includes(pattern.toLowerCase())
  );
}

export function containsTaskIndicator(text: string): boolean {
  const config = getConfig();
  const lowerText = text.toLowerCase();
  return config.rules.alwaysInclude.some(indicator =>
    lowerText.includes(indicator.toLowerCase())
  );
}

export function isHighConfidence(score: number): boolean {
  const config = getConfig();
  return score >= config.confidenceThreshold;
}
