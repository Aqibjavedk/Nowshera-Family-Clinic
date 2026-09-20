-- ==============================================================================
-- Nowshera Family Clinic - Phase 2 Security & RLS Hardening
-- Tightens appointment update policy to prevent arbitrary client-side state manipulation.
-- All appointment state transitions must be authorized and validated by FastAPI backend.
-- ==============================================================================

-- 1. Drop the overly permissive Phase 1 UPDATE policy on appointments
DROP POLICY IF EXISTS "Authorized status updates" ON public.appointments;

-- 2. Prevent arbitrary direct client updates on critical appointment fields.
-- In Phase 2, the FastAPI backend (using service_role) enforces all transition rules:
-- (pending -> confirmed, pending -> cancelled, confirmed -> completed/no_show, 2h cutoff)
-- Direct client UPDATE via Supabase client is disabled for non-admin accounts.
-- Admins retain override access if emergency intervention is required.
CREATE POLICY "Strict administrative updates" ON public.appointments
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 3. Read access policies remain strictly scoped:
-- - Patients can ONLY read their own appointments
-- - Doctors can ONLY read their own assigned appointments
-- - Admins can read all appointments (already in Phase 1 migration)
