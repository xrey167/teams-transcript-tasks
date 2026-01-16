# Meeting Transcript to Tasks Agent - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an agentic workflow that processes Teams meeting transcripts and creates tasks in Microsoft Planner.

**Architecture:** Local Express server receives Graph webhooks when transcripts are ready. Claude Agent analyzes transcripts, extracts tasks with confidence scoring. High-confidence tasks auto-create in Planner; uncertain tasks go to Teams chat for review.

**Tech Stack:** TypeScript, Express, Claude Agent SDK, Microsoft Graph API, MSAL-Node, ngrok

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`

**Step 1: Initialize package.json**

```json
{
  "name": "teams-transcript-tasks",
  "version": "1.0.0",
  "description": "Automated meeting transcript to Planner tasks workflow",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "type": "module",
  "keywords": ["teams", "planner", "claude", "agent"],
  "license": "MIT",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@azure/msal-node": "^2.16.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "express": "^4.21.0",
    "isomorphic-fetch": "^3.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .env.example**

```
# Azure AD App Registration
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-app-client-secret
AZURE_TENANT_ID=your-tenant-id

# Claude API
ANTHROPIC_API_KEY=your-claude-api-key

# App Config
PORT=3000
NGROK_AUTHTOKEN=your-ngrok-token

# Oversight
OVERSIGHT_PERSON_EMAIL=manager@company.com
MY_USER_ID=your-ms-user-id
```

**Step 4: Install dependencies**

Run: `npm install`
Expected: Dependencies installed, node_modules created

**Step 5: Verify TypeScript compiles**

Run: `npm run build`
Expected: Empty dist folder (no src files yet), no errors

**Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example
git commit -m "chore: initialize project with dependencies"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write type definitions**

```typescript
// src/types/index.ts

// Microsoft Graph types
export interface MeetingTranscript {
  id: string;
  meetingId: string;
  content: string;
  createdDateTime: string;
}

export interface MeetingParticipant {
  id: string;
  displayName: string;
  email: string;
}

export interface Meeting {
  id: string;
  subject: string;
  organizer: MeetingParticipant;
  participants: MeetingParticipant[];
  startDateTime: string;
  endDateTime: string;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

// Planner types
export interface PlannerPlan {
  id: string;
  title: string;
  owner: string;
}

export interface PlannerTask {
  id?: string;
  planId: string;
  bucketId?: string;
  title: string;
  assignments: Record<string, PlannerAssignment>;
  dueDateTime?: string;
  details?: {
    description: string;
  };
}

export interface PlannerAssignment {
  odataType: string;
  orderHint: string;
}

// Task extraction types
export interface ExtractedTask {
  title: string;
  assigneeName: string;
  assigneeEmail?: string;
  dueDate?: string;
  description: string;
  confidence: number;
  meetingContext: {
    meetingId: string;
    meetingSubject: string;
    transcriptExcerpt: string;
  };
}

export interface ReviewTask extends ExtractedTask {
  id: string;
  suggestedAssignees: Array<{
    user: GraphUser;
    confidence: number;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
}

// Webhook types
export interface GraphWebhookNotification {
  subscriptionId: string;
  changeType: string;
  resource: string;
  resourceData: {
    id: string;
    odataType: string;
  };
  clientState: string;
}

export interface WebhookSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}

// Config types
export interface AppConfig {
  oversightPerson: string;
  confidenceThreshold: number;
  autoCreateHighConfidence: boolean;
  rules: {
    ignorePatterns: string[];
    alwaysInclude: string[];
  };
}

// Token types
export interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
```

**Step 2: Verify types compile**

Run: `npm run build`
Expected: `dist/types/index.js` and `dist/types/index.d.ts` created

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 3: Configuration Management

**Files:**
- Create: `src/config/settings.ts`
- Create: `src/config/rules.ts`
- Create: `config.json`
- Test: `src/config/settings.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/config/settings.test.ts`
Expected: FAIL - module not found

**Step 3: Write settings implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/config/settings.test.ts`
Expected: PASS - 3 tests passing

**Step 5: Write rules implementation**

```typescript
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
```

**Step 6: Create default config.json**

```json
{
  "oversightPerson": "manager@company.com",
  "confidenceThreshold": 0.8,
  "autoCreateHighConfidence": true,
  "rules": {
    "ignorePatterns": [
      "just thinking out loud",
      "maybe we should",
      "I wonder if",
      "what if we"
    ],
    "alwaysInclude": [
      "action item",
      "todo",
      "task",
      "follow up",
      "will do",
      "please do",
      "can you",
      "by friday",
      "by monday",
      "by end of"
    ]
  }
}
```

**Step 7: Commit**

```bash
git add src/config/ config.json
git commit -m "feat: add configuration management"
```

---

## Task 4: Token Storage

**Files:**
- Create: `src/auth/tokens.ts`
- Test: `src/auth/tokens.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/auth/tokens.test.ts`
Expected: FAIL - module not found

**Step 3: Write tokens implementation**

```typescript
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
    return JSON.parse(raw) as TokenCache;
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
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/auth/tokens.test.ts`
Expected: PASS - 4 tests passing

**Step 5: Add .tokens.json to .gitignore**

Append to `.gitignore`:
```
# Token storage
.tokens.json
```

**Step 6: Commit**

```bash
git add src/auth/tokens.ts src/auth/tokens.test.ts .gitignore
git commit -m "feat: add secure token storage"
```

---

## Task 5: OAuth Flow

**Files:**
- Create: `src/auth/oauth.ts`

**Step 1: Write OAuth implementation**

```typescript
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
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/auth/oauth.ts
git commit -m "feat: add OAuth authentication flow"
```

---

## Task 6: Graph API Client

**Files:**
- Create: `src/agent/tools/graph.ts`

**Step 1: Write Graph API tools**

```typescript
// src/agent/tools/graph.ts
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { getAccessToken } from '../../auth/oauth.js';
import type {
  MeetingTranscript,
  Meeting,
  MeetingParticipant,
  GraphUser
} from '../../types/index.js';

let graphClient: Client | null = null;

async function getGraphClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  graphClient = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });

  return graphClient;
}

export async function getTranscript(meetingId: string, transcriptId: string): Promise<MeetingTranscript> {
  const client = await getGraphClient();

  const transcript = await client
    .api(`/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}`)
    .get();

  const content = await client
    .api(`/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`)
    .getStream();

  // Convert stream to string
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(Buffer.from(chunk));
  }
  const textContent = Buffer.concat(chunks).toString('utf-8');

  return {
    id: transcript.id,
    meetingId: transcript.meetingId,
    content: textContent,
    createdDateTime: transcript.createdDateTime
  };
}

export async function getMeetingDetails(meetingId: string): Promise<Meeting> {
  const client = await getGraphClient();

  const meeting = await client
    .api(`/me/onlineMeetings/${meetingId}`)
    .select('id,subject,startDateTime,endDateTime,participants')
    .expand('attendeeReport')
    .get();

  return {
    id: meeting.id,
    subject: meeting.subject || 'Untitled Meeting',
    organizer: {
      id: meeting.participants?.organizer?.identity?.user?.id || '',
      displayName: meeting.participants?.organizer?.identity?.user?.displayName || '',
      email: meeting.participants?.organizer?.upn || ''
    },
    participants: (meeting.participants?.attendees || []).map((a: any) => ({
      id: a.identity?.user?.id || '',
      displayName: a.identity?.user?.displayName || '',
      email: a.upn || ''
    })),
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime
  };
}

export async function getMeetingParticipants(meetingId: string): Promise<MeetingParticipant[]> {
  const meeting = await getMeetingDetails(meetingId);
  return [meeting.organizer, ...meeting.participants];
}

export async function searchDirectory(query: string): Promise<GraphUser[]> {
  const client = await getGraphClient();

  const result = await client
    .api('/users')
    .filter(`startswith(displayName,'${query}') or startswith(mail,'${query}')`)
    .select('id,displayName,mail,userPrincipalName')
    .top(10)
    .get();

  return (result.value || []).map((u: any) => ({
    id: u.id,
    displayName: u.displayName,
    mail: u.mail || u.userPrincipalName,
    userPrincipalName: u.userPrincipalName
  }));
}

export async function getCurrentUser(): Promise<GraphUser> {
  const client = await getGraphClient();

  const user = await client
    .api('/me')
    .select('id,displayName,mail,userPrincipalName')
    .get();

  return {
    id: user.id,
    displayName: user.displayName,
    mail: user.mail || user.userPrincipalName,
    userPrincipalName: user.userPrincipalName
  };
}

export async function getUserById(userId: string): Promise<GraphUser | null> {
  const client = await getGraphClient();

  try {
    const user = await client
      .api(`/users/${userId}`)
      .select('id,displayName,mail,userPrincipalName')
      .get();

    return {
      id: user.id,
      displayName: user.displayName,
      mail: user.mail || user.userPrincipalName,
      userPrincipalName: user.userPrincipalName
    };
  } catch {
    return null;
  }
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent/tools/graph.ts
git commit -m "feat: add Microsoft Graph API tools"
```

---

## Task 7: Planner Tools

**Files:**
- Create: `src/agent/tools/planner.ts`

**Step 1: Write Planner tools**

```typescript
// src/agent/tools/planner.ts
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { getAccessToken } from '../../auth/oauth.js';
import type { PlannerPlan, PlannerTask, PlannerAssignment } from '../../types/index.js';

async function getGraphClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
}

export async function getUserPlans(userId: string): Promise<PlannerPlan[]> {
  const client = await getGraphClient();

  const result = await client
    .api(`/users/${userId}/planner/plans`)
    .get();

  return (result.value || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    owner: p.owner
  }));
}

export async function getOrCreatePersonalPlan(userId: string, userDisplayName: string): Promise<PlannerPlan> {
  const plans = await getUserPlans(userId);
  const personalPlanTitle = `${userDisplayName}'s Tasks`;

  const existing = plans.find(p => p.title === personalPlanTitle);
  if (existing) {
    return existing;
  }

  // Create new personal plan - this requires a Group, which is complex
  // For now, return the first available plan or throw
  if (plans.length > 0) {
    return plans[0];
  }

  throw new Error(`No Planner plans found for user ${userId}. Please create a plan first.`);
}

export async function getPlanBuckets(planId: string): Promise<Array<{ id: string; name: string }>> {
  const client = await getGraphClient();

  const result = await client
    .api(`/planner/plans/${planId}/buckets`)
    .get();

  return (result.value || []).map((b: any) => ({
    id: b.id,
    name: b.name
  }));
}

export async function createTask(
  planId: string,
  title: string,
  assigneeIds: string[],
  dueDateTime?: string,
  description?: string
): Promise<PlannerTask> {
  const client = await getGraphClient();

  // Build assignments object
  const assignments: Record<string, PlannerAssignment> = {};
  for (const userId of assigneeIds) {
    assignments[userId] = {
      odataType: '#microsoft.graph.plannerAssignment',
      orderHint: ' !'
    };
  }

  const taskData: any = {
    planId,
    title,
    assignments
  };

  if (dueDateTime) {
    taskData.dueDateTime = dueDateTime;
  }

  const task = await client
    .api('/planner/tasks')
    .post(taskData);

  // Add description if provided
  if (description && task.id) {
    await updateTaskDetails(task.id, description);
  }

  return {
    id: task.id,
    planId: task.planId,
    title: task.title,
    assignments: task.assignments,
    dueDateTime: task.dueDateTime
  };
}

async function updateTaskDetails(taskId: string, description: string): Promise<void> {
  const client = await getGraphClient();

  // Get current etag
  const details = await client
    .api(`/planner/tasks/${taskId}/details`)
    .get();

  await client
    .api(`/planner/tasks/${taskId}/details`)
    .header('If-Match', details['@odata.etag'])
    .patch({
      description
    });
}

export async function addTaskAssignees(taskId: string, assigneeIds: string[]): Promise<void> {
  const client = await getGraphClient();

  // Get current task with etag
  const task = await client
    .api(`/planner/tasks/${taskId}`)
    .get();

  const newAssignments: Record<string, PlannerAssignment> = { ...task.assignments };
  for (const userId of assigneeIds) {
    if (!newAssignments[userId]) {
      newAssignments[userId] = {
        odataType: '#microsoft.graph.plannerAssignment',
        orderHint: ' !'
      };
    }
  }

  await client
    .api(`/planner/tasks/${taskId}`)
    .header('If-Match', task['@odata.etag'])
    .patch({
      assignments: newAssignments
    });
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent/tools/planner.ts
git commit -m "feat: add Microsoft Planner tools"
```

---

## Task 8: Teams Messaging Tools

**Files:**
- Create: `src/agent/tools/teams.ts`

**Step 1: Write Teams messaging tools**

```typescript
// src/agent/tools/teams.ts
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { getAccessToken } from '../../auth/oauth.js';
import type { ReviewTask } from '../../types/index.js';
import { getEnvVar } from '../../config/settings.js';

async function getGraphClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
}

export async function sendReviewMessage(
  recipientUserId: string,
  meetingSubject: string,
  tasks: ReviewTask[]
): Promise<string> {
  const client = await getGraphClient();

  const messageContent = formatReviewMessage(meetingSubject, tasks);

  // Create or get existing chat with user
  const chat = await getOrCreateChat(recipientUserId);

  const message = await client
    .api(`/chats/${chat.id}/messages`)
    .post({
      body: {
        contentType: 'html',
        content: messageContent
      }
    });

  return message.id;
}

async function getOrCreateChat(userId: string): Promise<{ id: string }> {
  const client = await getGraphClient();

  // Try to create a 1:1 chat
  const chat = await client
    .api('/chats')
    .post({
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${getEnvVar('MY_USER_ID')}`
        },
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${userId}`
        }
      ]
    });

  return { id: chat.id };
}

function formatReviewMessage(meetingSubject: string, tasks: ReviewTask[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  let html = `<b>📋 Meeting Task Review (${meetingSubject} - ${date})</b><br><br>`;
  html += `<b>Uncertain tasks found:</b><br><br>`;

  tasks.forEach((task, index) => {
    html += `<b>${index + 1}. "${task.title}"</b><br>`;

    if (task.suggestedAssignees.length > 0) {
      const top = task.suggestedAssignees[0];
      html += `→ Suggested assignee: ${top.user.displayName} (${Math.round(top.confidence * 100)}% match)<br>`;
    } else {
      html += `→ Assignee unclear<br>`;
    }

    if (task.dueDate) {
      html += `→ Due: ${task.dueDate}<br>`;
    } else {
      html += `→ Due: Not mentioned<br>`;
    }

    html += `<br>`;
  });

  html += `<i>Reply with task numbers to approve (e.g., "approve 1, 3") or "skip all"</i>`;

  return html;
}

export async function sendNotification(
  recipientUserId: string,
  message: string
): Promise<void> {
  const client = await getGraphClient();

  const chat = await getOrCreateChat(recipientUserId);

  await client
    .api(`/chats/${chat.id}/messages`)
    .post({
      body: {
        contentType: 'text',
        content: message
      }
    });
}

export async function sendTaskCreatedNotification(
  recipientUserId: string,
  taskTitle: string,
  assigneeName: string,
  meetingSubject: string
): Promise<void> {
  const message = `✅ Task created from "${meetingSubject}": "${taskTitle}" assigned to ${assigneeName}`;
  await sendNotification(recipientUserId, message);
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent/tools/teams.ts
git commit -m "feat: add Teams messaging tools"
```

---

## Task 9: Claude Agent Setup

**Files:**
- Create: `src/agent/prompts.ts`
- Create: `src/agent/agent.ts`

**Step 1: Write system prompts**

```typescript
// src/agent/prompts.ts
export const TASK_EXTRACTION_PROMPT = `You are an AI assistant that extracts action items and tasks from meeting transcripts.

Your job is to:
1. Read the meeting transcript carefully
2. Identify any tasks, action items, follow-ups, or commitments
3. For each task, extract:
   - title: A concise description of the task (max 100 chars)
   - assigneeName: The name of the person responsible (as mentioned in the transcript)
   - dueDate: Any deadline mentioned (in ISO 8601 format if specific, or relative like "next week")
   - description: Context from the meeting about why/how this task should be done
   - confidence: Your confidence that this is a real, actionable task (0.0 to 1.0)

Confidence scoring guidelines:
- 0.9-1.0: Explicit assignment with clear owner ("John, please send the report by Friday")
- 0.7-0.8: Clear task with implied owner ("Marketing will handle the launch")
- 0.5-0.6: Vague task or unclear owner ("Someone should follow up")
- Below 0.5: Speculation or discussion, not a commitment

Return your response as a JSON array of task objects.

Example output:
[
  {
    "title": "Send Q4 report to stakeholders",
    "assigneeName": "John",
    "dueDate": "2026-01-20",
    "description": "Compile and send the Q4 financial report to all stakeholders before the board meeting",
    "confidence": 0.95
  }
]

If no tasks are found, return an empty array: []`;

export const PERSON_MATCHING_PROMPT = `You are matching a name mentioned in a meeting transcript to actual users.

Given a name from the transcript and a list of meeting participants and directory users, determine the best match.

Consider:
- Exact name matches are highest confidence
- First name matches to full names
- Nicknames (Bob -> Robert, Mike -> Michael)
- Partial matches

Return a JSON object with:
{
  "matchedUserId": "the user ID if found, or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
```

**Step 2: Write agent implementation**

```typescript
// src/agent/agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { getEnvVar, getConfig } from '../config/settings.js';
import { TASK_EXTRACTION_PROMPT, PERSON_MATCHING_PROMPT } from './prompts.js';
import { getTranscript, getMeetingParticipants, searchDirectory } from './tools/graph.js';
import { createTask, getOrCreatePersonalPlan, addTaskAssignees } from './tools/planner.js';
import { sendReviewMessage, sendTaskCreatedNotification } from './tools/teams.js';
import { isHighConfidence } from '../config/rules.js';
import type {
  ExtractedTask,
  ReviewTask,
  MeetingParticipant,
  GraphUser,
  Meeting
} from '../types/index.js';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: getEnvVar('ANTHROPIC_API_KEY')
    });
  }
  return anthropicClient;
}

export async function processTranscript(
  meetingId: string,
  transcriptId: string,
  meeting: Meeting
): Promise<{ created: number; queued: number }> {
  const config = getConfig();

  // Fetch transcript
  const transcript = await getTranscript(meetingId, transcriptId);
  const participants = await getMeetingParticipants(meetingId);

  // Extract tasks using Claude
  const tasks = await extractTasks(transcript.content);

  if (tasks.length === 0) {
    console.log('No tasks found in transcript');
    return { created: 0, queued: 0 };
  }

  console.log(`Found ${tasks.length} potential tasks`);

  // Categorize tasks by confidence
  const highConfidence: ExtractedTask[] = [];
  const needsReview: ReviewTask[] = [];

  for (const task of tasks) {
    // Try to match assignee
    const matchResult = await matchPerson(task.assigneeName, participants);

    if (matchResult.user && isHighConfidence(task.confidence) && matchResult.confidence >= 0.8) {
      task.assigneeEmail = matchResult.user.mail;
      highConfidence.push(task);
    } else {
      needsReview.push({
        ...task,
        id: crypto.randomUUID(),
        suggestedAssignees: matchResult.user
          ? [{ user: matchResult.user, confidence: matchResult.confidence }]
          : [],
        status: 'pending',
        meetingContext: {
          meetingId,
          meetingSubject: meeting.subject,
          transcriptExcerpt: ''
        }
      });
    }
  }

  // Auto-create high confidence tasks
  let created = 0;
  for (const task of highConfidence) {
    try {
      await createTaskInPlanner(task, meeting);
      created++;

      // Notify oversight person
      await sendTaskCreatedNotification(
        config.oversightPerson,
        task.title,
        task.assigneeName,
        meeting.subject
      );
    } catch (error) {
      console.error(`Failed to create task: ${task.title}`, error);
      // Move to review queue
      needsReview.push({
        ...task,
        id: crypto.randomUUID(),
        suggestedAssignees: [],
        status: 'pending',
        meetingContext: {
          meetingId,
          meetingSubject: meeting.subject,
          transcriptExcerpt: ''
        }
      });
    }
  }

  // Send review queue to user
  if (needsReview.length > 0) {
    const myUserId = getEnvVar('MY_USER_ID');
    await sendReviewMessage(myUserId, meeting.subject, needsReview);
  }

  return { created, queued: needsReview.length };
}

async function extractTasks(transcriptContent: string): Promise<ExtractedTask[]> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: TASK_EXTRACTION_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the meeting transcript:\n\n${transcriptContent}`
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return [];
  }

  try {
    // Extract JSON from response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('Failed to parse task extraction response');
    return [];
  }
}

async function matchPerson(
  name: string,
  participants: MeetingParticipant[]
): Promise<{ user: GraphUser | null; confidence: number }> {
  // First, try exact match in participants
  const exactMatch = participants.find(
    p => p.displayName.toLowerCase() === name.toLowerCase()
  );
  if (exactMatch) {
    return {
      user: {
        id: exactMatch.id,
        displayName: exactMatch.displayName,
        mail: exactMatch.email,
        userPrincipalName: exactMatch.email
      },
      confidence: 1.0
    };
  }

  // Try first name match
  const firstNameMatch = participants.find(
    p => p.displayName.toLowerCase().startsWith(name.toLowerCase())
  );
  if (firstNameMatch) {
    return {
      user: {
        id: firstNameMatch.id,
        displayName: firstNameMatch.displayName,
        mail: firstNameMatch.email,
        userPrincipalName: firstNameMatch.email
      },
      confidence: 0.85
    };
  }

  // Search directory
  const directoryResults = await searchDirectory(name);
  if (directoryResults.length > 0) {
    const bestMatch = directoryResults[0];
    const confidence = bestMatch.displayName.toLowerCase().includes(name.toLowerCase())
      ? 0.7
      : 0.5;
    return { user: bestMatch, confidence };
  }

  return { user: null, confidence: 0 };
}

async function createTaskInPlanner(
  task: ExtractedTask,
  meeting: Meeting
): Promise<void> {
  const config = getConfig();

  // Find the user to get their plan
  const directoryResults = await searchDirectory(task.assigneeEmail || task.assigneeName);
  if (directoryResults.length === 0) {
    throw new Error(`Could not find user: ${task.assigneeName}`);
  }

  const assignee = directoryResults[0];
  const plan = await getOrCreatePersonalPlan(assignee.id, assignee.displayName);

  // Build assignee list: task owner + meeting organizer + oversight person
  const assigneeIds = [assignee.id];

  if (meeting.organizer.id && !assigneeIds.includes(meeting.organizer.id)) {
    assigneeIds.push(meeting.organizer.id);
  }

  // Get oversight person ID
  const oversightResults = await searchDirectory(config.oversightPerson);
  if (oversightResults.length > 0 && !assigneeIds.includes(oversightResults[0].id)) {
    assigneeIds.push(oversightResults[0].id);
  }

  // Create the task
  const description = `${task.description}\n\nFrom meeting: ${meeting.subject}`;

  await createTask(
    plan.id,
    task.title,
    assigneeIds,
    task.dueDate,
    description
  );
}
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agent/prompts.ts src/agent/agent.ts
git commit -m "feat: add Claude agent for task extraction"
```

---

## Task 10: Webhook Handler

**Files:**
- Create: `src/webhook/handler.ts`

**Step 1: Write webhook handler**

```typescript
// src/webhook/handler.ts
import { Router, Request, Response } from 'express';
import { processTranscript } from '../agent/agent.js';
import { getMeetingDetails } from '../agent/tools/graph.js';
import type { GraphWebhookNotification } from '../types/index.js';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'transcript-webhook-secret';

export function createWebhookRouter(): Router {
  const router = Router();

  // Validation endpoint for Graph subscription
  router.post('/webhook', async (req: Request, res: Response) => {
    // Handle validation request
    const validationToken = req.query.validationToken as string;
    if (validationToken) {
      console.log('Webhook validation request received');
      res.contentType('text/plain');
      res.send(validationToken);
      return;
    }

    // Handle notification
    try {
      const notifications = req.body.value as GraphWebhookNotification[];

      // Respond immediately to Graph
      res.status(202).send();

      // Process notifications asynchronously
      for (const notification of notifications) {
        // Verify client state
        if (notification.clientState !== WEBHOOK_SECRET) {
          console.warn('Invalid client state in notification');
          continue;
        }

        await handleTranscriptNotification(notification);
      }
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).send();
    }
  });

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}

async function handleTranscriptNotification(
  notification: GraphWebhookNotification
): Promise<void> {
  console.log('Processing transcript notification:', notification.resource);

  // Parse resource URL: /communications/onlineMeetings/{meetingId}/transcripts/{transcriptId}
  const resourceParts = notification.resource.split('/');
  const meetingIdIndex = resourceParts.indexOf('onlineMeetings') + 1;
  const transcriptIdIndex = resourceParts.indexOf('transcripts') + 1;

  if (meetingIdIndex === 0 || transcriptIdIndex === 0) {
    console.error('Could not parse meeting/transcript IDs from resource');
    return;
  }

  const meetingId = resourceParts[meetingIdIndex];
  const transcriptId = resourceParts[transcriptIdIndex];

  try {
    // Get meeting details
    const meeting = await getMeetingDetails(meetingId);
    console.log(`Processing transcript for meeting: ${meeting.subject}`);

    // Process the transcript
    const result = await processTranscript(meetingId, transcriptId, meeting);

    console.log(`Transcript processed: ${result.created} tasks created, ${result.queued} queued for review`);
  } catch (error) {
    console.error('Error processing transcript:', error);
    // TODO: Queue for retry
  }
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/webhook/handler.ts
git commit -m "feat: add webhook handler for transcript notifications"
```

---

## Task 11: Webhook Subscription Management

**Files:**
- Create: `src/webhook/subscription.ts`

**Step 1: Write subscription management**

```typescript
// src/webhook/subscription.ts
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { getAccessToken } from '../auth/oauth.js';
import type { WebhookSubscription } from '../types/index.js';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'transcript-webhook-secret';

async function getGraphClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
}

export async function createTranscriptSubscription(
  notificationUrl: string
): Promise<WebhookSubscription> {
  const client = await getGraphClient();

  // Subscription expires in 3 days max for this resource
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 3);

  const subscription = await client
    .api('/subscriptions')
    .post({
      changeType: 'created',
      notificationUrl,
      resource: '/communications/onlineMeetings/getAllTranscripts',
      expirationDateTime: expirationDate.toISOString(),
      clientState: WEBHOOK_SECRET
    });

  console.log(`Subscription created, expires: ${subscription.expirationDateTime}`);

  return {
    id: subscription.id,
    resource: subscription.resource,
    changeType: subscription.changeType,
    notificationUrl: subscription.notificationUrl,
    expirationDateTime: subscription.expirationDateTime,
    clientState: subscription.clientState
  };
}

export async function renewSubscription(
  subscriptionId: string
): Promise<WebhookSubscription> {
  const client = await getGraphClient();

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 3);

  const subscription = await client
    .api(`/subscriptions/${subscriptionId}`)
    .patch({
      expirationDateTime: expirationDate.toISOString()
    });

  console.log(`Subscription renewed, expires: ${subscription.expirationDateTime}`);

  return {
    id: subscription.id,
    resource: subscription.resource,
    changeType: subscription.changeType,
    notificationUrl: subscription.notificationUrl,
    expirationDateTime: subscription.expirationDateTime,
    clientState: subscription.clientState
  };
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const client = await getGraphClient();

  await client
    .api(`/subscriptions/${subscriptionId}`)
    .delete();

  console.log(`Subscription ${subscriptionId} deleted`);
}

export async function listSubscriptions(): Promise<WebhookSubscription[]> {
  const client = await getGraphClient();

  const result = await client
    .api('/subscriptions')
    .get();

  return (result.value || []).map((s: any) => ({
    id: s.id,
    resource: s.resource,
    changeType: s.changeType,
    notificationUrl: s.notificationUrl,
    expirationDateTime: s.expirationDateTime,
    clientState: s.clientState
  }));
}

export function isSubscriptionExpiringSoon(
  subscription: WebhookSubscription,
  hoursThreshold: number = 12
): boolean {
  const expirationDate = new Date(subscription.expirationDateTime);
  const threshold = new Date();
  threshold.setHours(threshold.getHours() + hoursThreshold);

  return expirationDate <= threshold;
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/webhook/subscription.ts
git commit -m "feat: add webhook subscription management"
```

---

## Task 12: Main Entry Point

**Files:**
- Create: `src/index.ts`

**Step 1: Write main entry point**

```typescript
// src/index.ts
import express from 'express';
import { loadConfig, getEnvVar } from './config/settings.js';
import { createWebhookRouter } from './webhook/handler.js';
import {
  createTranscriptSubscription,
  listSubscriptions,
  renewSubscription,
  isSubscriptionExpiringSoon
} from './webhook/subscription.js';
import { getAccessToken } from './auth/oauth.js';

const PORT = parseInt(process.env.PORT || '3000');

async function main() {
  console.log('=== Teams Transcript Tasks Agent ===\n');

  // Load configuration
  try {
    loadConfig();
    console.log('✓ Configuration loaded');
  } catch (error) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }

  // Validate environment
  try {
    getEnvVar('AZURE_CLIENT_ID');
    getEnvVar('AZURE_TENANT_ID');
    getEnvVar('ANTHROPIC_API_KEY');
    console.log('✓ Environment variables validated');
  } catch (error) {
    console.error('Missing environment variables:', error);
    process.exit(1);
  }

  // Authenticate with Microsoft
  console.log('\nAuthenticating with Microsoft...');
  try {
    await getAccessToken();
    console.log('✓ Microsoft authentication successful');
  } catch (error) {
    console.error('Authentication failed:', error);
    process.exit(1);
  }

  // Start Express server
  const app = express();
  app.use(express.json());
  app.use(createWebhookRouter());

  const server = app.listen(PORT, () => {
    console.log(`\n✓ Server listening on port ${PORT}`);
  });

  // Set up ngrok tunnel
  const ngrokUrl = await startNgrokTunnel(PORT);
  console.log(`✓ Ngrok tunnel: ${ngrokUrl}`);

  // Manage webhook subscription
  await setupWebhookSubscription(ngrokUrl);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    server.close();
    process.exit(0);
  });

  console.log('\n=== Ready to process transcripts ===\n');
}

async function startNgrokTunnel(port: number): Promise<string> {
  // Dynamic import for ngrok
  const ngrok = await import('ngrok');

  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (authtoken) {
    await ngrok.default.authtoken(authtoken);
  }

  const url = await ngrok.default.connect(port);
  return url;
}

async function setupWebhookSubscription(baseUrl: string): Promise<void> {
  const notificationUrl = `${baseUrl}/webhook`;

  // Check existing subscriptions
  const existing = await listSubscriptions();
  const transcriptSub = existing.find(s =>
    s.resource.includes('getAllTranscripts')
  );

  if (transcriptSub) {
    if (isSubscriptionExpiringSoon(transcriptSub)) {
      console.log('Renewing expiring subscription...');
      await renewSubscription(transcriptSub.id);
    } else {
      console.log('✓ Using existing webhook subscription');
    }
  } else {
    console.log('Creating new webhook subscription...');
    await createTranscriptSubscription(notificationUrl);
  }

  console.log('✓ Webhook subscription active');
}

main().catch(console.error);
```

**Step 2: Add ngrok to dependencies**

Update package.json to add ngrok:
```json
"dependencies": {
  ...
  "ngrok": "^5.0.0-beta.2"
}
```

**Step 3: Install new dependency**

Run: `npm install`
Expected: ngrok installed

**Step 4: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/index.ts package.json package-lock.json
git commit -m "feat: add main entry point with startup sequence"
```

---

## Task 13: Integration Testing Setup

**Files:**
- Create: `src/test-setup.ts`

**Step 1: Create manual test helper**

```typescript
// src/test-setup.ts
import { loadConfig } from './config/settings.js';
import { getAccessToken } from './auth/oauth.js';
import { getCurrentUser, searchDirectory } from './agent/tools/graph.js';
import { getUserPlans } from './agent/tools/planner.js';

async function testSetup() {
  console.log('=== Testing Setup ===\n');

  // Test config
  try {
    loadConfig();
    console.log('✓ Config loaded successfully');
  } catch (e) {
    console.error('✗ Config error:', e);
    return;
  }

  // Test auth
  console.log('\nTesting authentication...');
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token:', token.substring(0, 20) + '...');
  } catch (e) {
    console.error('✗ Auth error:', e);
    return;
  }

  // Test Graph API
  console.log('\nTesting Graph API...');
  try {
    const user = await getCurrentUser();
    console.log('✓ Current user:', user.displayName, `(${user.mail})`);
  } catch (e) {
    console.error('✗ Graph error:', e);
    return;
  }

  // Test directory search
  console.log('\nTesting directory search...');
  try {
    const results = await searchDirectory('a');
    console.log(`✓ Found ${results.length} users starting with 'a'`);
  } catch (e) {
    console.error('✗ Directory search error:', e);
  }

  // Test Planner
  console.log('\nTesting Planner API...');
  try {
    const user = await getCurrentUser();
    const plans = await getUserPlans(user.id);
    console.log(`✓ Found ${plans.length} Planner plans`);
    plans.forEach(p => console.log(`  - ${p.title}`));
  } catch (e) {
    console.error('✗ Planner error:', e);
  }

  console.log('\n=== Setup Test Complete ===');
}

testSetup().catch(console.error);
```

**Step 2: Add test script to package.json**

Add to scripts:
```json
"test:setup": "tsx src/test-setup.ts"
```

**Step 3: Commit**

```bash
git add src/test-setup.ts package.json
git commit -m "feat: add integration test helper"
```

---

## Task 14: Documentation

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
# Teams Transcript Tasks Agent

Automated workflow that processes Microsoft Teams meeting transcripts and creates tasks in Microsoft Planner.

## Features

- Automatically triggered when meeting transcripts are ready
- AI-powered task extraction using Claude
- Smart person matching (meeting participants → directory)
- High-confidence tasks auto-created in Planner
- Uncertain tasks sent to Teams chat for review
- Role-based task visibility (assignee + organizer + oversight person)

## Setup

### 1. Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Create new registration
3. Add redirect URI: `http://localhost:3333/callback` (Web)
4. Under API permissions, add:
   - `OnlineMeetingTranscript.Read.All`
   - `User.Read.All`
   - `Tasks.ReadWrite`
   - `Chat.ReadWrite`
5. Grant admin consent
6. Create a client secret and note it down

### 2. Configuration

Copy `.env.example` to `.env` and fill in:

```
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
ANTHROPIC_API_KEY=your-claude-api-key
NGROK_AUTHTOKEN=your-ngrok-token
OVERSIGHT_PERSON_EMAIL=manager@company.com
MY_USER_ID=your-microsoft-user-id
```

Edit `config.json` to customize:
- `oversightPerson`: Email of person to CC on all tasks
- `confidenceThreshold`: Auto-create tasks above this confidence (0.8 default)
- `rules`: Patterns for task detection

### 3. Install & Run

```bash
npm install
npm run build
npm start
```

On first run, you'll be prompted to authenticate via browser.

### 4. Test Setup

```bash
npm run test:setup
```

This verifies authentication, Graph API access, and Planner connectivity.

## Usage

Once running, the agent will:
1. Listen for new meeting transcripts via Graph webhooks
2. Automatically process transcripts and extract tasks
3. Create high-confidence tasks in Planner
4. Send uncertain tasks to your Teams chat for approval

## Architecture

See `docs/plans/2026-01-16-meeting-tasks-agent-design.md` for full architecture documentation.

## Development

```bash
npm run dev      # Watch mode
npm run test     # Run tests
npm run build    # Compile TypeScript
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Final Step: Merge to Main

After all tasks are complete and tested:

```bash
git checkout main
git merge feature/implementation
git push origin main
```

---

**Plan complete and saved to `docs/plans/2026-01-16-implementation.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session in the worktree with executing-plans, batch execution with checkpoints

**Which approach?**