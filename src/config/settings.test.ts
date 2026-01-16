// src/config/settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfig, validateConfig } from './settings.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

describe('settings', () => {
  const testConfigPath = './test-config.json';

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  it('loads valid config from file', () => {
    const config = {
      oversightPerson: 'test@example.com',
      confidenceThreshold: 0.8,
      autoCreateHighConfidence: true,
      rules: {
        ignorePatterns: ['maybe'],
        alwaysInclude: ['action item']
      }
    };
    writeFileSync(testConfigPath, JSON.stringify(config));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.oversightPerson).toBe('test@example.com');
    expect(loaded.confidenceThreshold).toBe(0.8);
  });

  it('validates config has required fields', () => {
    const invalid = { oversightPerson: 'test@example.com' };
    expect(() => validateConfig(invalid as any)).toThrow();
  });

  it('uses default values for missing optional fields', () => {
    const minimal = {
      oversightPerson: 'test@example.com',
      confidenceThreshold: 0.7,
      autoCreateHighConfidence: false,
      rules: { ignorePatterns: [], alwaysInclude: [] }
    };
    writeFileSync(testConfigPath, JSON.stringify(minimal));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.rules.ignorePatterns).toEqual([]);
  });
});
