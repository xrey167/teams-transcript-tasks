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

  // Sanitize input: trim whitespace and escape single quotes for OData
  const sanitizedQuery = query.trim().replace(/'/g, "''");

  if (sanitizedQuery.length < 1) {
    return [];
  }

  const result = await client
    .api('/users')
    .filter(`startswith(displayName,'${sanitizedQuery}') or startswith(mail,'${sanitizedQuery}')`)
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
