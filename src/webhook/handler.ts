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

    // Validate request body
    const notifications = req.body?.value;
    if (!Array.isArray(notifications)) {
      console.warn('Invalid webhook payload');
      res.status(400).send('Invalid request body');
      return;
    }

    // Respond immediately to Graph
    res.status(202).send();

    // Process notifications asynchronously (after response sent)
    setImmediate(async () => {
      for (const notification of notifications as GraphWebhookNotification[]) {
        // Verify client state
        if (notification.clientState !== WEBHOOK_SECRET) {
          console.warn('Invalid client state in notification');
          continue;
        }
        try {
          await handleTranscriptNotification(notification);
        } catch (error) {
          console.error('Error processing notification:', error);
        }
      }
    });
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
