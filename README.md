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

### 1. Microsoft Entra ID App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations
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
