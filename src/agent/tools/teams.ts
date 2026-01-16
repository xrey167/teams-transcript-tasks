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

  let html = `<b>Meeting Task Review (${meetingSubject} - ${date})</b><br><br>`;
  html += `<b>Uncertain tasks found:</b><br><br>`;

  tasks.forEach((task, index) => {
    html += `<b>${index + 1}. "${task.title}"</b><br>`;

    if (task.suggestedAssignees.length > 0) {
      const top = task.suggestedAssignees[0];
      html += `-> Suggested assignee: ${top.user.displayName} (${Math.round(top.confidence * 100)}% match)<br>`;
    } else {
      html += `-> Assignee unclear<br>`;
    }

    if (task.dueDate) {
      html += `-> Due: ${task.dueDate}<br>`;
    } else {
      html += `-> Due: Not mentioned<br>`;
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
  const message = `Task created from "${meetingSubject}": "${taskTitle}" assigned to ${assigneeName}`;
  await sendNotification(recipientUserId, message);
}
