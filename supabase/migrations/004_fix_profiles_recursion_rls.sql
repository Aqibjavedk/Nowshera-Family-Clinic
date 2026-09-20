-- ==============================================================================
-- Migration 004: Fix Infinite Recursion in public.profiles RLS Policies
-- Date: 2026-09-17
-- Description: Replaces self-referential RLS policies on public.profiles with a SECURITY DEFINER
-- function (is_admin) to eliminate error 42P17 (infinite recursion detected in policy for relation "profiles").
-- ==============================================================================

-- 1. Create a helper function with SECURITY DEFINER that executes with postgres permissions
-- to inspect the admin role without triggering RLS recursively.
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND role = 'admin'
  );
$$;

-- Grant execute on this function to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role, anon;

-- 2. Drop existing recursive policies on public.profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

-- 3. Recreate the policies using public.is_admin(auth.uid())
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE USING (
        auth.uid() = id OR public.is_admin(auth.uid())
    );

-- 4. Grant table privileges to service_role and authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
