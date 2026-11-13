import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testRpc() {
  console.log('Testing RPC calls directly on staging:', SUPABASE_URL);

  // 1. Test claim_webhook_event_atomic with admin client (service_role)
  const res1 = await adminClient.rpc('claim_webhook_event_atomic', {
    p_event_id: 'test-probe-' + Date.now(),
    p_event_type: 'probe.test',
    p_payload_hash: 'probe-hash',
    p_payload: { probe: true }
  });
  console.log('1. claim_webhook_event_atomic (service_role):', JSON.stringify(res1));

  // 2. Test cancel_booking_atomic with anon client (should return Unauthorized or error object, proving RPC exists)
  const res2 = await anonClient.rpc('cancel_booking_atomic', {
    p_booking_id: '00000000-0000-0000-0000-000000000000',
    p_passenger_id: '00000000-0000-0000-0000-000000000000',
    p_reason: 'probe'
  });
  console.log('2. cancel_booking_atomic (anon):', JSON.stringify(res2));

  // 3. Test request_ride_pool_atomic
  const res3 = await anonClient.rpc('request_ride_pool_atomic', {
    p_airport_code: 'BOM',
    p_terminal: 'T2',
    p_pickup_zone_id: 'pz-t2-p4-east',
    p_target_corridor: 'Andheri East',
    p_departure_window_start: new Date().toISOString(),
    p_departure_window_end: new Date(Date.now() + 1800000).toISOString(),
    p_vehicle_category: 'Sedan',
    p_seats: 2,
    p_luggage: 1,
    p_passenger_id: '00000000-0000-0000-0000-000000000000'
  });
  console.log('3. request_ride_pool_atomic (anon):', JSON.stringify(res3));

  // 4. Test book_ride_atomic
  const res4 = await anonClient.rpc('book_ride_atomic', {
    p_pool_id: '00000000-0000-0000-0000-000000000000',
    p_passenger_id: '00000000-0000-0000-0000-000000000000',
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
    p_payment_id: null,
    p_razorpay_order_id: null,
    p_idempotency_key: null,
    p_operating_mode: 'sandbox',
    p_passenger_name: 'Test Passenger',
    p_passenger_phone: '+919999999999'
  });
  console.log('4. book_ride_atomic (anon):', JSON.stringify(res4));

  // 5. Test assign_driver_to_pool_atomic
  const res5 = await adminClient.rpc('assign_driver_to_pool_atomic', {
    p_pool_id: '00000000-0000-0000-0000-000000000000',
    p_driver_id: '00000000-0000-0000-0000-000000000000',
    p_vehicle_id: '00000000-0000-0000-0000-000000000000',
    p_actor_id: '00000000-0000-0000-0000-000000000000'
  });
  console.log('5. assign_driver_to_pool_atomic (admin):', JSON.stringify(res5));

  // 6. Test advance_ride_status_atomic
  const res6 = await adminClient.rpc('advance_ride_status_atomic', {
    p_pool_id: '00000000-0000-0000-0000-000000000000',
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_new_status: 'CONFIRMED'
  });
  console.log('6. advance_ride_status_atomic (admin):', JSON.stringify(res6));
}

testRpc().catch(console.error);
