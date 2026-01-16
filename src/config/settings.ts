// src/config/settings.ts
import { readFileSync, existsSync } from 'fs';
import type { AppConfig } from '../types/index.js';

let cachedConfig: AppConfig | null = null;

const defaultConfig: AppConfig = {
  oversightPerson: '',
  confidenceThreshold: 0.8,
  autoCreateHighConfidence: true,
  rules: {
    ignorePatterns: ['just thinking out loud', 'maybe we should', 'I wonder if'],
    alwaysInclude: ['action item', 'todo', 'task', 'follow up', 'will do']
  }
};

export function validateConfig(config: Partial<AppConfig>): asserts config is AppConfig {
  if (!config.oversightPerson || typeof config.oversightPerson !== 'string') {
    throw new Error('Config must have oversightPerson email');
  }
  if (typeof config.confidenceThreshold !== 'number' || config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
    throw new Error('confidenceThreshold must be a number between 0 and 1');
  }
  if (typeof config.autoCreateHighConfidence !== 'boolean') {
    throw new Error('autoCreateHighConfidence must be a boolean');
  }
  if (!config.rules || !Array.isArray(config.rules.ignorePatterns) || !Array.isArray(config.rules.alwaysInclude)) {
    throw new Error('rules must have ignorePatterns and alwaysInclude arrays');
  }
}

export function loadConfig(configPath: string = './config.json'): AppConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);

  const merged: AppConfig = {
    ...defaultConfig,
    ...parsed,
    rules: {
      ...defaultConfig.rules,
      ...parsed.rules
    }
  };

  validateConfig(merged);
  cachedConfig = merged;
  return merged;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

export function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}
