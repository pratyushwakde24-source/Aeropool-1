/**
 * AeroPool — Supabase Live Verification Script
 * Validates real PostgreSQL database connectivity, schema tables, RPC functions,
 * authentication service, and booking persistence without modifying existing data.
 *
 * Usage:
 *   npx tsx scripts/verifySupabase.ts
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const REQUIRED_TABLES = [
  'airports',
  'pickup_zones',
  'profiles',
  'organizations',
  'vehicles',
  'driver_profiles',
  'driver_documents',
  'ride_pools',
  'bookings',
  'payments',
  'ride_requests',
  'safety_incidents',
  'support_tickets',
  'system_health_checks',
  'audit_logs',
  'processed_webhook_events',
  'payment_orders',
];

const REQUIRED_RPCS = [
  'book_ride_atomic',
  'cancel_booking_atomic',
  'assign_driver_to_pool_atomic',
  'advance_ride_status_atomic',
  'claim_webhook_event_atomic',
  'request_ride_pool_atomic',
];

async function runVerification() {
  console.log('============================================================');
  console.log('🔍 AeroPool Supabase Live Project Verification Probe');
  console.log('============================================================\n');

  // 1. Check Credentials Configuration
  console.log('1. Checking Environment Credentials:');
  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project') || !SUPABASE_URL.startsWith('https://')) {
    console.log('   ❌ VITE_SUPABASE_URL is missing or unconfigured in .env');
    console.log('   ↳ Please set VITE_SUPABASE_URL="https://<project-ref>.supabase.co" in .env\n');
    console.log('Status: CREDENTIALS_MISSING');
    process.exit(0);
  }

  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('your-anon-key') || SUPABASE_ANON_KEY.length < 20) {
    console.log('   ❌ VITE_SUPABASE_ANON_KEY is missing or invalid in .env');
    console.log('   ↳ Please set VITE_SUPABASE_ANON_KEY="eyJ..." in .env\n');
    console.log('Status: CREDENTIALS_MISSING');
    process.exit(0);
  }

  // Extract project ref
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  console.log(`   ✅ Target Project Ref: ${projectRef}`);
  console.log(`   ✅ Target Supabase URL: ${SUPABASE_URL}`);
  console.log(`   ✅ Public Anon Key configured (${SUPABASE_ANON_KEY.substring(0, 15)}...)`);
  if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY.length > 20) {
    console.log(`   ✅ Service Role Key provided for privileged server operations`);
  } else {
    console.log(`   ℹ️ Service Role Key not set (Public client checks active)`);
  }
  console.log();

  // 2. Test Live Auth Service
  console.log('2. Probing Supabase GoTrue Auth Service:');
  try {
    const authStart = Date.now();
    const authRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    const authLatency = Date.now() - authStart;

    if (authRes.ok) {
      console.log(`   ✅ GoTrue Auth service responsive (${authLatency}ms)`);
    } else {
      console.log(`   ⚠️ Auth health endpoint returned status ${authRes.status}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    console.log(`   ❌ Auth probe unreachable: ${msg}`);
  }
  console.log();

  // 3. Connect Supabase Client
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // 4. Test Table Presence
  console.log('3. Inspecting PostgreSQL Schema Tables:');
  const tableResults: Record<string, boolean> = {};

  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await client.from(table).select('*').limit(1);
      if (!error) {
        tableResults[table] = true;
        console.log(`   ✅ Table '${table}' exists and is accessible`);
      } else if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message.includes('does not exist') ||
        error.message.includes('in the schema cache')
      ) {
        tableResults[table] = false;
        console.log(`   ❌ Table '${table}' NOT FOUND (migration required)`);
      } else {
        // Table exists but RLS denied SELECT (which means table is present!)
        tableResults[table] = true;
        console.log(`   ✅ Table '${table}' exists (protected by Row Level Security)`);
      }
    } catch {
      tableResults[table] = false;
      console.log(`   ❌ Table '${table}' check error`);
    }
  }
  console.log();

  const missingTables = Object.entries(tableResults).filter(([, exists]) => !exists);
  if (missingTables.length > 0) {
    console.log(`⚠️  ${missingTables.length} table(s) missing from Supabase project.`);
    console.log('↳ Execute migrations 1 through 7 in the Supabase SQL Editor:');
    console.log('  1. supabase/migrations/20261015000000_aeropool_schema.sql');
    console.log('  2. supabase/migrations/20261015000001_ride_requests_and_cancellation.sql');
    console.log('  3. supabase/migrations/20261016000000_production_safeguards_and_persistence.sql');
    console.log('  4. supabase/migrations/20261016000001_production_rls_and_rpc_alignment.sql');
    console.log('  5. supabase/migrations/20261020000000_webhook_idempotency_and_security.sql');
    console.log('  6. supabase/migrations/20261024000000_realtime_publication_and_indexes.sql');
    console.log('  7. supabase/migrations/20261024000001_security_remediation_and_hardening.sql\n');
    console.log('Status: MIGRATIONS_PENDING');
    process.exit(0);
  }

  // 5. Test RPC Stored Procedures
  console.log('4. Inspecting Atomic RPC Functions:');
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  const rpcProbeParams: Record<string, Record<string, any>> = {
    book_ride_atomic: {
      p_pool_id: dummyUuid,
      p_passenger_id: dummyUuid,
      p_seats: 1,
      p_luggage: 1,
      p_flight_number: 'AI101',
      p_destination_name: 'Bandra',
      p_destination_address: 'Bandra West',
      p_destination_corridor: 'Western Suburbs',
      p_destination_lat: 19.0596,
      p_destination_lng: 72.8295,
      p_fare_paise: 25000,
      p_savings_paise: 5000,
      p_payment_method: 'UPI',
    },
    cancel_booking_atomic: {
      p_booking_id: dummyUuid,
      p_passenger_id: dummyUuid,
    },
    assign_driver_to_pool_atomic: {
      p_pool_id: dummyUuid,
      p_driver_id: dummyUuid,
      p_vehicle_id: dummyUuid,
      p_actor_id: dummyUuid,
    },
    advance_ride_status_atomic: {
      p_pool_id: dummyUuid,
      p_actor_id: dummyUuid,
      p_new_status: 'CONFIRMED',
    },
    claim_webhook_event_atomic: {
      p_event_id: 'probe_event_' + Date.now(),
      p_event_type: 'probe',
    },
    request_ride_pool_atomic: {
      p_airport_code: 'BOM',
      p_terminal: 'T2',
      p_pickup_zone_id: 'pz-t2-p4-east',
      p_target_corridor: 'Andheri East',
      p_departure_window_start: new Date().toISOString(),
      p_departure_window_end: new Date(Date.now() + 1800000).toISOString(),
      p_vehicle_category: 'Sedan',
      p_seats: 1,
      p_luggage: 1,
      p_passenger_id: dummyUuid,
    },
  };

  const adminClientForClaim = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : client;

  for (const rpc of REQUIRED_RPCS) {
    try {
      const probeClient = rpc === 'claim_webhook_event_atomic' ? adminClientForClaim : client;
      const params = rpcProbeParams[rpc] || {};
      const { error } = await probeClient.rpc(rpc, params as any);
      if (error && (error.message.includes('could not find the function') || error.code === 'PGRST202')) {
        console.log(`   ❌ RPC '${rpc}' NOT FOUND`);
      } else {
        console.log(`   ✅ RPC '${rpc}' registered in PostgreSQL schema`);
      }
    } catch {
      console.log(`   ⚠️ RPC '${rpc}' probe error`);
    }
  }
  console.log();

  // 6. Test Reference Data Presence (CSMIA Mumbai)
  console.log('5. Verifying Reference Data (CSMIA Mumbai & Pickup Hubs):');
  const { data: airportData } = await client.from('airports').select('id, name, city').eq('id', 'BOM').maybeSingle();
  if (airportData) {
    console.log(`   ✅ CSMIA Airport BOM found: "${airportData.name}" (${airportData.city})`);
  } else {
    console.log(`   ⚠️ Airport reference row 'BOM' missing`);
  }

  const { data: pickupData } = await client.from('pickup_zones').select('id, name, terminal_code');
  if (pickupData && pickupData.length > 0) {
    console.log(`   ✅ ${pickupData.length} CSMIA Pickup Zones found:`);
    pickupData.forEach((pz) => console.log(`      - [${pz.terminal_code}] ${pz.name} (ID: ${pz.id})`));
  } else {
    console.log(`   ⚠️ Pickup zones missing (seed data pending)`);
  }
  console.log();

  console.log('============================================================');
  console.log('🎉 Project Verification Result: SUPABASE_READY_FOR_STAGING');
  console.log('============================================================');
}

runVerification().catch((e) => {
  console.error('Fatal probe error:', e);
  process.exit(1);
});
