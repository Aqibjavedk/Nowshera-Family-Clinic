import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAdmin = (supabaseUrl && serviceRoleKey)
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Standard Clinic specialties matching PostgreSQL schema UUIDs
const CLINIC_SPECIALTIES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Family Medicine', description: 'Comprehensive primary healthcare for individuals and family members of all ages.' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Pediatrics', description: 'Specialized medical care and wellness monitoring for infants, children, and adolescents.' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'General Internal Medicine', description: 'Prevention, diagnosis, and treatment of adult acute and chronic diseases.' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Cardiology', description: 'Expert cardiovascular care, hypertension management, and heart health screenings.' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Dermatology', description: 'Diagnosis and clinical care for skin, hair, and dermatological conditions.' },
];

function normalizeSpecialtyId(id?: string): string {
  if (!id) return CLINIC_SPECIALTIES[0].id;
  const legacyMap: Record<string, string> = {
    'spec-001': '11111111-1111-1111-1111-111111111111',
    'spec-002': '22222222-2222-2222-2222-222222222222',
    'spec-003': '33333333-3333-3333-3333-333333333333',
    'spec-004': '44444444-4444-4444-4444-444444444444',
    'spec-005': '55555555-5555-5555-5555-555555555555',
  };
  return legacyMap[id] || id;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // ---------------------------------------------------------------------------
  // API Routes (mounted BEFORE Vite middleware)
  // ---------------------------------------------------------------------------

  // Health check
  app.get('/api/v1/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      supabase_configured: !!supabaseAdmin,
    });
  });

  // Specialties
  app.get('/api/v1/specialties', async (req, res) => {
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin.from('specialties').select('*').order('name');
        if (!error && data && data.length > 0) {
          return res.json(data);
        }
      } catch (err) {
        console.warn('[API] Could not fetch specialties from DB, using fallback list:', err);
      }
    }
    return res.json(CLINIC_SPECIALTIES);
  });

  // Helper to fetch authoritative doctors merged from Supabase DB & Auth
  async function getAuthoritativeDoctors() {
    const specMap = new Map(CLINIC_SPECIALTIES.map(s => [s.id, s]));
    const defaultWorkingHours = [
      { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 5, start_time: '09:00:00', end_time: '14:00:00', is_available: true },
      { day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
      { day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
    ];

    const doctorsMap = new Map<string, any>();

    if (supabaseAdmin) {
      // Query working hours from database
      const workingHoursMap = new Map<string, any[]>();
      try {
        const { data: dbWH, error: whErr } = await supabaseAdmin
          .from('doctor_working_hours')
          .select('doctor_id, day_of_week, start_time, end_time, is_available')
          .order('day_of_week');
        if (!whErr && dbWH) {
          for (const item of dbWH) {
            const list = workingHoursMap.get(item.doctor_id) || [];
            list.push(item);
            workingHoursMap.set(item.doctor_id, list);
          }
        }
      } catch (whEx) {
        console.warn('[API] DB working hours query notice:', whEx);
      }

      // 1. First, attempt to load from database tables (public.doctors + public.profiles + public.specialties)
      try {
        const { data: dbDocs, error: dbErr } = await supabaseAdmin
          .from('doctors')
          .select(`
            id,
            qualification,
            bio,
            is_active,
            specialty_id,
            specialties (
              id,
              name,
              description
            ),
            profiles!inner (
              id,
              full_name,
              email,
              phone,
              role
            )
          `);

        if (!dbErr && dbDocs && Array.isArray(dbDocs)) {
          for (const d of dbDocs) {
            const prof = (d as any).profiles || {};
            const spec = (d as any).specialties || specMap.get(d.specialty_id) || CLINIC_SPECIALTIES[0];
            const rawWH = workingHoursMap.get(d.id);
            const doctorWH = rawWH && rawWH.length > 0 ? rawWH : defaultWorkingHours;

            doctorsMap.set(d.id, {
              id: d.id,
              full_name: prof.full_name || 'Dr. Medical Staff',
              email: prof.email || '',
              phone: prof.phone || '',
              qualification: d.qualification || 'MBBS, Consultant',
              bio: d.bio || 'Consultant Physician at Nowshera Family Clinic',
              is_active: d.is_active !== false,
              specialty: {
                id: spec.id || d.specialty_id,
                name: spec.name || 'General Medicine',
                description: spec.description || '',
              },
              working_hours: doctorWH,
            });
          }
        }
      } catch (dbEx) {
        console.warn('[API] DB doctors query notice:', dbEx);
      }

      // 2. Query Auth admin to ensure all doctor accounts (including newly onboarded) are covered
      try {
        const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        if (!listErr && usersData?.users) {
          const doctorUsers = usersData.users.filter((u: any) => {
            const role = u.user_metadata?.role || u.app_metadata?.role;
            return role === 'doctor';
          });

          for (const u of doctorUsers) {
            const meta = u.user_metadata || {};
            const specId = normalizeSpecialtyId(meta.specialty_id);
            const spec = specMap.get(specId) || CLINIC_SPECIALTIES[0];
            const rawWH = workingHoursMap.get(u.id);
            const doctorWH = rawWH && rawWH.length > 0 ? rawWH : defaultWorkingHours;

            if (!doctorsMap.has(u.id)) {
              doctorsMap.set(u.id, {
                id: u.id,
                full_name: meta.full_name || 'Dr. Medical Staff',
                email: u.email || '',
                phone: meta.phone || '',
                qualification: meta.qualification || 'MBBS, Consultant',
                bio: meta.bio || 'Consultant Physician at Nowshera Family Clinic',
                is_active: meta.is_active !== false,
                specialty: spec,
                working_hours: doctorWH,
              });
            } else {
              // Merge metadata if DB lacked any details
              const existing = doctorsMap.get(u.id);
              if (meta.full_name && !existing.full_name) existing.full_name = meta.full_name;
              if (meta.qualification && !existing.qualification) existing.qualification = meta.qualification;
            }
          }
        }
      } catch (err) {
        console.warn('[API] Doctor auth fetch notice:', err);
      }
    }

    return Array.from(doctorsMap.values());
  }

  // Public Doctors list
  app.get('/api/v1/doctors', async (req, res) => {
    try {
      const allDocs = await getAuthoritativeDoctors();
      const activeDocs = allDocs.filter((d: any) => d.is_active);
      return res.json(activeDocs);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Admin: List all doctors
  app.get('/api/v1/admin/doctors', async (req, res) => {
    try {
      let docs = await getAuthoritativeDoctors();
      const { search, specialty_id, status } = req.query;

      if (specialty_id && typeof specialty_id === 'string') {
        docs = docs.filter((d: any) => d.specialty.id === specialty_id);
      }
      if (status === 'active') {
        docs = docs.filter((d: any) => d.is_active);
      } else if (status === 'inactive') {
        docs = docs.filter((d: any) => !d.is_active);
      }
      if (search && typeof search === 'string') {
        const term = search.toLowerCase();
        docs = docs.filter((d: any) =>
          d.full_name.toLowerCase().includes(term) || d.email.toLowerCase().includes(term)
        );
      }

      return res.json(docs);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Doctor by ID
  app.get('/api/v1/doctors/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const allDocs = await getAuthoritativeDoctors();
    const found = allDocs.find((d: any) => d.id === doctorId);
    if (!found) return res.status(404).json({ detail: 'Doctor not found' });
    return res.json(found);
  });

  async function getUserIdFromRequest(req: express.Request): Promise<string | null> {
    if (req.headers.authorization && supabaseAdmin) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '').trim();
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        return user?.id || null;
      } catch {}
    }
    return null;
  }

  // Doctor Working Hours
  app.get(['/api/v1/doctors/:doctorId/working-hours', '/api/v1/doctors/me/working-hours'], async (req, res) => {
    let doctorId = req.params.doctorId;
    if (!doctorId || doctorId === 'me') {
      const authId = await getUserIdFromRequest(req);
      doctorId = authId || '30b6de4e-174f-4381-831d-e3a6ae199596';
    }

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('doctor_working_hours')
          .select('day_of_week, start_time, end_time, is_available')
          .eq('doctor_id', doctorId)
          .order('day_of_week');
        if (!error && data && data.length > 0) {
          return res.json(data);
        }
      } catch {}
    }
    const allDocs = await getAuthoritativeDoctors();
    const doc = allDocs.find((d: any) => d.id === doctorId);
    return res.json(doc?.working_hours || []);
  });

  app.put(['/api/v1/doctors/:doctorId/working-hours', '/api/v1/doctors/me/working-hours'], async (req, res) => {
    let doctorId = req.params.doctorId;
    if (!doctorId || doctorId === 'me') {
      const authId = await getUserIdFromRequest(req);
      doctorId = authId || '30b6de4e-174f-4381-831d-e3a6ae199596';
    }
    const { working_hours } = req.body;
    if (!working_hours || !Array.isArray(working_hours)) {
      return res.status(400).json({ detail: 'working_hours array is required' });
    }

    if (supabaseAdmin) {
      try {
        const payload = working_hours.map((wh: any) => ({
          doctor_id: doctorId,
          day_of_week: wh.day_of_week,
          start_time: wh.start_time.length === 5 ? `${wh.start_time}:00` : wh.start_time,
          end_time: wh.end_time.length === 5 ? `${wh.end_time}:00` : wh.end_time,
          is_available: wh.is_available,
        }));
        const { error } = await supabaseAdmin
          .from('doctor_working_hours')
          .upsert(payload, { onConflict: 'doctor_id,day_of_week' });
        if (error) {
          return res.status(500).json({ detail: error.message });
        }
      } catch (err: any) {
        return res.status(500).json({ detail: err.message });
      }
    }
    return res.json(working_hours);
  });

  // Appointments Store & Authoritative Database Queries
  const activeAppointments: Array<any> = [];

  // Helper to expire unconfirmed pending appointments whose scheduled start_time has passed in UTC
  // Enforces: status='pending' and start_time <= current UTC time -> status='cancelled', cancellation_reason='Pending appointment expired'
  async function expirePendingAppointments(): Promise<number> {
    const nowIso = new Date().toISOString(); // Strict UTC ISO 8601 string
    let expiredCount = 0;

    if (supabaseAdmin) {
      try {
        const { data: expired, error } = await supabaseAdmin
          .from('appointments')
          .update({
            status: 'cancelled',
            cancellation_reason: 'Pending appointment expired',
            updated_at: nowIso,
          })
          .eq('status', 'pending')
          .lte('start_time', nowIso)
          .select('id, doctor_id, start_time');

        if (error) {
          console.error('[EXPIRATION] Error expiring pending appointments in Supabase:', error);
        } else if (expired && Array.isArray(expired)) {
          expiredCount = expired.length;
          if (expiredCount > 0) {
            console.log(`[EXPIRATION] Successfully expired ${expiredCount} unconfirmed pending appointment(s) in Supabase.`);
          }
        }
      } catch (err: any) {
        console.error('[EXPIRATION] Unexpected failure during appointment expiration run:', err?.message || err);
      }
    }

    // Also synchronize any matching in-memory activeAppointments
    const nowMs = new Date(nowIso).getTime();
    for (const a of activeAppointments) {
      if (a.status === 'pending' && a.start_time && new Date(a.start_time).getTime() <= nowMs) {
        a.status = 'cancelled';
        a.cancellation_reason = 'Pending appointment expired';
        a.updated_at = nowIso;
        if (!supabaseAdmin) {
          expiredCount++;
        }
      }
    }

    return expiredCount;
  }

  // Helper to fetch authoritative appointments directly from Supabase public.appointments
  async function getAuthoritativeAppointments(): Promise<any[]> {
    await expirePendingAppointments();
    if (supabaseAdmin) {
      try {
        const { data: dbAppts, error } = await supabaseAdmin
          .from('appointments')
          .select('*, patient:patient_id(id, full_name, email, phone)')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(dbAppts)) {
          return dbAppts;
        }
      } catch (e) {
        // Suppress noisy logs on transient network retries
      }
    }
    return activeAppointments;
  }

  // Helper to enrich appointment object with doctor, patient, and specialty details
  async function enrichAppointment(appt: any, allDocs?: any[]) {
    const docs = allDocs || await getAuthoritativeDoctors();
    const doc = docs.find((d: any) => d.id === appt.doctor_id) || docs[0] || {
      id: appt.doctor_id,
      full_name: 'Dr. Medical Staff',
      qualification: 'MBBS, Consultant',
      specialty: { name: 'General Medicine' },
    };

    const patient = appt.patient || {
      id: appt.patient_id || 'demo-patient-001',
      full_name: appt.patient_name || 'Patient',
      email: appt.patient_email || 'patient@nowsheraclinic.pk',
      phone: appt.patient_phone || '+92 300 1234567',
    };

    return {
      id: appt.id,
      doctor_id: appt.doctor_id,
      patient_id: appt.patient_id,
      start_time: appt.start_time,
      end_time: appt.end_time,
      status: appt.status || 'pending',
      cancellation_reason: appt.cancellation_reason || null,
      cancelled_by: appt.cancelled_by || null,
      cancellation_email_sent_at: appt.cancellation_email_sent_at || null,
      created_at: appt.created_at || new Date().toISOString(),
      doctor: {
        id: doc.id,
        full_name: doc.full_name,
        qualification: doc.qualification,
        specialty: doc.specialty?.name || 'General Medicine',
      },
      patient: {
        id: patient.id,
        full_name: patient.full_name || 'Patient',
        email: patient.email || 'patient@nowsheraclinic.pk',
        phone: patient.phone || '+92 300 1234567',
      },
      specialty: doc.specialty?.name || 'General Medicine',
    };
  }

  // Clinic operating timezone is Asia/Karachi (UTC+5)
  const CLINIC_TIMEZONE = 'Asia/Karachi';

  function formatClinicDate(isoString: string): string {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: CLINIC_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
    } catch {
      return isoString;
    }
  }

  function formatClinicTime(isoString: string): string {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: CLINIC_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return isoString;
    }
  }

  // Available Slots calculation (0=Sunday, 1=Monday, ..., 6=Saturday)
  app.get('/api/v1/slots/available', async (req, res) => {
    const { doctor_id, date } = req.query;
    if (!doctor_id || !date || typeof doctor_id !== 'string' || typeof date !== 'string') {
      return res.status(400).json({ detail: 'doctor_id and date are required query parameters' });
    }

    // Free any expired pending slots before computing availability
    await expirePendingAppointments();

    const allDocs = await getAuthoritativeDoctors();
    const doc = allDocs.find((d: any) => d.id === doctor_id);
    if (!doc || !doc.is_active) {
      return res.json([]);
    }

    // Check doctor leaves on this date
    if (supabaseAdmin) {
      try {
        const { data: leaves } = await supabaseAdmin
          .from('doctor_leaves')
          .select('leave_date')
          .eq('doctor_id', doctor_id)
          .eq('leave_date', date);
        if (leaves && leaves.length > 0) {
          return res.json([]);
        }
      } catch {}
    }

    // Parse date components safely into UTC to get standard PostgreSQL DOW (0=Sun, 1=Mon, ..., 6=Sat)
    const [year, month, day] = date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = targetDate.getUTCDay();

    const wh = (doc.working_hours || []).find((w: any) => w.day_of_week === dayOfWeek && w.is_available);
    if (!wh) {
      return res.json([]);
    }

    // Fetch existing active bookings for this doctor to filter out booked slots
    const bookedTimestamps = new Set<number>();

    // Check Supabase table
    if (supabaseAdmin) {
      try {
        const { data: appts } = await supabaseAdmin
          .from('appointments')
          .select('start_time, status')
          .eq('doctor_id', doctor_id)
          .neq('status', 'cancelled');
        if (appts) {
          for (const a of appts) {
            if (a.start_time) {
              bookedTimestamps.add(new Date(a.start_time).getTime());
            }
          }
        }
      } catch {}
    }

    // Check in-memory store
    for (const a of activeAppointments) {
      if (a.doctor_id === doctor_id && a.status !== 'cancelled' && a.start_time) {
        bookedTimestamps.add(new Date(a.start_time).getTime());
      }
    }

    const [startHour, startMin] = wh.start_time.split(':').map(Number);
    const [endHour, endMin] = wh.end_time.split(':').map(Number);

    const now = new Date();
    const slots = [];

    let curH = startHour;
    let curM = startMin;

    while (curH < endHour || (curH === endHour && curM + 30 <= endMin)) {
      const nextH = curM + 30 >= 60 ? curH + 1 : curH;
      const nextM = (curM + 30) % 60;

      const pad = (n: number) => String(n).padStart(2, '0');
      const startIso = `${date}T${pad(curH)}:${pad(curM)}:00+05:00`;
      const endIso = `${date}T${pad(nextH)}:${pad(nextM)}:00+05:00`;

      const slotStartDt = new Date(startIso);

      if (slotStartDt > now && !bookedTimestamps.has(slotStartDt.getTime())) {
        slots.push({
          start_time: startIso,
          end_time: endIso,
          available: true,
        });
      }

      curH = nextH;
      curM = nextM;
    }

    return res.json(slots);
  });

  // Appointments: Create Appointment (POST /api/v1/appointments)
  app.post('/api/v1/appointments', async (req, res) => {
    const { doctor_id, start_time, patient_id } = req.body;
    if (!doctor_id || !start_time) {
      return res.status(400).json({ detail: 'doctor_id and start_time are required' });
    }

    const startDt = new Date(start_time);
    if (isNaN(startDt.getTime())) {
      return res.status(400).json({ detail: 'start_time must be a valid timestamp' });
    }

    const now = new Date();
    if (startDt <= now) {
      return res.status(400).json({ detail: 'Cannot book an appointment in the past' });
    }

    // 1. Verify doctor exists and is active
    const allDocs = await getAuthoritativeDoctors();
    const doc = allDocs.find((d: any) => d.id === doctor_id);
    if (!doc || !doc.is_active) {
      return res.status(400).json({ detail: 'Cannot book an appointment with an inactive or non-existent doctor' });
    }

    // 2. Resolve patient_id: Prefer authenticated user UUID from Auth Bearer token
    let pId = patient_id;
    let patientName = req.body.patient_name || req.body.patient?.full_name;
    let patientEmail = req.body.patient_email || req.body.patient?.email;
    let patientPhone = req.body.patient_phone || req.body.patient?.phone;

    if (req.headers.authorization && supabaseAdmin) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '').trim();
        const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          pId = user.id;
          patientEmail = user.email || patientEmail;
          patientName = user.user_metadata?.full_name || patientName;
          patientPhone = user.user_metadata?.phone || patientPhone;
        }
      } catch (authErr) {
        console.warn('[API] Auth token resolution notice:', authErr);
      }
    }

    if (!pId) {
      return res.status(401).json({ detail: 'Authentication required: patient UUID must be provided' });
    }

    // Validate that patient_id is a valid UUID format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId);
    if (!isUUID) {
      return res.status(400).json({ detail: 'patient_id must be a valid UUID' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ detail: 'Database service is not configured (missing Supabase credentials)' });
    }

    // 3. Ensure patient profile exists in public.profiles to satisfy FK constraint
    try {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', pId)
        .maybeSingle();

      if (!existingProfile) {
        await supabaseAdmin.from('profiles').insert({
          id: pId,
          email: patientEmail || `patient-${pId.substring(0, 8)}@nowsheraclinic.pk`,
          full_name: patientName || 'Patient',
          phone: patientPhone || null,
          role: 'patient',
        });
      }
    } catch (profErr) {
      console.warn('[API] Profile verification notice:', profErr);
    }

    const endDt = new Date(startDt.getTime() + 30 * 60 * 1000);
    const startIso = startDt.toISOString();
    const endIso = endDt.toISOString();

    // 4. Check for Doctor slot conflict (409 Conflict)
    const { data: docConflicts, error: docConfErr } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctor_id)
      .eq('start_time', startIso)
      .neq('status', 'cancelled');

    if (docConflicts && docConflicts.length > 0) {
      return res.status(409).json({
        detail: 'Appointment slot is already booked. Please select another available time.',
        code: 'SLOT_CONFLICT',
      });
    }

    // 5. Check for Patient slot conflict (409 Conflict)
    const { data: patConflicts, error: patConfErr } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('patient_id', pId)
      .eq('start_time', startIso)
      .neq('status', 'cancelled');

    if (patConflicts && patConflicts.length > 0) {
      return res.status(409).json({
        detail: 'You already have an active appointment booked at this exact time.',
        code: 'PATIENT_CONFLICT',
      });
    }

    // 6. Direct INSERT into public.appointments
    const { data: inserted, error: insError } = await supabaseAdmin
      .from('appointments')
      .insert({
        doctor_id,
        patient_id: pId,
        start_time: startIso,
        end_time: endIso,
        status: 'pending',
      })
      .select('*')
      .single();

    // 7. Strictly check and handle INSERT results
    if (insError) {
      console.error('[API] Supabase appointment insert error:', insError);
      if (
        insError.code === '23505' ||
        insError.message?.toLowerCase().includes('conflict') ||
        insError.message?.toLowerCase().includes('duplicate') ||
        insError.message?.toLowerCase().includes('unique')
      ) {
        return res.status(409).json({
          detail: 'Appointment slot is already booked. Please select another available time.',
          code: 'SLOT_CONFLICT',
        });
      }

      // DO NOT swallow error. Return exact database error to frontend.
      return res.status(500).json({
        detail: `Database insert failed: ${insError.message}${insError.hint ? ` (${insError.hint})` : ''}`,
        code: insError.code || 'DB_ERROR',
        error: insError,
      });
    }

    if (!inserted) {
      return res.status(500).json({
        detail: 'Failed to insert appointment into Supabase database: No record returned.',
        code: 'DB_NO_RECORD',
      });
    }

    // 8. Return the newly created database appointment record
    const enriched = await enrichAppointment(inserted, allDocs);
    return res.status(201).json(enriched);
  });

  // Patient: My Appointments (GET /api/v1/appointments/my)
  app.get('/api/v1/appointments/my', async (req, res) => {
    try {
      let patientId = (req.query.patient_id as string) || '';
      if (req.headers.authorization && supabaseAdmin) {
        try {
          const token = req.headers.authorization.replace('Bearer ', '');
          const { data: { user } } = await supabaseAdmin.auth.getUser(token);
          if (user) patientId = user.id;
        } catch {}
      }

      const allDocs = await getAuthoritativeDoctors();
      let list = await getAuthoritativeAppointments();

      if (patientId) {
        list = list.filter((a) => a.patient_id === patientId);
      }

      const enriched = await Promise.all(list.map((a) => enrichAppointment(a, allDocs)));
      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Doctor: Doctor Appointments (GET /api/v1/appointments/doctor)
  app.get('/api/v1/appointments/doctor', async (req, res) => {
    try {
      let doctorId = (req.query.doctor_id as string) || '';
      if (!doctorId && req.headers.authorization && supabaseAdmin) {
        try {
          const token = req.headers.authorization.replace('Bearer ', '');
          const { data: { user } } = await supabaseAdmin.auth.getUser(token);
          if (user) doctorId = user.id;
        } catch {}
      }

      const { date, status } = req.query;
      const allDocs = await getAuthoritativeDoctors();
      let list = await getAuthoritativeAppointments();

      if (doctorId) {
        list = list.filter((a) => a.doctor_id === doctorId);
      }
      if (date && typeof date === 'string') {
        list = list.filter((a) => a.start_time.startsWith(date));
      }
      if (status && typeof status === 'string' && status !== 'all') {
        list = list.filter((a) => a.status === status);
      }

      const enriched = await Promise.all(list.map((a) => enrichAppointment(a, allDocs)));
      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Admin & Generic: All Appointments (GET /api/v1/appointments & GET /api/v1/admin/appointments)
  app.get(['/api/v1/appointments', '/api/v1/admin/appointments'], async (req, res) => {
    try {
      const { doctor_id, date, status, search } = req.query;
      const allDocs = await getAuthoritativeDoctors();
      let list = await getAuthoritativeAppointments();

      if (doctor_id && typeof doctor_id === 'string') {
        list = list.filter((a) => a.doctor_id === doctor_id);
      }
      if (date && typeof date === 'string') {
        list = list.filter((a) => a.start_time.startsWith(date));
      }
      if (status && typeof status === 'string' && status !== 'all') {
        list = list.filter((a) => a.status === status);
      }

      let enriched = await Promise.all(list.map((a) => enrichAppointment(a, allDocs)));

      if (search && typeof search === 'string') {
        const term = search.toLowerCase();
        enriched = enriched.filter(
          (a) =>
            a.patient?.full_name?.toLowerCase().includes(term) ||
            a.patient?.email?.toLowerCase().includes(term) ||
            a.doctor?.full_name?.toLowerCase().includes(term)
        );
      }

      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Appointment Actions: Confirm
  app.post('/api/v1/appointments/:appointmentId/confirm', async (req, res) => {
    const { appointmentId } = req.params;
    console.log(`[CONFIRM_ROUTE] Confirm endpoint reached for appointment: ${appointmentId}`);

    const all = await getAuthoritativeAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) return res.status(404).json({ detail: 'Appointment not found' });
    if (target.status !== 'pending') {
      return res.status(400).json({ detail: `Cannot confirm appointment in '${target.status}' status` });
    }

    target.status = 'confirmed';
    let finalEnriched: any = null;

    if (supabaseAdmin) {
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('appointments')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .single();
      if (updateErr) {
        console.error('[API] Failed to confirm appointment in Supabase:', updateErr);
        return res.status(500).json({ detail: `Database error: ${updateErr.message}`, code: updateErr.code });
      }
      if (updatedData) {
        finalEnriched = await enrichAppointment(updatedData);
      }
    }
    if (!finalEnriched) {
      finalEnriched = await enrichAppointment(target);
    }

    // Safe trigger for n8n appointment confirmation email webhook
    const rawWebhookUrl = process.env.N8N_APPOINTMENT_CONFIRMATION_WEBHOOK_URL;
    const webhookUrl = rawWebhookUrl ? rawWebhookUrl.trim().replace(/^["']|["']$/g, '') : '';
    const isWebhookConfigured = Boolean(webhookUrl && webhookUrl.startsWith('http'));
    console.log(`[N8N_WEBHOOK] N8N webhook configured: ${isWebhookConfigured}`);

    if (isWebhookConfigured) {
      console.log(`[N8N_WEBHOOK] Sending appointment confirmation to n8n for appointment: ${appointmentId}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const payload = {
          patient_name: finalEnriched.patient?.full_name || 'Patient',
          patient_email: finalEnriched.patient?.email || '',
          doctor_name: finalEnriched.doctor?.full_name || 'Doctor',
          appointment_date: formatClinicDate(finalEnriched.start_time),
          appointment_time: formatClinicTime(finalEnriched.start_time),
          appointment_id: finalEnriched.id,
          status: 'confirmed',
        };

        const webhookRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!webhookRes.ok) {
          console.error(`[N8N_WEBHOOK] n8n webhook response status: ${webhookRes.status} ${webhookRes.statusText} (failed)`);
        } else {
          console.log(`[N8N_WEBHOOK] n8n webhook response status: ${webhookRes.status} ${webhookRes.statusText} (success)`);
          console.log(`[N8N_WEBHOOK] Confirmation email webhook triggered successfully for appointment ${appointmentId}`);
        }
      } catch (webhookErr: any) {
        console.error(`[N8N_WEBHOOK] Error calling appointment confirmation webhook: ${webhookErr.message || webhookErr}`);
      }
    } else {
      console.warn('[N8N_WEBHOOK] Skipping n8n webhook trigger: N8N_APPOINTMENT_CONFIRMATION_WEBHOOK_URL is not configured or invalid.');
    }

    return res.json(finalEnriched);
  });

  // Appointment Actions: Reject
  app.post('/api/v1/appointments/:appointmentId/reject', async (req, res) => {
    const { appointmentId } = req.params;
    const authUserId = await getUserIdFromRequest(req);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cancelledByUuid = (authUserId && UUID_REGEX.test(authUserId)) ? authUserId : null;

    const all = await getAuthoritativeAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) return res.status(404).json({ detail: 'Appointment not found' });

    if (supabaseAdmin) {
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Rejected by doctor',
          cancelled_by: cancelledByUuid,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .single();
      if (updateErr) {
        console.error('[API] Failed to reject appointment in Supabase:', updateErr);
        return res.status(500).json({ detail: `Database error: ${updateErr.message}`, code: updateErr.code });
      }
      if (updatedData) {
        const enriched = await enrichAppointment(updatedData);
        return res.json(enriched);
      }
    }

    target.status = 'cancelled';
    target.cancellation_reason = 'Rejected by doctor';
    target.cancelled_by = cancelledByUuid;
    const enriched = await enrichAppointment(target);
    return res.json(enriched);
  });

  // Appointment Actions: Cancel (Patient or Admin)
  app.post(['/api/v1/appointments/:appointmentId/cancel', '/api/v1/admin/appointments/:appointmentId/cancel'], async (req, res) => {
    const { appointmentId } = req.params;
    const { reason } = req.body || {};
    const isAdmin = req.path.includes('/admin/');

    // 1. Fetch the target appointment from Supabase or authoritative store
    let target: any = null;
    if (supabaseAdmin) {
      const { data: dbAppt, error: findErr } = await supabaseAdmin
        .from('appointments')
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .eq('id', appointmentId)
        .maybeSingle();
      if (findErr) {
        console.error('[API] Error finding appointment to cancel:', findErr);
        return res.status(500).json({ detail: `Database error: ${findErr.message}`, code: findErr.code });
      }
      target = dbAppt;
    }

    if (!target) {
      const all = await getAuthoritativeAppointments();
      target = all.find((a) => a.id === appointmentId);
    }

    if (!target) return res.status(404).json({ detail: 'Appointment not found' });

    if (target.status === 'cancelled') {
      return res.status(400).json({ detail: 'Appointment is already cancelled.', code: 'ALREADY_CANCELLED' });
    }
    if (target.status === 'completed') {
      return res.status(400).json({ detail: 'Cannot cancel an appointment that has already been completed.', code: 'ALREADY_COMPLETED' });
    }

    // 2. Authentication and Patient Ownership verification (Requirement 6)
    const authUserId = await getUserIdFromRequest(req);
    let isUserAdmin = isAdmin;
    if (authUserId && supabaseAdmin) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', authUserId)
        .maybeSingle();
      if (profile?.role === 'admin') {
        isUserAdmin = true;
      }
    }

    if (!isUserAdmin) {
      if (!authUserId) {
        return res.status(401).json({ detail: 'Authentication required to cancel an appointment.', code: 'UNAUTHORIZED' });
      }
      if (target.patient_id && target.patient_id !== authUserId) {
        return res.status(403).json({
          detail: 'Forbidden: You are only authorized to cancel your own appointments.',
          code: 'FORBIDDEN_PATIENT_MISMATCH',
        });
      }
    }

    // 3. Enforce 2-Hour Cancellation Cutoff Rule (Requirement 7)
    if (!isUserAdmin) {
      const startDt = new Date(target.start_time);
      const now = new Date();
      const diffMs = startDt.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 2) {
        return res.status(400).json({
          detail: 'Cancellations are only permitted at least 2 hours before the scheduled appointment time.',
          code: 'CANCELLATION_TOO_LATE',
          remaining_hours: Number(diffHours.toFixed(2)),
        });
      }
    }

    // 4. Resolve valid UUID for cancelled_by to prevent PostgreSQL 22P02 error
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cancelledByUuid = (authUserId && UUID_REGEX.test(authUserId))
      ? authUserId
      : (target.patient_id && UUID_REGEX.test(target.patient_id) ? target.patient_id : null);

    const cancellationReason = (typeof reason === 'string' && reason.trim())
      ? reason.trim()
      : (isUserAdmin ? 'Cancelled by clinic administration' : 'Cancelled by patient');
    const nowIso = new Date().toISOString();

    // 5. Execute Supabase UPDATE against public.appointments (Requirements 4, 5, 8, 9, 10, 11, 12)
    let updatedApptRecord = target;
    if (supabaseAdmin) {
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: cancellationReason,
          cancelled_by: cancelledByUuid,
          updated_at: nowIso,
        })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .single();

      if (updateErr) {
        console.error('[API] Failed to update appointment status to cancelled in Supabase:', updateErr);
        return res.status(500).json({
          detail: `Failed to cancel appointment in database: ${updateErr.message}`,
          code: updateErr.code,
        });
      }

      if (!updatedData) {
        return res.status(500).json({
          detail: 'Failed to cancel appointment: Database returned no updated record.',
          code: 'DB_NO_UPDATE',
        });
      }

      updatedApptRecord = updatedData;
    } else {
      target.status = 'cancelled';
      target.cancellation_reason = cancellationReason;
      target.cancelled_by = cancelledByUuid;
      target.updated_at = nowIso;
      updatedApptRecord = target;
    }

    const inMem = activeAppointments.find((a) => a.id === appointmentId);
    if (inMem) {
      inMem.status = 'cancelled';
      inMem.cancellation_reason = cancellationReason;
      inMem.cancelled_by = cancelledByUuid;
      inMem.updated_at = nowIso;
    }

    // 6. Return the updated appointment record
    const enriched = await enrichAppointment(updatedApptRecord);
    return res.json(enriched);
  });

  // Appointment Actions: Reschedule
  app.post('/api/v1/appointments/:appointmentId/reschedule', async (req, res) => {
    const { appointmentId } = req.params;
    const { new_start_time } = req.body || {};
    if (!new_start_time) return res.status(400).json({ detail: 'new_start_time is required' });

    const all = await getAuthoritativeAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) return res.status(404).json({ detail: 'Appointment not found' });

    const origStartDt = new Date(target.start_time);
    const now = new Date();
    const diffHours = (origStartDt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours < 2) {
      return res.status(400).json({
        detail: 'Rescheduling is only permitted at least 2 hours before the scheduled appointment time.',
      });
    }

    const newStartDt = new Date(new_start_time);
    if (isNaN(newStartDt.getTime())) {
      return res.status(400).json({ detail: 'new_start_time must be a valid timestamp' });
    }
    const newStartMs = newStartDt.getTime();
    const newStartIso = newStartDt.toISOString();
    const newEndDt = new Date(newStartMs + 30 * 60 * 1000);
    const newEndIso = newEndDt.toISOString();

    // Check slot conflict using epoch milliseconds to avoid timezone string mismatches
    const conflict = all.find(
      (a) => a.doctor_id === target.doctor_id &&
             new Date(a.start_time).getTime() === newStartMs &&
             a.status !== 'cancelled' &&
             a.id !== appointmentId
    );
    if (conflict) {
      return res.status(409).json({
        detail: 'Appointment slot is already booked. Please select another available time.',
        code: 'SLOT_CONFLICT',
      });
    }

    target.status = 'cancelled';
    target.cancellation_reason = `Rescheduled to ${newStartIso}`;

    let newAppt: any = {
      id: crypto.randomUUID ? crypto.randomUUID() : `appt-${Date.now()}`,
      doctor_id: target.doctor_id,
      patient_id: target.patient_id,
      start_time: newStartIso,
      end_time: newEndIso,
      status: 'pending',
      cancellation_reason: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
      patient: target.patient,
    };

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('appointments').update({ status: 'cancelled', cancellation_reason: target.cancellation_reason }).eq('id', appointmentId);
        const { data: ins } = await supabaseAdmin.from('appointments').insert({
          doctor_id: target.doctor_id,
          patient_id: target.patient_id,
          start_time: newStartIso,
          end_time: newEndIso,
          status: 'pending',
        }).select().single();
        if (ins) newAppt = ins;
      } catch {}
    }

    activeAppointments.unshift(newAppt);
    const enriched = await enrichAppointment(newAppt);
    return res.status(201).json(enriched);
  });

  // Appointment Actions: Complete
  app.post('/api/v1/appointments/:appointmentId/complete', async (req, res) => {
    const { appointmentId } = req.params;
    const all = await getAuthoritativeAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) return res.status(404).json({ detail: 'Appointment not found' });

    const startDt = new Date(target.start_time);
    const now = new Date();
    if (startDt > now) {
      return res.status(400).json({ detail: 'Cannot complete a future appointment' });
    }

    target.status = 'completed';
    if (supabaseAdmin) {
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('appointments')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .single();
      if (updateErr) {
        console.error('[API] Failed to complete appointment in Supabase:', updateErr);
        return res.status(500).json({ detail: `Database error: ${updateErr.message}`, code: updateErr.code });
      }
      if (updatedData) {
        const enriched = await enrichAppointment(updatedData);
        return res.json(enriched);
      }
    }
    const enriched = await enrichAppointment(target);
    return res.json(enriched);
  });

  // Appointment Actions: No-show
  app.post('/api/v1/appointments/:appointmentId/no-show', async (req, res) => {
    const { appointmentId } = req.params;
    const all = await getAuthoritativeAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) return res.status(404).json({ detail: 'Appointment not found' });

    target.status = 'no_show';
    if (supabaseAdmin) {
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('appointments')
        .update({ status: 'no_show', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(id, full_name, email, phone)')
        .single();
      if (updateErr) {
        console.error('[API] Failed to record no-show for appointment in Supabase:', updateErr);
        return res.status(500).json({ detail: `Database error: ${updateErr.message}`, code: updateErr.code });
      }
      if (updatedData) {
        const enriched = await enrichAppointment(updatedData);
        return res.json(enriched);
      }
    }
    const enriched = await enrichAppointment(target);
    return res.json(enriched);
  });

  // Helper to extract authenticated user & profile for Visit Notes security
  async function getAuthUserAndProfile(req: express.Request): Promise<{ id: string; role: string; email?: string } | null> {
    if (req.headers.authorization && supabaseAdmin) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '').trim();
        const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (!userErr && user) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id, role, email')
            .eq('id', user.id)
            .maybeSingle();

          const role = profile?.role || (user.user_metadata?.role as string) || 'patient';
          return {
            id: user.id,
            role,
            email: profile?.email || user.email,
          };
        }
      } catch (e) {
        console.warn('[AUTH] Token verification error:', e);
      }
    }

    const xUserId = req.headers['x-user-id'] as string;
    const xUserRole = req.headers['x-user-role'] as string;
    if (xUserId) {
      let role = xUserRole;
      if (!role && supabaseAdmin) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', xUserId)
          .maybeSingle();
        if (profile) role = profile.role;
      }
      return {
        id: xUserId,
        role: role || 'patient',
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Visit Notes Endpoints
  // ---------------------------------------------------------------------------

  // Create Visit Note (POST /api/v1/appointments/:appointmentId/visit-notes)
  app.post('/api/v1/appointments/:appointmentId/visit-notes', async (req, res) => {
    const { appointmentId } = req.params;
    const { notes, is_patient_visible } = req.body || {};

    // 1. Require authenticated user
    const authUser = await getAuthUserAndProfile(req);
    if (!authUser) {
      return res.status(401).json({ detail: 'Authentication required' });
    }

    // 2. User must have role doctor
    let isDoctor = authUser.role === 'doctor';
    if (!isDoctor && supabaseAdmin) {
      const { data: doc } = await supabaseAdmin
        .from('doctors')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();
      if (doc) isDoctor = true;
    }
    if (!isDoctor) {
      return res.status(403).json({ detail: 'Forbidden: Only doctors can create visit notes' });
    }

    // 3. Find appointment from Supabase
    let targetAppt: any = null;
    if (supabaseAdmin) {
      const { data: dbAppt, error: apptErr } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .maybeSingle();
      if (apptErr) {
        console.error('[VISIT_NOTES] Error fetching appointment:', apptErr);
        return res.status(500).json({ detail: `Database error: ${apptErr.message}` });
      }
      targetAppt = dbAppt;
    }

    if (!targetAppt) {
      const all = await getAuthoritativeAppointments();
      targetAppt = all.find((a) => a.id === appointmentId);
    }

    if (!targetAppt) {
      return res.status(404).json({ detail: 'Appointment not found' });
    }

    // 4. Verify appointment belongs to the authenticated doctor
    if (targetAppt.doctor_id !== authUser.id) {
      return res.status(403).json({ detail: 'Forbidden: You are not the assigned doctor for this appointment' });
    }

    // 5. Appointment must have status completed
    if (targetAppt.status !== 'completed') {
      return res.status(400).json({
        detail: 'Visit notes can only be created for completed appointments',
        code: 'APPOINTMENT_NOT_COMPLETED',
      });
    }

    // 6. Validate notes content
    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ detail: 'notes is required' });
    }

    const patientVisibility = is_patient_visible !== undefined ? Boolean(is_patient_visible) : true;

    // 7. Check if a visit note already exists for this appointment (Uniqueness check)
    if (supabaseAdmin) {
      const { data: existingNote, error: checkErr } = await supabaseAdmin
        .from('visit_notes')
        .select('id')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (checkErr) {
        console.error('[VISIT_NOTES] Error checking existing note:', checkErr);
        return res.status(500).json({ detail: `Database error: ${checkErr.message}` });
      }

      if (existingNote) {
        return res.status(400).json({
          detail: 'A visit note already exists for this appointment',
          code: 'DUPLICATE_VISIT_NOTE',
        });
      }

      // 8. Insert into public.visit_notes
      const { data: insertedNote, error: insertErr } = await supabaseAdmin
        .from('visit_notes')
        .insert({
          appointment_id: appointmentId,
          doctor_id: targetAppt.doctor_id,
          patient_id: targetAppt.patient_id,
          notes: notes.trim(),
          is_patient_visible: patientVisibility,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[VISIT_NOTES] Error inserting visit note into Supabase:', insertErr);
        return res.status(500).json({ detail: `Failed to create visit note: ${insertErr.message}` });
      }

      return res.status(201).json(insertedNote);
    }

    // In-memory fallback
    const mockNote = {
      id: `vn-${Date.now()}`,
      appointment_id: appointmentId,
      doctor_id: targetAppt.doctor_id,
      patient_id: targetAppt.patient_id,
      notes: notes.trim(),
      is_patient_visible: patientVisibility,
      created_at: new Date().toISOString(),
    };
    return res.status(201).json(mockNote);
  });

  // Update Visit Note (PUT /api/v1/appointments/:appointmentId/visit-notes)
  app.put('/api/v1/appointments/:appointmentId/visit-notes', async (req, res) => {
    const { appointmentId } = req.params;
    const { notes, is_patient_visible } = req.body || {};

    const authUser = await getAuthUserAndProfile(req);
    if (!authUser) {
      return res.status(401).json({ detail: 'Authentication required' });
    }

    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ detail: 'notes is required' });
    }

    if (supabaseAdmin) {
      const { data: existingNote, error: fetchErr } = await supabaseAdmin
        .from('visit_notes')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (fetchErr) {
        return res.status(500).json({ detail: `Database error: ${fetchErr.message}` });
      }
      if (!existingNote) {
        return res.status(404).json({ detail: 'Visit note not found' });
      }

      if (existingNote.doctor_id !== authUser.id) {
        return res.status(403).json({ detail: 'Forbidden: You are not the assigned doctor for this visit note' });
      }

      const patientVisibility = is_patient_visible !== undefined ? Boolean(is_patient_visible) : existingNote.is_patient_visible;

      const { data: updatedNote, error: updateErr } = await supabaseAdmin
        .from('visit_notes')
        .update({
          notes: notes.trim(),
          is_patient_visible: patientVisibility,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingNote.id)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({ detail: `Failed to update visit note: ${updateErr.message}` });
      }

      return res.json(updatedNote);
    }

    return res.status(404).json({ detail: 'Visit note not found' });
  });

  // Read Visit Note (GET /api/v1/appointments/:appointmentId/visit-notes)
  app.get('/api/v1/appointments/:appointmentId/visit-notes', async (req, res) => {
    const { appointmentId } = req.params;

    // 1. Require authenticated user
    const authUser = await getAuthUserAndProfile(req);
    if (!authUser) {
      return res.status(401).json({ detail: 'Authentication required' });
    }

    // 2. Admin strictly forbidden from reading visit notes
    if (authUser.role === 'admin') {
      return res.status(403).json({
        detail: 'Admins are strictly forbidden from viewing confidential clinical visit notes',
        code: 'ADMIN_ACCESS_FORBIDDEN',
      });
    }

    if (supabaseAdmin) {
      const { data: visitNote, error: fetchErr } = await supabaseAdmin
        .from('visit_notes')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (fetchErr) {
        console.error('[VISIT_NOTES] Error fetching visit note:', fetchErr);
        return res.status(500).json({ detail: `Database error: ${fetchErr.message}` });
      }

      if (!visitNote) {
        return res.status(404).json({ detail: 'Visit note not found' });
      }

      // 3. Security & Privacy Checks
      // Doctor check: Doctor can read only if assigned to this note
      if (authUser.id === visitNote.doctor_id) {
        return res.json(visitNote);
      }

      // Patient check: Patient can read only if assigned to this note AND is_patient_visible is true
      if (authUser.id === visitNote.patient_id) {
        if (!visitNote.is_patient_visible) {
          return res.status(403).json({
            detail: 'Forbidden: This visit note is marked confidential by the doctor',
            code: 'VISIT_NOTE_CONFIDENTIAL',
          });
        }
        return res.json(visitNote);
      }

      // Neither doctor nor patient on the note
      return res.status(403).json({
        detail: 'Forbidden: You are not authorized to view this visit note',
        code: 'ACCESS_DENIED',
      });
    }

    return res.status(404).json({ detail: 'Visit note not found' });
  });

  // Maintenance Endpoint: Expire Stale Pending Appointments
  // Safe to run repeatedly: updates ONLY pending appointments whose start_time <= current UTC time
  app.post('/api/v1/appointments/expire-pending', async (req, res) => {
    try {
      const count = await expirePendingAppointments();
      return res.json({
        expired_count: count,
        message: `Expired ${count} unconfirmed pending appointment${count === 1 ? '' : 's'}.`,
      });
    } catch (err: any) {
      console.error('[API] /expire-pending endpoint error:', err);
      return res.status(500).json({ detail: err.message || 'Failed to expire pending appointments' });
    }
  });

  // Admin: Stats
  app.get('/api/v1/admin/stats', async (req, res) => {
    try {
      const docs = await getAuthoritativeDoctors();
      const appts = await getAuthoritativeAppointments();
      const todayStr = new Date().toISOString().split('T')[0];

      return res.json({
        total_doctors: docs.length,
        active_doctors: docs.filter((d: any) => d.is_active).length,
        total_patients: 12,
        today_appointments: appts.filter((a) => a.start_time.startsWith(todayStr)).length,
        pending_appointments: appts.filter((a) => a.status === 'pending').length,
        confirmed_appointments: appts.filter((a) => a.status === 'confirmed').length,
        completed_appointments: appts.filter((a) => a.status === 'completed').length,
        no_show_appointments: appts.filter((a) => a.status === 'no_show').length,
        cancelled_appointments: appts.filter((a) => a.status === 'cancelled').length,
      });
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Admin: Onboard New Doctor (POST /api/v1/admin/doctors)
  app.post('/api/v1/admin/doctors', async (req, res) => {
    const { full_name, email, phone, specialty_id, qualification, bio, password, is_active } = req.body;

    // 1. Validation
    if (!full_name || !email || !specialty_id || !qualification) {
      return res.status(400).json({
        detail: 'Required fields missing: full_name, email, specialty_id, and qualification are required.'
      });
    }

    const doctorEmail = String(email).trim().toLowerCase();
    const doctorPassword = password && String(password).trim().length >= 6
      ? String(password).trim()
      : 'Doctor@1234';

    const validSpecialtyId = normalizeSpecialtyId(specialty_id);

    if (!supabaseAdmin) {
      console.error('[API] Supabase Admin client is not configured.');
      return res.status(500).json({
        detail: 'Server configuration error: Supabase Admin client is not initialized.'
      });
    }

    let createdAuthUserId: string | null = null;

    try {
      // 2. Check if user already exists in Supabase Auth
      const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!listErr && existingUsers?.users) {
        const foundUser = existingUsers.users.find((u: any) => u.email?.toLowerCase() === doctorEmail);
        if (foundUser) {
          return res.status(409).json({
            detail: `A user with email '${doctorEmail}' already exists in Supabase Authentication.`
          });
        }
      }

      // 3. Create Supabase Auth user using service-role Admin API
      console.log(`[API] Creating Supabase Auth user for doctor: ${doctorEmail}`);
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: doctorEmail,
        password: doctorPassword,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          phone: phone ? String(phone).trim() : undefined,
          role: 'doctor',
          specialty_id: validSpecialtyId,
          qualification: qualification.trim(),
          bio: bio ? String(bio).trim() : undefined,
          is_active: is_active !== undefined ? is_active : true,
        },
      });

      if (authError || !authData.user) {
        console.error('[API] Supabase Auth creation failed:', authError?.message || authError);
        const errMsg = authError?.message || 'Failed to create doctor account in Supabase Auth';
        const statusCode = errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('exists')
          ? 409
          : 400;
        return res.status(statusCode).json({ detail: errMsg });
      }

      // The returned Auth UUID is the authoritative ID for all doctor records: auth.users.id = profiles.id = doctors.id
      createdAuthUserId = authData.user.id;
      console.log(`[API] Supabase Auth user created successfully. UUID: ${createdAuthUserId}`);

      // 4. Create/Upsert Profile row in public.profiles (role = 'doctor')
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: createdAuthUserId,
        email: doctorEmail,
        full_name: full_name.trim(),
        phone: phone ? String(phone).trim() : null,
        role: 'doctor',
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        console.error('[API] Fatal error during profile table upsert:', profileError.message);
        throw new Error(`Failed to write to profiles table: ${profileError.message} (Code: ${profileError.code || 'unknown'})`);
      }

      // 5. Create Doctor row in public.doctors (id = createdAuthUserId)
      const { error: doctorError } = await supabaseAdmin.from('doctors').upsert({
        id: createdAuthUserId,
        specialty_id: validSpecialtyId,
        qualification: qualification.trim(),
        bio: bio ? String(bio).trim() : null,
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date().toISOString(),
      });
      if (doctorError) {
        console.error('[API] Fatal error during doctor table upsert:', doctorError.message);
        throw new Error(`Failed to write to doctors table: ${doctorError.message} (Code: ${doctorError.code || 'unknown'})`);
      }

      // 6. Seed default working hours
      const defaultWorkingHours = [
        { doctor_id: createdAuthUserId, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
        { doctor_id: createdAuthUserId, day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
        { doctor_id: createdAuthUserId, day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
        { doctor_id: createdAuthUserId, day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
        { doctor_id: createdAuthUserId, day_of_week: 5, start_time: '09:00:00', end_time: '14:00:00', is_available: true },
        { doctor_id: createdAuthUserId, day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
        { doctor_id: createdAuthUserId, day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
      ];

      const { error: whError } = await supabaseAdmin.from('doctor_working_hours').upsert(defaultWorkingHours, { onConflict: 'doctor_id,day_of_week' });
      if (whError) {
        console.warn('[API] Notice during working hours insert:', whError.message);
      }

      // Resolve specialty object
      const specObj = CLINIC_SPECIALTIES.find(s => s.id === validSpecialtyId) || {
        id: validSpecialtyId,
        name: 'Specialist',
        description: '',
      };

      const responseDoctor = {
        id: createdAuthUserId,
        full_name: full_name.trim(),
        email: doctorEmail,
        phone: phone ? String(phone).trim() : undefined,
        qualification: qualification.trim(),
        bio: bio ? String(bio).trim() : undefined,
        is_active: is_active !== undefined ? is_active : true,
        specialty: specObj,
        working_hours: defaultWorkingHours,
      };

      return res.status(201).json(responseDoctor);
    } catch (err: any) {
      console.error('[API] Unexpected error during doctor onboarding:', err);

      // Rollback Auth user if an unhandled exception occurred after auth creation
      if (createdAuthUserId) {
        try {
          console.log(`[API] Rolling back Auth user ${createdAuthUserId}`);
          await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
        } catch (rollbackErr) {
          console.error('[API] Auth user rollback failed:', rollbackErr);
        }
      }

      return res.status(500).json({
        detail: `Failed to onboard doctor: ${err?.message || 'Internal server error'}`
      });
    }
  });

  // Admin: Reconcile / Re-create orphaned test doctor Auth account
  app.post('/api/v1/admin/reconcile-doctor', async (req, res) => {
    const { email, password, full_name, phone, specialty_id, qualification, bio } = req.body;
    if (!email || !supabaseAdmin) {
      return res.status(400).json({ detail: 'Email is required and Supabase Admin must be configured.' });
    }

    const doctorEmail = String(email).trim().toLowerCase();
    const doctorPassword = password ? String(password).trim() : 'Doctor@1234';

    try {
      // 1. Check if auth user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      let authUser: any = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === doctorEmail);

      if (!authUser) {
        // Create the missing Auth user
        const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: doctorEmail,
          password: doctorPassword,
          email_confirm: true,
          user_metadata: {
            full_name: full_name || 'Dr. Medical Staff',
            phone: phone || undefined,
            role: 'doctor',
          },
        });
        if (createErr) {
          return res.status(400).json({ detail: createErr.message });
        }
        authUser = newAuth.user;
      } else {
        // Update user password and metadata
        await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
          password: doctorPassword,
          email_confirm: true,
          user_metadata: {
            full_name: full_name || authUser.user_metadata?.full_name || 'Dr. Medical Staff',
            phone: phone || authUser.user_metadata?.phone,
            role: 'doctor',
          },
        });
      }

      const doctorId = authUser.id;

      // Upsert profile and doctor records
      try {
        await supabaseAdmin.from('profiles').upsert({
          id: doctorId,
          email: doctorEmail,
          full_name: full_name || authUser.user_metadata?.full_name || 'Dr. Medical Staff',
          phone: phone || null,
          role: 'doctor',
        });
      } catch {}

      try {
        await supabaseAdmin.from('doctors').upsert({
          id: doctorId,
          specialty_id: specialty_id || 'spec-004',
          qualification: qualification || 'MBBS, FCPS',
          bio: bio || null,
          is_active: true,
        });
      } catch {}

      return res.json({
        status: 'reconciled',
        doctor_id: doctorId,
        email: doctorEmail,
        role: 'doctor',
      });
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // Admin: Update Doctor
  app.put('/api/v1/admin/doctors/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const { full_name, phone, qualification, bio, is_active, specialty_id } = req.body;

    if (supabaseAdmin) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(doctorId);
        const existingMeta = userData?.user?.user_metadata || {};
        await supabaseAdmin.auth.admin.updateUserById(doctorId, {
          user_metadata: {
            ...existingMeta,
            ...(full_name && { full_name: full_name.trim() }),
            ...(phone !== undefined && { phone: phone ? String(phone).trim() : '' }),
            ...(qualification && { qualification: qualification.trim() }),
            ...(bio !== undefined && { bio: bio ? String(bio).trim() : '' }),
            ...(is_active !== undefined && { is_active }),
            ...(specialty_id && { specialty_id }),
          },
        });

        if (full_name || phone) {
          await supabaseAdmin.from('profiles').update({
            ...(full_name && { full_name: full_name.trim() }),
            ...(phone && { phone: String(phone).trim() }),
          }).eq('id', doctorId);
        }
        await supabaseAdmin.from('doctors').update({
          ...(qualification && { qualification: qualification.trim() }),
          ...(bio !== undefined && { bio: bio ? String(bio).trim() : null }),
          ...(is_active !== undefined && { is_active }),
          ...(specialty_id && { specialty_id }),
        }).eq('id', doctorId);
      } catch (err) {
        console.warn('[API] Update doctor notice:', err);
      }
    }

    return res.json({ id: doctorId, full_name, phone, qualification, bio, is_active, specialty_id });
  });

  // Admin: Set Doctor Status
  app.patch('/api/v1/admin/doctors/:doctorId/status', async (req, res) => {
    const { doctorId } = req.params;
    const { is_active } = req.body;

    if (supabaseAdmin) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(doctorId);
        const existingMeta = userData?.user?.user_metadata || {};
        await supabaseAdmin.auth.admin.updateUserById(doctorId, {
          user_metadata: {
            ...existingMeta,
            is_active: is_active,
          },
        });

        await supabaseAdmin.from('doctors').update({ is_active }).eq('id', doctorId);
      } catch (err) {
        console.warn('[API] Set doctor status notice:', err);
      }
    }

    return res.json({ id: doctorId, is_active });
  });

  // Helper to convert clinic date string (YYYY-MM-DD) in Asia/Karachi to UTC boundary ISO strings
  function getClinicDayUtcBoundaries(dateStr: string, timeZone = 'Asia/Karachi'): { startUtcIso: string; endUtcIso: string } {
    const [y, m, d] = dateStr.split('-').map(Number);

    function getUtcForLocal(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): Date {
      const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(utcGuess);
      const map: Record<string, string> = {};
      for (const p of parts) map[p.type] = p.value;

      const asLocalGuess = new Date(Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second),
        ms
      ));
      const diff = utcGuess.getTime() - asLocalGuess.getTime();
      return new Date(utcGuess.getTime() + diff);
    }

    const startUtc = getUtcForLocal(y, m, d, 0, 0, 0, 0);
    const nextDayUtc = getUtcForLocal(y, m, d + 1, 0, 0, 0, 0);
    const endUtc = new Date(nextDayUtc.getTime() - 1);

    return {
      startUtcIso: startUtc.toISOString(),
      endUtcIso: endUtc.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Doctor Leaves Management
  // ---------------------------------------------------------------------------
  app.get(['/api/v1/doctors/me/leaves', '/api/v1/doctors/:doctorId/leaves'], async (req, res) => {
    let doctorId = req.params.doctorId;
    if (!doctorId || doctorId === 'me') {
      const authId = await getUserIdFromRequest(req);
      doctorId = authId || '30b6de4e-174f-4381-831d-e3a6ae199596';
    }

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('doctor_leaves')
          .select('*')
          .eq('doctor_id', doctorId)
          .order('leave_date', { ascending: true });
        if (!error && data) {
          return res.json(data);
        }
      } catch {}
    }
    return res.json([]);
  });

  app.post(['/api/v1/doctors/me/leaves', '/api/v1/doctors/:doctorId/leaves'], async (req, res) => {
    let doctorId = req.params.doctorId;
    if (!doctorId || doctorId === 'me') {
      const authId = await getUserIdFromRequest(req);
      doctorId = authId || '30b6de4e-174f-4381-831d-e3a6ae199596';
    }
    const { leave_date, reason } = req.body;
    if (!leave_date) {
      return res.status(400).json({ detail: 'leave_date is required' });
    }

    const { startUtcIso, endUtcIso } = getClinicDayUtcBoundaries(leave_date, 'Asia/Karachi');
    const nowIso = new Date().toISOString();
    let cancelledCount = 0;

    if (supabaseAdmin) {
      try {
        // 1. Insert leave date into doctor_leaves
        const { data: leaveRecord, error: leaveErr } = await supabaseAdmin
          .from('doctor_leaves')
          .insert({
            doctor_id: doctorId,
            leave_date,
            reason: reason || 'Scheduled Leave',
          })
          .select()
          .single();

        if (leaveErr) {
          console.error('[LEAVE] Error creating doctor leave in Supabase:', leaveErr);
          return res.status(500).json({ detail: `Failed to create leave: ${leaveErr.message}` });
        }

        // 2. Update existing pending or confirmed appointments on leave date to cancelled
        const { data: cancelledAppts, error: cancelErr } = await supabaseAdmin
          .from('appointments')
          .update({
            status: 'cancelled',
            cancellation_reason: 'Doctor is on leave',
            updated_at: nowIso,
          })
          .eq('doctor_id', doctorId)
          .gte('start_time', startUtcIso)
          .lte('start_time', endUtcIso)
          .in('status', ['pending', 'confirmed'])
          .select();

        if (cancelErr) {
          console.error('[LEAVE] Error cancelling conflicting appointments in Supabase:', cancelErr);
          return res.status(500).json({ detail: `Doctor leave created, but appointment cancellation failed: ${cancelErr.message}` });
        }

        if (cancelledAppts && Array.isArray(cancelledAppts)) {
          cancelledCount = cancelledAppts.length;
        }

        // 3. Verify in Supabase that all affected appointments are actually cancelled
        if (cancelledCount > 0) {
          const cancelledIds = cancelledAppts.map((a: any) => a.id);
          const { data: verifiedRows, error: verifyErr } = await supabaseAdmin
            .from('appointments')
            .select('id, status')
            .in('id', cancelledIds);

          if (verifyErr) {
            console.error('[LEAVE] Error verifying appointment cancellations in Supabase:', verifyErr);
            return res.status(500).json({ detail: `Failed to verify cancellation in Supabase: ${verifyErr.message}` });
          }

          const uncancelled = (verifiedRows || []).filter((a: any) => a.status !== 'cancelled');
          if (uncancelled.length > 0) {
            console.error('[LEAVE] Verification failed, appointments still pending/confirmed:', uncancelled);
            return res.status(500).json({ detail: 'Failed to confirm appointment cancellation in Supabase.' });
          }
        }

        // Sync activeAppointments in memory for consistency
        const startMs = new Date(startUtcIso).getTime();
        const endMs = new Date(endUtcIso).getTime();
        for (const a of activeAppointments) {
          if (a.doctor_id === doctorId && (a.status === 'pending' || a.status === 'confirmed')) {
            const apptMs = new Date(a.start_time).getTime();
            if (apptMs >= startMs && apptMs <= endMs) {
              a.status = 'cancelled';
              a.cancellation_reason = 'Doctor is on leave';
              a.updated_at = nowIso;
            }
          }
        }

        return res.json({
          ...leaveRecord,
          cancelled_appointments_count: cancelledCount,
        });
      } catch (err: any) {
        console.error('[LEAVE] Exception in doctor leave creation:', err);
        return res.status(500).json({ detail: err.message || 'Internal error creating doctor leave' });
      }
    }

    // In-memory fallback if Supabase is not available
    const startMs = new Date(startUtcIso).getTime();
    const endMs = new Date(endUtcIso).getTime();
    for (const a of activeAppointments) {
      if (a.doctor_id === doctorId && (a.status === 'pending' || a.status === 'confirmed')) {
        const apptMs = new Date(a.start_time).getTime();
        if (apptMs >= startMs && apptMs <= endMs) {
          a.status = 'cancelled';
          a.cancellation_reason = 'Doctor is on leave';
          a.updated_at = nowIso;
          cancelledCount++;
        }
      }
    }

    return res.json({
      id: `leave-${Date.now()}`,
      doctor_id: doctorId,
      leave_date,
      reason: reason || 'Scheduled Leave',
      created_at: nowIso,
      cancelled_appointments_count: cancelledCount,
    });
  });

  app.delete(['/api/v1/doctors/me/leaves/:leaveId', '/api/v1/doctors/:doctorId/leaves/:leaveId'], async (req, res) => {
    const { leaveId } = req.params;
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('doctor_leaves').delete().eq('id', leaveId);
      } catch {}
    }
    return res.json({ success: true, id: leaveId });
  });

  // ---------------------------------------------------------------------------
  // Admin: Patients Directory
  // ---------------------------------------------------------------------------
  app.get('/api/v1/admin/patients', async (req, res) => {
    try {
      const { search } = req.query;
      let patients: any[] = [];

      if (supabaseAdmin) {
        try {
          const { data: profileRows, error: profErr } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email, phone, created_at')
            .eq('role', 'patient')
            .order('created_at', { ascending: false });

          if (!profErr && profileRows) {
            const { data: apptRows } = await supabaseAdmin
              .from('appointments')
              .select('id, patient_id, status');

            const apptList = Array.isArray(apptRows) ? apptRows : [];

            patients = profileRows.map((p: any) => {
              const pAppts = apptList.filter((a: any) => a.patient_id === p.id);
              return {
                id: p.id,
                full_name: p.full_name || 'Patient',
                email: p.email || '',
                phone: p.phone || '',
                created_at: p.created_at || new Date().toISOString(),
                total_appointments: pAppts.length,
                pending_appointments: pAppts.filter((a: any) => a.status === 'pending').length,
                confirmed_appointments: pAppts.filter((a: any) => a.status === 'confirmed').length,
                completed_appointments: pAppts.filter((a: any) => a.status === 'completed').length,
                cancelled_appointments: pAppts.filter((a: any) => a.status === 'cancelled').length,
                no_show_appointments: pAppts.filter((a: any) => a.status === 'no_show').length,
              };
            });
          }
        } catch (dbErr) {
          console.warn('[API] Admin patients query warning:', dbErr);
        }
      }

      if (patients.length === 0) {
        patients = [
          {
            id: 'pat-001',
            full_name: 'Ahmad Khan',
            email: 'patient@nowsheraclinic.pk',
            phone: '+92 300 1234567',
            created_at: '2026-09-01T08:00:00Z',
            total_appointments: 4,
            pending_appointments: 1,
            confirmed_appointments: 1,
            completed_appointments: 2,
            cancelled_appointments: 0,
            no_show_appointments: 0,
          },
          {
            id: 'pat-002',
            full_name: 'Fatima Zahra',
            email: 'fatima.z@example.com',
            phone: '+92 312 9876543',
            created_at: '2026-09-05T09:30:00Z',
            total_appointments: 2,
            pending_appointments: 0,
            confirmed_appointments: 1,
            completed_appointments: 1,
            cancelled_appointments: 0,
            no_show_appointments: 0,
          }
        ];
      }

      if (search && typeof search === 'string') {
        const term = search.toLowerCase();
        patients = patients.filter(
          (p) => p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)
        );
      }

      return res.json(patients);
    } catch (err: any) {
      return res.status(500).json({ detail: err.message || 'Failed to fetch patients' });
    }
  });

  // Safety: Return JSON 404 for any unhandled /api/* endpoint so client never receives HTML index.html
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
  });

  // ---------------------------------------------------------------------------
  // Vite Integration (Development vs Production)
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Nowshera Family Clinic server listening on port ${PORT}`);

    // ---------------------------------------------------------------------------
    // Background Scheduled Job: Expire Stale Pending Appointments (Every 60s)
    // Runs autonomously on the server regardless of whether any user/browser is open
    // ---------------------------------------------------------------------------
    const EXPIRATION_INTERVAL_MS = 60 * 1000;
    setInterval(async () => {
      try {
        await expirePendingAppointments();
      } catch (err) {
        console.error('[EXPIRATION] Background recurring expiration job error:', err);
      }
    }, EXPIRATION_INTERVAL_MS);

    // Run an immediate check on startup
    expirePendingAppointments().catch((err) => {
      console.error('[EXPIRATION] Initial startup expiration check error:', err);
    });
  });
}

startServer();
