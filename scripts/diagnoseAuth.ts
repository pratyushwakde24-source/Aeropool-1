import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function main() {
  console.log('--- SUPABASE STAGING AUTH DIAGNOSTIC ---');
  console.log('Supabase URL:', SUPABASE_URL);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing');
    return;
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers();
  if (usersError) {
    console.error('Error listing users via admin API:', usersError);
    return;
  }

  console.log(`Total users in auth.users: ${usersData.users.length}`);
  usersData.users.forEach((u, i) => {
    const email = u.email || 'no-email';
    console.log(`[User ${i + 1}]`);
    console.log(`  ID: ${u.id}`);
    console.log(`  Email: ${email}`);
    console.log(`  Email Confirmed At: ${u.email_confirmed_at || 'NOT CONFIRMED (NULL)'}`);
    console.log(`  Created At: ${u.created_at}`);
    console.log(`  Last Sign In At: ${u.last_sign_in_at || 'NEVER'}`);
    console.log(`  Role / Metadata:`, JSON.stringify(u.user_metadata));
  });

  // Also check public.profiles
  const { data: profiles, error: profError } = await adminClient.from('profiles').select('*');
  if (profError) {
    console.log('Error reading profiles table:', profError.message);
  } else {
    console.log(`Total rows in public.profiles: ${profiles?.length || 0}`);
    profiles?.forEach((p) => {
      console.log(`  Profile ID: ${p.id}, Email: ${p.email}, Role: ${p.role}`);
    });
  }
}

main().catch((err) => console.error(err));

