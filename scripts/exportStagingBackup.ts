import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(fs.readFileSync('.env', 'utf8'));

if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  'profiles',
  'airports',
  'pickup_zones',
  'ride_pools',
  'bookings',
  'payments',
  'audit_logs',
  'processed_webhook_events',
  'organizations',
  'vehicles',
  'driver_profiles',
  'driver_documents',
  'safety_incidents',
  'support_tickets',
  'ride_requests',
  'system_health_checks',
  'payment_orders',
];

async function main() {
  const backupDir = 'C:\\Users\\praty\\Aeropool_backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(backupDir, `aeropool_staging_full_backup_${timestamp}.json`);
  const sqlPath = path.join(backupDir, `aeropool_staging_restore_inserts_${timestamp}.sql`);

  console.log(`Starting staging backup for project rkuzkwggijthbqwlwnps...`);

  const backupData: Record<string, any[]> = {};
  let sqlContent = `-- ====================================================================\n`;
  sqlContent += `-- AeroPool Staging Database Manual Backup (SQL Restorable Format)\n`;
  sqlContent += `-- Project: rkuzkwggijthbqwlwnps (aeropool-staging)\n`;
  sqlContent += `-- Timestamp: ${new Date().toISOString()}\n`;
  sqlContent += `-- ====================================================================\n\n`;

  // 1. Export Auth Users
  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
    if (!authErr && authData && authData.users) {
      backupData['auth_users'] = authData.users;
      console.log(`Exported auth.users: ${authData.users.length} users`);
    } else {
      console.warn(`Could not export auth.users: ${authErr?.message}`);
    }
  } catch (err: any) {
    console.warn(`Auth users export exception: ${err.message}`);
  }

  // 2. Export All Tables
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.log(`Table ${table}: Skipped or Not Found (${error.message})`);
        continue;
      }
      backupData[table] = data || [];
      console.log(`Exported table ${table}: ${(data || []).length} rows`);

      if (data && data.length > 0) {
        sqlContent += `-- Table: public.${table} (${data.length} rows)\n`;
        for (const row of data) {
          const keys = Object.keys(row);
          const cols = keys.map((k) => `"${k}"`).join(', ');
          const vals = keys
            .map((k) => {
              const v = row[k];
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'number' || typeof v === 'boolean') return v;
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(', ');
          sqlContent += `INSERT INTO public.${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlContent += `\n`;
      }
    } catch (err: any) {
      console.error(`Error exporting table ${table}: ${err.message}`);
    }
  }

  // Write JSON
  fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2), 'utf8');
  // Write SQL
  fs.writeFileSync(sqlPath, sqlContent, 'utf8');

  // Compute Checksums
  const jsonHash = crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex');
  const sqlHash = crypto.createHash('sha256').update(fs.readFileSync(sqlPath)).digest('hex');

  const jsonStats = fs.statSync(jsonPath);
  const sqlStats = fs.statSync(sqlPath);

  console.log('\n============================================================');
  console.log('MANUAL BACKUP COMPLETED SUCCESSFULLY');
  console.log('============================================================');
  console.log(`JSON Backup File: ${jsonPath}`);
  console.log(`  Size: ${jsonStats.size} bytes`);
  console.log(`  SHA-256: ${jsonHash}`);
  console.log(`SQL Restore File: ${sqlPath}`);
  console.log(`  Size: ${sqlStats.size} bytes`);
  console.log(`  SHA-256: ${sqlHash}`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('Fatal backup exception:', err);
  process.exit(1);
});

