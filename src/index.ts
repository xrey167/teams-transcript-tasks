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
