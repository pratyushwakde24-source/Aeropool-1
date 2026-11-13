import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function checkDrivers() {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: drivers, error } = await adminClient.from('driver_profiles').select('*');
  console.log('Driver profiles error:', error);
  console.log('Driver profiles count:', drivers?.length || 0);
  drivers?.forEach(d => console.log('Driver:', d.id, d.full_name, d.verification_status, d.user_id));
}

checkDrivers().catch(console.error);

