-- ==============================================================================
-- Migration 008: Add Cancellation Email Tracking & Polling Support
-- Nowshera Family Clinic
-- Execute this SQL script directly in your Supabase Project SQL Editor
-- ==============================================================================

-- 1. Add cancellation_email_sent_at column to appointments table
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS cancellation_email_sent_at TIMESTAMPTZ NULL;

-- 2. Partial index for ultra-fast n8n polling of unprocessed cancellations
CREATE INDEX IF NOT EXISTS idx_appointments_cancellation_email_pending
ON public.appointments (status, cancellation_email_sent_at)
WHERE status = 'cancelled' AND cancellation_email_sent_at IS NULL;

-- 3. Dedicated view for n8n polling workflow with Asia/Karachi timezone formatting
CREATE OR REPLACE VIEW public.pending_cancellation_emails AS
SELECT 
    a.id AS appointment_id,
    a.start_time,
    to_char(a.start_time AT TIME ZONE 'Asia/Karachi', 'Mon DD, YYYY') AS appointment_date,
    to_char(a.start_time AT TIME ZONE 'Asia/Karachi', 'HH12:MI AM') AS appointment_time,
    a.status,
    COALESCE(NULLIF(TRIM(a.cancellation_reason), ''), 'Cancelled by clinic administration') AS cancellation_reason,
    a.cancellation_email_sent_at,
    p.full_name AS patient_name,
    p.email AS patient_email,
    dp.full_name AS doctor_name
FROM public.appointments a
JOIN public.profiles p ON a.patient_id = p.id
JOIN public.doctors d ON a.doctor_id = d.id
JOIN public.profiles dp ON d.id = dp.id
WHERE a.status = 'cancelled'
  AND a.cancellation_email_sent_at IS NULL;

-- 4. Grant table and view permissions to service_role and authenticated
GRANT SELECT, UPDATE(cancellation_email_sent_at) ON public.appointments TO authenticated, service_role, postgres;
GRANT SELECT ON public.pending_cancellation_emails TO authenticated, service_role, postgres;
