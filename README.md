# Teams Transcript Tasks Agent

An intelligent automation agent that processes Microsoft Teams meeting transcripts and automatically creates tasks in Microsoft Planner using Claude AI.

## Overview

This agent listens for new meeting transcripts via Microsoft Graph webhooks, extracts action items using Claude AI, and creates tasks in Microsoft Planner with smart assignee matching. Tasks with high confidence are created automatically, while uncertain ones are sent to Teams chat for manual review.

## Features

- **Real-time Transcript Processing** - Automatically triggered when Teams meeting transcripts are ready via Graph webhooks
- **AI-Powered Task Extraction** - Uses Claude AI to intelligently identify action items, deadlines, and assignees from natural conversation
- **Confidence-Based Workflow** - High-confidence tasks (configurable threshold) are auto-created; uncertain tasks go to review queue
- **Smart Person Matching** - Matches names from transcripts to actual users via meeting participants and directory search
- **Role-Based Task Assignment** - Tasks are visible to assignee, meeting organizer, and configurable oversight person
- **Teams Chat Integration** - Sends uncertain tasks to your Teams chat for approval/rejection
- **Configurable Rules** - Define patterns to ignore ("just thinking out loud") or always include ("action item")

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Microsoft      │     │   Webhook    │     │    Claude AI    │
│  Graph API      │────▶│   Handler    │────▶│  Task Extraction│
│  (Transcripts)  │     │  (Express)   │     │                 │
└─────────────────┘     └──────────────┘     └────────┬────────┘
                                                       │
                        ┌──────────────────────────────┴──────────────────────────────┐
                        │                                                              │
                        ▼                                                              ▼
              ┌─────────────────┐                                           ┌─────────────────┐
              │ High Confidence │                                           │  Low Confidence │
              │     Tasks       │                                           │     Tasks       │
              └────────┬────────┘                                           └────────┬────────┘
                       │                                                              │
                       ▼                                                              ▼
              ┌─────────────────┐                                           ┌─────────────────┐
              │ Microsoft       │                                           │   Teams Chat    │
              │ Planner         │                                           │   Review Queue  │
              │ (Auto-create)   │                                           │                 │
              └─────────────────┘                                           └─────────────────┘
```

## Project Structure

```
src/
├── index.ts              # Main entry point, Express server, ngrok tunnel
├── test-setup.ts         # Integration test helper
├── types/
│   └── index.ts          # TypeScript interfaces
├── config/
│   ├── settings.ts       # Configuration loading and validation
│   └── rules.ts          # Task filtering rules (ignore/include patterns)
├── auth/
│   ├── oauth.ts          # Microsoft OAuth 2.0 flow with MSAL
│   └── tokens.ts         # Token caching (save/load/refresh)
├── utils/
│   └── graphClient.ts    # Shared Microsoft Graph client singleton
├── agent/
│   ├── agent.ts          # Core agent logic: extract, match, create tasks
│   ├── prompts.ts        # Claude AI prompts for task extraction
│   └── tools/
│       ├── graph.ts      # Graph API: transcripts, meetings, users
│       ├── planner.ts    # Planner API: plans, tasks, assignments
│       └── teams.ts      # Teams API: chat messages, notifications
└── webhook/
    ├── handler.ts        # Webhook endpoint for transcript notifications
    └── subscription.ts   # Webhook subscription management
```

## Prerequisites

- Node.js 18+
- Microsoft 365 tenant with Teams
- Azure AD app registration
- Claude API key
- ngrok account (for webhook tunneling)
- Microsoft 365 tenant with Teams and Planner licenses
- Microsoft Entra ID (Azure AD) tenant admin access
- Claude API account
- ngrok account (free tier works)

## Required Registrations & API Keys

| Service | What You Need | Where to Get It |
|---------|--------------|-----------------|
| Microsoft Entra ID | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` | [Azure Portal](https://portal.azure.com) |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| ngrok | `NGROK_AUTHTOKEN` | [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) |
| Microsoft Graph | `MY_USER_ID` | Graph Explorer or `/me` endpoint |

## Setup

### 1. Microsoft Entra ID App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations
2. Create new registration
3. Add redirect URI: `http://localhost:3333/callback` (Web platform)
4. Under **API permissions**, add these delegated permissions:
> **Note:** You need tenant admin access to grant API permissions.

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations**
2. Click **New registration**
   - Name: `Teams Transcript Tasks Agent`
   - Supported account types: **Single tenant** (your org only)
   - Redirect URI: Select **Web** and enter `http://localhost:3333/callback`
3. After creation, note:
   - **Application (client) ID** → This is your `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `AZURE_TENANT_ID`
4. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
   - `OnlineMeetingTranscript.Read.All` - Read meeting transcripts
   - `User.Read.All` - Search user directory
   - `Tasks.ReadWrite` - Create Planner tasks
   - `Chat.ReadWrite` - Send Teams messages
5. Grant admin consent for your organization
6. Note your **Application (client) ID** and **Directory (tenant) ID**

### 2. Environment Configuration
   - `offline_access` - Refresh tokens
5. Click **Grant admin consent for [Your Organization]**

### 2. Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys**
4. Create a new API key
5. Copy the key → This is your `ANTHROPIC_API_KEY`

### 3. ngrok Auth Token

1. Go to [ngrok.com](https://ngrok.com) and create a free account
2. After login, go to [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Copy the token → This is your `NGROK_AUTHTOKEN`

### 4. Your Microsoft User ID

After completing the app registration, you need your Microsoft Graph user ID:

**Option A: Using Graph Explorer**
1. Go to [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
2. Sign in with your Microsoft account
3. Run: `GET https://graph.microsoft.com/v1.0/me`
4. Copy the `id` field → This is your `MY_USER_ID`

**Option B: Using curl (after first authentication)**
```bash
curl -H "Authorization: Bearer <your-token>" https://graph.microsoft.com/v1.0/me | jq .id
```

### 5. Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Azure AD App Registration
AZURE_CLIENT_ID=your-app-client-id
AZURE_TENANT_ID=your-tenant-id

# Claude API
ANTHROPIC_API_KEY=your-claude-api-key

# Server Configuration
PORT=3000
NGROK_AUTHTOKEN=your-ngrok-token
OAUTH_REDIRECT_URI=http://localhost:3333/callback

# User Configuration
OVERSIGHT_PERSON_EMAIL=manager@company.com
MY_USER_ID=your-microsoft-user-id
```

**Finding your Microsoft User ID:**
```bash
# After authentication, you can use Graph Explorer or:
curl -H "Authorization: Bearer <token>" https://graph.microsoft.com/v1.0/me
```

### 3. Task Rules Configuration

# Security
WEBHOOK_SECRET=your-random-webhook-secret
```

> **Tip:** Generate a secure `WEBHOOK_SECRET` with: `openssl rand -hex 32`

### 6. Task Rules Configuration

Edit `config.json` to customize task detection:

```json
{
  "oversightPerson": "manager@company.com",
  "confidenceThreshold": 0.8,
  "autoCreateHighConfidence": true,
  "rules": {
    "ignorePatterns": [
      "just thinking out loud",
      "maybe we should",
      "I wonder if"
    ],
    "alwaysInclude": [
      "action item",
      "todo",
      "task",
      "follow up",
      "will do",
      "by friday"
    ]
  }
}
```

| Option | Description |
|--------|-------------|
| `oversightPerson` | Email of person CC'd on all tasks |
| `confidenceThreshold` | Tasks above this score are auto-created (0.0-1.0) |
| `autoCreateHighConfidence` | Enable/disable automatic task creation |
| `rules.ignorePatterns` | Phrases that indicate non-actionable discussion |
| `rules.alwaysInclude` | Phrases that strongly indicate a real task |

### 7. Install & Run

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the agent
npm start
```

On first run, you'll be prompted to authenticate via browser.

### 5. Verify Setup

```bash
npm run test:setup
```

This verifies:
- Microsoft authentication works
- Graph API access is configured
- Planner connectivity is active

## Usage

Once running, the agent will:

1. **Listen** for new meeting transcripts via Graph webhooks
2. **Process** transcripts automatically when they become available
3. **Extract** tasks using Claude AI with confidence scoring
4. **Create** high-confidence tasks directly in the assignee's Planner
5. **Queue** uncertain tasks for review in your Teams chat

### Example Console Output

```
=== Teams Transcript Tasks Agent ===

✓ Configuration loaded
✓ Environment variables validated

Authenticating with Microsoft...
✓ Microsoft authentication successful

✓ Server listening on port 3000
✓ Ngrok tunnel: https://abc123.ngrok.io
✓ Webhook subscription active

=== Ready to process transcripts ===

[Webhook] New transcript notification received
[Agent] Processing transcript for "Weekly Team Standup"
[Agent] Found 3 potential tasks
[Agent] Task 1: "Send Q4 report to stakeholders" → Created (confidence: 0.95)
[Agent] Task 2: "Review PR #123" → Created (confidence: 0.88)
[Agent] Task 3: "Maybe look into caching" → Queued for review (confidence: 0.45)
```

## Development

```bash
# Watch mode (auto-reload on changes)
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Build for production
npm run build
```

## API Reference

### Task Extraction Response

Claude AI returns tasks in this format:

```json
[
  {
    "title": "Send Q4 report to stakeholders",
    "assigneeName": "John",
    "dueDate": "2026-01-20",
    "description": "Compile and send the Q4 financial report before the board meeting",
    "confidence": 0.95
  }
]
```

### Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 0.9-1.0 | Explicit assignment with clear owner | Auto-create |
| 0.7-0.8 | Clear task with implied owner | Auto-create (if above threshold) |
| 0.5-0.6 | Vague task or unclear owner | Review queue |
| < 0.5 | Speculation or discussion | Review queue |

## Troubleshooting

### Authentication Issues

```bash
# Clear cached tokens and re-authenticate
rm .tokens.json
npm start
```

### Webhook Not Receiving Events

1. Verify ngrok tunnel is running
2. Check webhook subscription status in Microsoft Graph Explorer
3. Ensure `OnlineMeetingTranscript.Read.All` permission is granted

### Tasks Not Created

1. Verify Planner plans exist for assignees
2. Check `Tasks.ReadWrite` permission is granted
3. Review confidence threshold in `config.json`

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES Modules)
- **AI**: Claude API via `@anthropic-ai/sdk`
- **Auth**: MSAL Node (`@azure/msal-node`)
- **APIs**: Microsoft Graph Client
- **Server**: Express.js
- **Tunneling**: ngrok
- **Testing**: Vitest

## License

MIT
