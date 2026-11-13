/**
 * AeroPool — Staging User Confirmation Helper
 * Safely marks an existing staging user's email as confirmed via Supabase Admin API
 * without modifying user passwords, deleting data, or affecting production.
 *
 * Usage:
 *   npx tsx scripts/confirmUser.ts <user-email>
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function confirmUserEmail() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  if (!targetEmail) {
    console.error('Usage: npx tsx scripts/confirmUser.ts <user-email>');
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  // Safety check: ensure target is strictly staging
  if (!SUPABASE_URL.includes('rkuzkwggijthbqwlwnps')) {
    console.error('Safety block: confirmUser script can only be run against staging project rkuzkwggijthbqwlwnps');
    process.exit(1);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError.message);
    process.exit(1);
  }

  const user = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail);
  if (!user) {
    console.error(`User with email "${targetEmail}" was not found in staging project rkuzkwggijthbqwlwnps.`);
    process.exit(1);
  }

  if (user.email_confirmed_at) {
    console.log(`User "${targetEmail}" is ALREADY confirmed (confirmed at: ${user.email_confirmed_at}).`);
    process.exit(0);
  }

  const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });

  if (updateError) {
    console.error('Failed to confirm email:', updateError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully confirmed email for staging user "${targetEmail}" (ID: ${user.id}).`);
  console.log(`Updated email_confirmed_at: ${updated.user.email_confirmed_at}`);
}

confirmUserEmail().catch(console.error);

