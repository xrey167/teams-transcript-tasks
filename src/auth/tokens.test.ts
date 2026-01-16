// src/auth/tokens.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveTokens, loadTokens, clearTokens, isTokenExpired } from './tokens.js';
import { unlinkSync, existsSync } from 'fs';

describe('tokens', () => {
  const testPath = './test-tokens.json';

  afterEach(() => {
    if (existsSync(testPath)) {
      unlinkSync(testPath);
    }
  });

  it('saves and loads tokens', () => {
    const tokens = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000
    };

    saveTokens(tokens, testPath);
    const loaded = loadTokens(testPath);

    expect(loaded?.accessToken).toBe('test-access');
    expect(loaded?.refreshToken).toBe('test-refresh');
  });

  it('returns null for missing token file', () => {
    const loaded = loadTokens('./nonexistent.json');
    expect(loaded).toBeNull();
  });

  it('detects expired tokens', () => {
    const expired = {
      accessToken: 'test',
      refreshToken: 'test',
      expiresAt: Date.now() - 1000
    };
    expect(isTokenExpired(expired)).toBe(true);

    const valid = {
      accessToken: 'test',
      refreshToken: 'test',
      expiresAt: Date.now() + 3600000
    };
    expect(isTokenExpired(valid)).toBe(false);
  });

  it('clears tokens', () => {
    const tokens = {
      accessToken: 'test',
      refreshToken: 'test',
      expiresAt: Date.now() + 3600000
    };
    saveTokens(tokens, testPath);
    clearTokens(testPath);

    expect(existsSync(testPath)).toBe(false);
  });
});
