# Meeting Transcript to Planner Tasks Agent

## Overview

An agentic workflow that automatically processes Microsoft Teams meeting transcripts, extracts tasks/action items, and creates them in Microsoft Planner for the assigned people.

## Core Flow

1. Meeting ends in Teams → transcript generated
2. Microsoft Graph webhook notifies local service
3. Claude Agent analyzes transcript, extracts tasks
4. High-confidence tasks → auto-created in Planner
5. Uncertain tasks → sent via Teams chat for review/approval

## Architecture

```
┌─────────────────┐     Webhook      ┌──────────────────┐
│  Microsoft      │ ──────────────▶  │  Local Service   │
│  Graph API      │                  │  (Express/Node)  │
└─────────────────┘                  └────────┬─────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │  Claude Agent    │
                                     │  (Agent SDK)     │
                                     └────────┬─────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
               ┌─────────────┐      ┌─────────────────┐    ┌──────────────┐
               │ Transcript  │      │ Review Queue    │    │ Planner API  │
               │ Analyzer    │      │ (Teams Chat)    │    │ Task Creator │
               └─────────────┘      └─────────────────┘    └──────────────┘
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger | MS Graph Webhooks | Free, real-time, native integration |
| Hosting | Local Windows machine | Free, sufficient for working-hours use |
| AI | Claude API + Agent SDK | High quality extraction, agentic tool use |
| Auth | OAuth with MSAL | Secure, standard Microsoft auth |
| Language | TypeScript | Strong typing, good async support |
| Review UI | Teams Chat | Keeps everything in MS ecosystem |

## Task Extraction

### Confidence Classification

**High-Confidence (Auto-Create) - Score ≥ 0.8:**
- Explicit assignment with named person
- Clear action verb + optional deadline
- Person found in meeting participants

**Medium-Confidence (Review Queue) - Score 0.5-0.8:**
- Implied ownership
- Ambiguous assignee
- Person in directory but not in meeting

**Low-Confidence (Flagged) - Score < 0.5:**
- Vague action items
- No clear assignee

### Task Details Extracted

- Title (action item summary)
- Assignee (matched to M365 account)
- Due date (if mentioned, parsed from relative dates)
- Description/context from meeting

## Task Assignment

Each task is visible to:
1. **Task assignee** - Person responsible for the task
2. **Meeting organizer** - Automatic, knows meeting context
3. **Fixed oversight person** - Configurable, for management visibility

Tasks are created in the **assignee's personal Planner plan**.

## Person Matching Strategy

1. First: Match against meeting participants list
2. Fallback: Search Microsoft 365 directory by name
3. If uncertain: Add to review queue, ask user

## Agent Tools

### Graph API Tools
- `getTranscript` - Fetch meeting transcript content
- `getMeetingParticipants` - Get attendee list with emails
- `searchDirectory` - Look up users by name in M365 directory
- `sendTeamsMessage` - Send review queue messages

### Planner Tools
- `getUserPlans` - Find user's personal Planner plans
- `createTask` - Create task with details
- `addTaskAssignees` - Add oversight people

### Internal Tools
- `classifyTaskConfidence` - Determine confidence level
- `extractDueDate` - Parse relative dates to actual dates

## Authentication

### Azure AD App Registration
Required delegated permissions:
- `OnlineMeetingTranscript.Read.All`
- `User.Read.All`
- `Tasks.ReadWrite`
- `Chat.ReadWrite`

### Token Management
- Browser-based OAuth consent (one-time setup)
- Tokens stored locally, encrypted
- Auto-refresh with refresh token
- Re-auth prompt if refresh fails

### Webhook Delivery
- ngrok tunnel exposes localhost to internet
- Tunnel URL registered as webhook endpoint
- Graph validates subscription on creation

## Project Structure

```
teams-transcript-tasks/
├── src/
│   ├── index.ts              # Entry point, Express server
│   ├── agent/
│   │   ├── agent.ts          # Claude Agent SDK setup
│   │   ├── tools/
│   │   │   ├── graph.ts      # MS Graph API tools
│   │   │   ├── planner.ts    # Planner tools
│   │   │   └── teams.ts      # Teams messaging tools
│   │   └── prompts.ts        # System prompts
│   ├── webhook/
│   │   ├── handler.ts        # Webhook endpoint
│   │   └── subscription.ts   # Graph subscriptions
│   ├── auth/
│   │   ├── oauth.ts          # OAuth flow
│   │   └── tokens.ts         # Token storage
│   ├── config/
│   │   ├── rules.ts          # Extraction rules
│   │   └── settings.ts       # User settings
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── .env                      # Credentials
├── config.json               # User settings
├── package.json
└── tsconfig.json
```

### Dependencies
- `@anthropic-ai/sdk` - Claude Agent SDK
- `@microsoft/microsoft-graph-client` - Graph API
- `express` - Webhook server
- `msal-node` - Microsoft OAuth

## Operation

### Startup Sequence
1. Load config and tokens
2. Validate tokens, prompt re-auth if needed
3. Start Express server on localhost
4. Start ngrok tunnel
5. Create/renew Graph webhook subscription
6. Ready for transcripts

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Transcript fetch fails | Retry 3x, notify in Teams |
| Person not found | Add to review queue |
| Planner API fails | Queue locally, retry later |
| Token expired | Pause, re-auth, resume |
| Webhook expires | Auto-renew on startup |
| Claude API error | Retry with backoff |

### Graceful Shutdown
- `Ctrl+C` saves pending queue to file
- Restart loads and continues queued items

## Review Queue Format

```
📋 Meeting Task Review (Sales Sync - Jan 16)

Uncertain tasks found:

1. "Follow up with client on pricing"
   → Suggested assignee: Sarah (80% match)
   → Due: Not mentioned
   [✅ Approve] [✏️ Edit] [❌ Skip]

2. "Prepare demo environment"
   → Assignee unclear
   [Assign to: ___]
```

## Configuration

`config.json`:
```json
{
  "oversightPerson": "manager@company.com",
  "confidenceThreshold": 0.8,
  "autoCreateHighConfidence": true,
  "rules": {
    "ignorePatterns": ["just thinking out loud", "maybe we should"],
    "alwaysInclude": ["action item", "todo", "task"]
  }
}
```

## Next Steps

1. Register Azure AD application
2. Set up project with dependencies
3. Implement OAuth flow
4. Implement Graph API tools
5. Implement Claude Agent with extraction logic
6. Implement Planner integration
7. Add Teams chat review queue
8. Test end-to-end flow
