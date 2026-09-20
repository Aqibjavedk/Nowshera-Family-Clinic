-- ==============================================================================
-- Nowshera Family Clinic - Initial Seed Data (Specialties & Initial Setup)
-- ==============================================================================

-- Insert Core Medical Specialties
INSERT INTO public.specialties (id, name, description)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Family Medicine', 'Comprehensive primary healthcare for individuals and family members of all ages.'),
    ('22222222-2222-2222-2222-222222222222', 'Pediatrics', 'Specialized medical care and wellness monitoring for infants, children, and adolescents.'),
    ('33333333-3333-3333-3333-333333333333', 'General Internal Medicine', 'Prevention, diagnosis, and treatment of adult acute and chronic diseases.'),
    ('44444444-4444-4444-4444-444444444444', 'Cardiology', 'Expert cardiovascular care, hypertension management, and heart health screenings.'),
    ('55555555-5555-5555-5555-555555555555', 'Dermatology', 'Diagnosis and clinical care for skin, hair, and dermatological conditions.')
ON CONFLICT (name) DO NOTHING;
