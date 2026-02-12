#!/usr/bin/env node
/**
 * Finault Master Account Setup
 * Creates an enterprise admin account in Supabase Auth
 *
 * Run: node setup-master-account.js
 */

const SUPABASE_URL = 'https://bejoptgsrhmklmllkobu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlam9wdGdzcmhta2xtbGxrb2J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMTIyMzUsImV4cCI6MjA4NDg4ODIzNX0.JGBeXweyIg2I4bMv6Dk_gd6veeodL5V_3TSYJeAK6kU';

const ACCOUNT = {
  email: 'bernard.cotter@finault.co',
  password: 'Finault2026!',
  data: {
    full_name: 'Bernard Cotter',
    company: 'Finault',
    tier: 'enterprise',
    role: 'admin'
  }
};

async function main() {
  console.log('=== Finault Master Account Setup ===\n');
  console.log('Creating enterprise account:', ACCOUNT.email);
  console.log('Tier: enterprise | Role: admin\n');

  // Step 1: Sign up
  console.log('[1/2] Signing up...');
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ACCOUNT)
  });

  const signupData = await signupRes.json();

  if (signupRes.status === 200 && signupData.id) {
    console.log('  ✓ Account created! User ID:', signupData.id);

    if (signupData.confirmation_sent_at) {
      console.log('  ⚠ Confirmation email sent to', ACCOUNT.email);
      console.log('    Check your inbox and click the confirmation link.');
      console.log('    OR disable email confirmation in Supabase Dashboard:');
      console.log('    Authentication → Providers → Email → Confirm email = OFF\n');
    }

    if (signupData.access_token) {
      console.log('  ✓ Auto-confirmed! Token received.');
    }
  } else if (signupRes.status === 422 || (signupData.msg && signupData.msg.includes('already'))) {
    console.log('  → Account already exists. Trying to sign in...\n');
  } else if (signupData.error || signupData.msg) {
    console.log('  Error:', signupData.error || signupData.msg);
    console.log('  Details:', JSON.stringify(signupData, null, 2));
  }

  // Step 2: Try signing in
  console.log('[2/2] Signing in...');
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: ACCOUNT.email,
      password: ACCOUNT.password
    })
  });

  const loginData = await loginRes.json();

  if (loginRes.status === 200 && loginData.access_token) {
    console.log('  ✓ Sign-in successful!');
    console.log('  User ID:', loginData.user?.id);
    console.log('  Email:', loginData.user?.email);
    console.log('  Metadata:', JSON.stringify(loginData.user?.user_metadata, null, 2));
    console.log('\n=== READY ===');
    console.log('Email:    ', ACCOUNT.email);
    console.log('Password: ', ACCOUNT.password);
    console.log('Tier:      enterprise');
    console.log('Role:      admin');
    console.log('\nSign in at: https://finault.ai/login.html');
  } else {
    console.log('  ✗ Sign-in failed:', loginData.error || loginData.msg || loginData.error_description);
    if (loginData.error_description?.includes('not confirmed')) {
      console.log('\n  → Email not confirmed yet.');
      console.log('    Check your inbox at', ACCOUNT.email);
      console.log('    Or disable email confirmation in Supabase Dashboard:');
      console.log('    Authentication → Providers → Email → Confirm email = OFF');
    }
  }
}

main().catch(e => console.error('Fatal error:', e.message));
