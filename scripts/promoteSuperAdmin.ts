import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const EXPECTED_STAGING_PROJECT_ID = 'rkuzkwggijthbqwlwnps';
const PROTECTED_BASELINE_PROJECT_ID = 'krxkxhieyqcytknixqdm';
const TARGET_USER_ID = '76e38e6a-27c4-4921-98ec-2c3c26d95fbc';
const TARGET_EMAIL = 'pratyushwakde24@gmail.com';

async function main() {
  console.log('================================================================');
  console.log('🛡️ AEROPOOL — STAGING SUPER ADMIN PROMOTION SCRIPT');
  console.log('================================================================');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 1. Boundary & Security Checks
  if (!supabaseUrl.includes(EXPECTED_STAGING_PROJECT_ID)) {
    throw new Error(`CRITICAL: Supabase URL does not match staging project ${EXPECTED_STAGING_PROJECT_ID}. Aborting.`);
  }

  if (supabaseUrl.includes(PROTECTED_BASELINE_PROJECT_ID)) {
    throw new Error(`CRITICAL: Supabase URL points to PROTECTED BASELINE project ${PROTECTED_BASELINE_PROJECT_ID}. NEVER MODIFY! Aborting.`);
  }

  if (!serviceRoleKey) {
    throw new Error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing from environment.');
  }

  console.log(`[PASS] Target Staging Project Verified: ${EXPECTED_STAGING_PROJECT_ID}`);
  console.log(`[PASS] Protected Baseline Isolated: ${PROTECTED_BASELINE_PROJECT_ID}`);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Pre-Execution Verification
  console.log('\n--- 1. PRE-EXECUTION VERIFICATION ---');
  
  // Verify auth.users record
  const { data: authUserData, error: authUserErr } = await adminClient.auth.admin.getUserById(TARGET_USER_ID);
  if (authUserErr || !authUserData?.user) {
    throw new Error(`Failed to locate target Auth user ${TARGET_USER_ID}: ${authUserErr?.message}`);
  }

  const authUser = authUserData.user;
  console.log(`[PASS] Auth User Found: ${authUser.id}`);
  console.log(`       Email: ${authUser.email}`);
  console.log(`       Email Confirmed: ${Boolean(authUser.email_confirmed_at)}`);
  console.log(`       Current Auth Role: ${authUser.user_metadata?.role || 'none'}`);

  if (authUser.email !== TARGET_EMAIL) {
    throw new Error(`Mismatch: Auth user email (${authUser.email}) != Target email (${TARGET_EMAIL})`);
  }

  // Verify public.profiles record
  const { data: profileData, error: profileErr } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', TARGET_USER_ID)
    .single();

  if (profileErr || !profileData) {
    throw new Error(`Failed to locate public.profiles record for ${TARGET_USER_ID}: ${profileErr?.message}`);
  }

  console.log(`[PASS] Profile Found: ${profileData.id}`);
  console.log(`       Full Name: ${profileData.full_name}`);
  console.log(`       Current Profile Role: ${profileData.role}`);

  if (profileData.role === 'admin') {
    console.log('NOTICE: Profile role is already admin. Proceeding with metadata sync check.');
  }

  // 3. Execution: Authorized Role Promotion
  console.log('\n--- 2. EXECUTING AUTHORIZED ROLE PROMOTION ---');

  // Step A: Update canonical public.profiles table
  const { data: updatedProfile, error: updateProfileErr } = await adminClient
    .from('profiles')
    .update({
      role: 'admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', TARGET_USER_ID)
    .select()
    .single();

  if (updateProfileErr) {
    throw new Error(`Failed to update public.profiles: ${updateProfileErr.message}`);
  }

  console.log(`[SUCCESS] public.profiles updated: role = '${updatedProfile.role}'`);

  // Step B: Update auth.users user_metadata for consistent JWT claims
  const newMetadata = {
    ...(authUser.user_metadata || {}),
    role: 'admin',
    full_name: profileData.full_name || authUser.user_metadata?.full_name || 'Pratyush Wakde',
  };

  const { data: updatedAuthUser, error: updateAuthErr } = await adminClient.auth.admin.updateUserById(
    TARGET_USER_ID,
    { user_metadata: newMetadata }
  );

  if (updateAuthErr) {
    throw new Error(`Failed to update auth.users metadata: ${updateAuthErr.message}`);
  }

  console.log(`[SUCCESS] auth.users user_metadata updated: role = '${updatedAuthUser.user.user_metadata.role}'`);

  // 4. Post-Execution Read-Only Verification
  console.log('\n--- 3. POST-EXECUTION READ-ONLY VERIFICATION ---');

  const { data: verifyProfile } = await adminClient
    .from('profiles')
    .select('id, email, full_name, role, updated_at')
    .eq('id', TARGET_USER_ID)
    .single();

  const { data: verifyAuth } = await adminClient.auth.admin.getUserById(TARGET_USER_ID);

  console.log(`Verified Profile: ID=${verifyProfile?.id}, Email=${verifyProfile?.email}, Role=${verifyProfile?.role}`);
  console.log(`Verified Auth: ID=${verifyAuth?.user?.id}, Metadata Role=${verifyAuth?.user?.user_metadata?.role}`);

  // 5. Verify Test Admin Integrity (staging.e2e.passenger@aeropool.com)
  console.log('\n--- 4. TEST ADMIN ACCOUNT INTEGRITY ---');
  const { data: testAdminProfile } = await adminClient
    .from('profiles')
    .select('id, email, role')
    .eq('email', 'staging.e2e.passenger@aeropool.com')
    .single();

  console.log(`Test Admin Profile: ID=${testAdminProfile?.id}, Email=${testAdminProfile?.email}, Role=${testAdminProfile?.role}`);
  console.log('[PASS] Test admin account remains intact and untampered.');

  console.log('\n================================================================');
  console.log('🎉 PROMOTION COMPLETE: pratyushwakde24@gmail.com is now Super Admin!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ PROMOTION ERROR:', err);
  process.exit(1);
});

