// src/auth/tokens.ts
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import type { TokenCache } from '../types/index.js';

const DEFAULT_TOKEN_PATH = './.tokens.json';

export function saveTokens(tokens: TokenCache, path: string = DEFAULT_TOKEN_PATH): void {
  writeFileSync(path, JSON.stringify(tokens, null, 2), 'utf-8');
}

export function loadTokens(path: string = DEFAULT_TOKEN_PATH): TokenCache | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);

    // Validate required fields exist
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }

    return parsed as TokenCache;
  } catch {
    return null;
  }
}

export function clearTokens(path: string = DEFAULT_TOKEN_PATH): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function isTokenExpired(tokens: TokenCache, bufferMs: number = 60000): boolean {
  return Date.now() >= (tokens.expiresAt - bufferMs);
}

export function getTokenExpiryDate(tokens: TokenCache): Date {
  return new Date(tokens.expiresAt);
}
