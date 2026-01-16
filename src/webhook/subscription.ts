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
