// Automated verification test suite for pending appointment expiration
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Supabase credentials missing.');
  process.exit(1);
}

const client = createClient(url, key);

async function run() {
  console.log('=== VERIFYING PENDING APPOINTMENT EXPIRATION IN NODE/SUPABASE ===');

  const doctorId = '30b6de4e-174f-4381-831d-e3a6ae199596';
  const patientId = 'a1eae3e1-6ea8-416f-bcda-875b76f41948';

  const basePast = Date.now() - 4 * 3600000;
  const tomorrow = Date.now() + 86400000;

  const testCases = [
    {
      name: '1. Past Pending -> Must become Cancelled',
      status: 'pending',
      start_time: new Date(basePast).toISOString(),
      end_time: new Date(basePast + 1800000).toISOString(),
      expectedStatus: 'cancelled',
      expectedReason: 'Pending appointment expired',
    },
    {
      name: '2. Future Pending -> Must remain Pending',
      status: 'pending',
      start_time: new Date(tomorrow).toISOString(),
      end_time: new Date(tomorrow + 1800000).toISOString(),
      expectedStatus: 'pending',
      expectedReason: null,
    },
    {
      name: '3. Past Confirmed -> Must remain Confirmed',
      status: 'confirmed',
      start_time: new Date(basePast + 3600000).toISOString(),
      end_time: new Date(basePast + 5400000).toISOString(),
      expectedStatus: 'confirmed',
      expectedReason: null,
    },
    {
      name: '4. Past Completed -> Must remain Completed',
      status: 'completed',
      start_time: new Date(basePast + 7200000).toISOString(),
      end_time: new Date(basePast + 9000000).toISOString(),
      expectedStatus: 'completed',
      expectedReason: null,
    },
    {
      name: '5. Past No-Show -> Must remain No-Show',
      status: 'no_show',
      start_time: new Date(basePast + 10800000).toISOString(),
      end_time: new Date(basePast + 12600000).toISOString(),
      expectedStatus: 'no_show',
      expectedReason: null,
    },
    {
      name: '6. Past Cancelled -> Must remain Cancelled',
      status: 'cancelled',
      start_time: new Date(basePast + 14400000).toISOString(),
      end_time: new Date(basePast + 16200000).toISOString(),
      cancellation_reason: 'Prior patient cancellation',
      expectedStatus: 'cancelled',
      expectedReason: 'Prior patient cancellation',
    },
  ];

  const createdIds = [];
  try {
    for (const tc of testCases) {
      const { data, error } = await client.from('appointments').insert({
        doctor_id: doctorId,
        patient_id: patientId,
        start_time: tc.start_time,
        end_time: tc.end_time,
        status: tc.status,
        cancellation_reason: tc.cancellation_reason || null,
      }).select().single();

      if (error) throw error;
      tc.id = data.id;
      createdIds.push(data.id);
    }

    // Call maintenance endpoint
    const res = await fetch('http://localhost:3000/api/v1/appointments/expire-pending', {
      method: 'POST',
    });
    const result = await res.json();
    console.log('Maintenance endpoint result:', result);

    // Verify all 6 records in Supabase
    const { data: records, error: fetchErr } = await client
      .from('appointments')
      .select('*')
      .in('id', createdIds);

    if (fetchErr) throw fetchErr;

    const map = Object.fromEntries(records.map((r) => [r.id, r]));

    let allPassed = true;
    for (const tc of testCases) {
      const actual = map[tc.id];
      const statusOk = actual.status === tc.expectedStatus;
      const reasonOk = tc.expectedReason === null
        ? !actual.cancellation_reason
        : actual.cancellation_reason === tc.expectedReason;

      const ok = statusOk && reasonOk;
      if (!ok) allPassed = false;
      console.log(`${ok ? '✓' : '✗'} ${tc.name}`);
      console.log(`    Status: ${actual.status} (expected ${tc.expectedStatus})`);
      console.log(`    Reason: ${actual.cancellation_reason} (expected ${tc.expectedReason})`);
    }

    if (!allPassed) {
      console.error('Test suite detected an invariant violation!');
      process.exit(1);
    } else {
      console.log('\nAll 6 appointment invariants verified successfully in Supabase.');
    }
  } finally {
    if (createdIds.length > 0) {
      await client.from('appointments').delete().in('id', createdIds);
    }
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
