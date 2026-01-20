// src/agent/tools/teams.ts
import { getGraphClient } from '../../utils/graphClient.js';
import type { ReviewTask } from '../../types/index.js';
import { getEnvVar } from '../../config/settings.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const myUserId = getEnvVar('MY_USER_ID');

  // Handle self-chat case (same user twice is invalid for oneOnOne)
  if (userId === myUserId) {
    // For self-chat, we need to find an existing chat or use a workaround
    // Microsoft Graph doesn't support creating oneOnOne with same user twice
    // Instead, list existing chats and find one we can use, or create a group chat
    const existingChats = await client
      .api('/me/chats')
      .filter("chatType eq 'oneOnOne'")
      .top(1)
      .get();

    if (existingChats.value && existingChats.value.length > 0) {
      // Use the first available chat (self-messages will appear here)
      return { id: existingChats.value[0].id };
    }

    // If no existing chats, create a group chat with just self
    // This serves as a "notes to self" chat
    const selfChat = await client
      .api('/chats')
      .post({
        chatType: 'group',
        topic: 'Task Review Notes',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${myUserId}`
          }
        ]
      });

    return { id: selfChat.id };
  }

  // Try to create a 1:1 chat (Graph returns existing chat if already exists)
  const chat = await client
    .api('/chats')
    .post({
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${myUserId}`
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

  let html = `<b>📋 Meeting Task Review (${escapeHtml(meetingSubject)} - ${date})</b><br><br>`;
  html += `<b>Uncertain tasks found:</b><br><br>`;

  tasks.forEach((task, index) => {
    html += `<b>${index + 1}. "${escapeHtml(task.title)}"</b><br>`;

    if (task.suggestedAssignees.length > 0) {
      const top = task.suggestedAssignees[0];
      html += `-> Suggested assignee: ${escapeHtml(top.user.displayName)} (${Math.round(top.confidence * 100)}% match)<br>`;
    } else {
      html += `-> Assignee unclear<br>`;
    }

    if (task.dueDate) {
      html += `-> Due: ${escapeHtml(task.dueDate)}<br>`;
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
  const message = `✅ Task created from "${escapeHtml(meetingSubject)}": "${escapeHtml(taskTitle)}" assigned to ${escapeHtml(assigneeName)}`;
  await sendNotification(recipientUserId, message);
}
