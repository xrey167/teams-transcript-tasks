// src/auth/oauth.ts
import {
  PublicClientApplication,
  Configuration,
  AuthenticationResult,
  InteractionRequiredAuthError
} from '@azure/msal-node';
import { saveTokens, loadTokens, isTokenExpired } from './tokens.js';
import { getEnvVar } from '../config/settings.js';
import type { TokenCache } from '../types/index.js';
import http from 'http';
import { URL } from 'url';

const SCOPES = [
  'OnlineMeetingTranscript.Read.All',
  'User.Read.All',
  'Tasks.ReadWrite',
  'Chat.ReadWrite',
  'offline_access'
];

let msalClient: PublicClientApplication | null = null;

function getMsalConfig(): Configuration {
  return {
    auth: {
      clientId: getEnvVar('AZURE_CLIENT_ID'),
      authority: `https://login.microsoftonline.com/${getEnvVar('AZURE_TENANT_ID')}`
    }
  };
}

function getMsalClient(): PublicClientApplication {
  if (!msalClient) {
    msalClient = new PublicClientApplication(getMsalConfig());
  }
  return msalClient;
}

export async function getAccessToken(): Promise<string> {
  const tokens = loadTokens();

  if (tokens && !isTokenExpired(tokens)) {
    return tokens.accessToken;
  }

  if (tokens?.refreshToken) {
    try {
      const result = await refreshAccessToken(tokens.refreshToken);
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        console.log('Refresh token expired, starting new auth flow...');
      } else {
        throw error;
      }
    }
  }

  return await startAuthFlow();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenCache> {
  const client = getMsalClient();

  const result = await client.acquireTokenByRefreshToken({
    refreshToken,
    scopes: SCOPES
  });

  if (!result) {
    throw new Error('Failed to refresh token');
  }

  const tokens: TokenCache = {
    accessToken: result.accessToken,
    refreshToken: result.account?.homeAccountId ? refreshToken : refreshToken,
    expiresAt: result.expiresOn?.getTime() || Date.now() + 3600000
  };

  saveTokens(tokens);
  return tokens;
}

export async function startAuthFlow(): Promise<string> {
  const client = getMsalClient();
  const redirectUri = 'http://localhost:3333/callback';

  const authUrl = await client.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri
  });

  console.log('\n=== Authentication Required ===');
  console.log('Please open this URL in your browser:');
  console.log(authUrl);
  console.log('\nWaiting for authentication...\n');

  const code = await waitForAuthCode(redirectUri);

  const result = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri
  });

  if (!result) {
    throw new Error('Failed to acquire token');
  }

  const tokens: TokenCache = {
    accessToken: result.accessToken,
    refreshToken: (result as any).refreshToken || '',
    expiresAt: result.expiresOn?.getTime() || Date.now() + 3600000
  };

  saveTokens(tokens);
  console.log('Authentication successful!\n');

  return tokens.accessToken;
}

function waitForAuthCode(redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(redirectUri);
    const port = parseInt(url.port) || 3333;

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '', redirectUri);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400);
        res.end('Authentication failed: ' + error);
        server.close();
        reject(new Error(error));
        return;
      }

      if (code) {
        res.writeHead(200);
        res.end('Authentication successful! You can close this window.');
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(port, () => {
      console.log(`Auth callback server listening on port ${port}`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 300000); // 5 minute timeout
  });
}
