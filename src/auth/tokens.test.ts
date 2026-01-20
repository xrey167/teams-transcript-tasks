// src/auth/tokens.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { saveTokens, loadTokens, clearTokens, isTokenExpired, getTokenExpiryDate } from './tokens.js';
import { unlinkSync, existsSync, writeFileSync } from 'fs';

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

  it('returns token expiry date', () => {
    const expiresAt = Date.now() + 3600000;
    const tokens = {
      accessToken: 'test',
      refreshToken: 'test',
      expiresAt
    };

    const expiryDate = getTokenExpiryDate(tokens);

    expect(expiryDate).toBeInstanceOf(Date);
    expect(expiryDate.getTime()).toBe(expiresAt);
  });

  it('returns null for invalid token structure', () => {
    // Missing accessToken
    writeFileSync(testPath, JSON.stringify({ refreshToken: 'test', expiresAt: 123 }));
    expect(loadTokens(testPath)).toBeNull();

    // Missing refreshToken
    writeFileSync(testPath, JSON.stringify({ accessToken: 'test', expiresAt: 123 }));
    expect(loadTokens(testPath)).toBeNull();

    // Missing expiresAt
    writeFileSync(testPath, JSON.stringify({ accessToken: 'test', refreshToken: 'test' }));
    expect(loadTokens(testPath)).toBeNull();

    // Wrong types
    writeFileSync(testPath, JSON.stringify({ accessToken: 123, refreshToken: 'test', expiresAt: 123 }));
    expect(loadTokens(testPath)).toBeNull();
  });
});
