// src/utils/graphClient.ts
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { getAccessToken } from '../auth/oauth.js';

let graphClient: Client | null = null;

export async function getGraphClient(): Promise<Client> {
  if (!graphClient) {
    graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const accessToken = await getAccessToken();
          done(null, accessToken);
        } catch (error) {
          done(error as Error, null);
        }
      }
    });
  }
  return graphClient;
}
