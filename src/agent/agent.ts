// src/agent/agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { getEnvVar, getConfig } from '../config/settings.js';
import { TASK_EXTRACTION_PROMPT } from './prompts.js';
import { getTranscript, getMeetingParticipants, searchDirectory } from './tools/graph.js';
import { createTask, getOrCreatePersonalPlan } from './tools/planner.js';
import { sendReviewMessage, sendTaskCreatedNotification } from './tools/teams.js';
import { isHighConfidence } from '../config/rules.js';
import type {
  ExtractedTask,
  ReviewTask,
  MeetingParticipant,
  GraphUser,
  Meeting
} from '../types/index.js';

// Type for raw task data from Claude before adding meeting context
interface RawExtractedTask {
  title: string;
  assigneeName: string;
  assigneeEmail?: string;
  dueDate?: string;
  description: string;
  confidence: number;
}

// Type guard to validate task objects from Claude response
function isValidTask(task: unknown): task is RawExtractedTask {
  if (typeof task !== 'object' || task === null) return false;
  const t = task as Record<string, unknown>;
  return (
    typeof t.title === 'string' &&
    typeof t.assigneeName === 'string' &&
    typeof t.confidence === 'number' &&
    typeof t.description === 'string'
  );
}

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
  const rawTasks = await extractTasks(transcript.content);

  if (rawTasks.length === 0) {
    console.log('No tasks found in transcript');
    return { created: 0, queued: 0 };
  }

  console.log(`Found ${rawTasks.length} potential tasks`);

  // Categorize tasks by confidence
  const highConfidence: ExtractedTask[] = [];
  const needsReview: ReviewTask[] = [];

  for (const rawTask of rawTasks) {
    // Try to match assignee
    const matchResult = await matchPerson(rawTask.assigneeName, participants);

    // Build the full ExtractedTask with meeting context
    const task: ExtractedTask = {
      ...rawTask,
      meetingContext: {
        meetingId,
        meetingSubject: meeting.subject,
        transcriptExcerpt: ''
      }
    };

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
        status: 'pending'
      });
    }
  }

  // Auto-create high confidence tasks
  let created = 0;
  for (const task of highConfidence) {
    try {
      await createTaskInPlanner(task, meeting);
      created++;

      // Notify oversight person - need to look up their user ID
      const oversightResults = await searchDirectory(config.oversightPerson);
      if (oversightResults.length > 0) {
        await sendTaskCreatedNotification(
          oversightResults[0].id,
          task.title,
          task.assigneeName,
          meeting.subject
        );
      }
    } catch (error) {
      console.error(`Failed to create task: ${task.title}`, error);
      // Move to review queue
      needsReview.push({
        ...task,
        id: crypto.randomUUID(),
        suggestedAssignees: [],
        status: 'pending'
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

async function extractTasks(transcriptContent: string): Promise<RawExtractedTask[]> {
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
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTask);
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
