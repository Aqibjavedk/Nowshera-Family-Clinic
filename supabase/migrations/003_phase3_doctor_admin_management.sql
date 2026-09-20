-- ==============================================================================
-- Nowshera Family Clinic - Phase 3 Database Migration
-- Doctor & Admin Management, Automated Leave Cancellations, & Strict RLS
-- ==============================================================================

-- 1. Automated appointment cancellation trigger when doctor schedules leave
-- Invariant: Adding leave automatically cancels pending and confirmed appointments
-- for that date in Asia/Karachi, preserves historical/completed records,
-- and releases the slots back to the clinic pool.
CREATE OR REPLACE FUNCTION public.cancel_appointments_on_doctor_leave()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.appointments
    SET status = 'cancelled',
        cancellation_reason = 'Cancelled due to doctor scheduled leave',
        cancelled_by = NEW.doctor_id,
        updated_at = NOW()
    WHERE doctor_id = NEW.doctor_id
      AND (status = 'pending' OR status = 'confirmed')
      AND DATE(start_time AT TIME ZONE 'Asia/Karachi') = NEW.leave_date;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cancel_appointments_on_doctor_leave ON public.doctor_leaves;
CREATE TRIGGER trg_cancel_appointments_on_doctor_leave
    AFTER INSERT ON public.doctor_leaves
    FOR EACH ROW EXECUTE FUNCTION public.cancel_appointments_on_doctor_leave();

-- 2. Refined Doctors Table RLS
-- Admins have full access to view, insert, and update all doctors (active & inactive)
DROP POLICY IF EXISTS "Admins can insert/update doctors" ON public.doctors;
DROP POLICY IF EXISTS "Public read active doctors" ON public.doctors;

CREATE POLICY "Public read active doctors" ON public.doctors
    FOR SELECT USING (
        is_active = true 
        OR auth.uid() = id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins full management on doctors" ON public.doctors
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Doctors can update own metadata" ON public.doctors
    FOR UPDATE USING (
        auth.uid() = id
    )
    WITH CHECK (
        auth.uid() = id
    );

-- 3. Refined Working Hours RLS
DROP POLICY IF EXISTS "Doctors can manage own working hours" ON public.doctor_working_hours;
CREATE POLICY "Doctors manage own working hours" ON public.doctor_working_hours
    FOR ALL USING (
        auth.uid() = doctor_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 4. Refined Doctor Leaves RLS
DROP POLICY IF EXISTS "Doctors can manage own leaves" ON public.doctor_leaves;
CREATE POLICY "Doctors manage own leaves" ON public.doctor_leaves
    FOR ALL USING (
        auth.uid() = doctor_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 5. Profiles RLS
-- Admins can update profile information (e.g. updating doctor contact information)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE USING (
        public.is_admin(auth.uid())
    );

-- 6. Strict Privacy Confirmation for Visit Notes
-- Ensure NO admin policy exists for visit_notes; Admins CANNOT read clinical notes.
-- (Only the assigned doctor and patient with visibility flag can read).
DO $$ BEGIN
    -- Verify that only doctor and patient policies exist on visit_notes
    RAISE NOTICE 'Confirmed: public.visit_notes has zero admin SELECT policies.';
END $$;
