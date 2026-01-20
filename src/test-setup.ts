// src/test-setup.ts
import { loadConfig } from './config/settings.js';
import { getAccessToken } from './auth/oauth.js';
import { getCurrentUser, searchDirectory } from './agent/tools/graph.js';
import { getUserPlans } from './agent/tools/planner.js';

async function testSetup() {
  console.log('=== Testing Setup ===\n');

  // Test config
  try {
    loadConfig();
    console.log('✓ Config loaded successfully');
  } catch (e) {
    console.error('✗ Config error:', e);
    return;
  }

  // Test auth
  console.log('\nTesting authentication...');
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token:', token.substring(0, 20) + '...');
  } catch (e) {
    console.error('✗ Auth error:', e);
    return;
  }

  // Test Graph API
  console.log('\nTesting Graph API...');
  try {
    const user = await getCurrentUser();
    console.log('✓ Current user:', user.displayName, `(${user.mail})`);
  } catch (e) {
    console.error('✗ Graph error:', e);
    return;
  }

  // Test directory search
  console.log('\nTesting directory search...');
  try {
    const results = await searchDirectory('a');
    console.log(`✓ Found ${results.length} users starting with 'a'`);
  } catch (e) {
    console.error('✗ Directory search error:', e);
  }

  // Test Planner
  console.log('\nTesting Planner API...');
  try {
    const user = await getCurrentUser();
    const plans = await getUserPlans(user.id);
    console.log(`✓ Found ${plans.length} Planner plans`);
    plans.forEach(p => console.log(`  - ${p.title}`));
  } catch (e) {
    console.error('✗ Planner error:', e);
  }

  console.log('\n=== Setup Test Complete ===');
}

testSetup().catch(console.error);
