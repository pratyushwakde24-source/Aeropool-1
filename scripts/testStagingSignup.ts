import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function testGoTrueState() {
  console.log('Testing GoTrue server-side settings on:', SUPABASE_URL);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Test 1: What error does signInWithPassword return for non-existent email?
  const resNonExistent = await anonClient.auth.signInWithPassword({
    email: 'definitely_does_not_exist_' + Date.now() + '@aeropool.test',
    password: 'SomePassword123!',
  });
  console.log('Test 1 (Non-existent email signIn):', {
    error_message: resNonExistent.error?.message,
    status: resNonExistent.error?.status,
    name: resNonExistent.error?.name,
  });

  // Test 2: What error does signInWithPassword return for existing UNCONFIRMED email (testpassenger_123@aeropool.com)?
  const resUnconfirmed = await anonClient.auth.signInWithPassword({
    email: 'testpassenger_123@aeropool.com',
    password: 'WrongPassword123!',
  });
  console.log('Test 2 (Unconfirmed email with wrong password signIn):', {
    error_message: resUnconfirmed.error?.message,
    status: resUnconfirmed.error?.status,
    name: resUnconfirmed.error?.name,
  });

  // Test 3: What error does signInWithPassword return for CONFIRMED email with wrong password (pratyushwakde24@gmail.com)?
  const resConfirmedWrongPw = await anonClient.auth.signInWithPassword({
    email: 'pratyushwakde24@gmail.com',
    password: 'WrongPassword123!',
  });
  console.log('Test 3 (Confirmed email with wrong password signIn):', {
    error_message: resConfirmedWrongPw.error?.message,
    status: resConfirmedWrongPw.error?.status,
    name: resConfirmedWrongPw.error?.name,
  });
}

testGoTrueState().catch((err) => console.error(err));

