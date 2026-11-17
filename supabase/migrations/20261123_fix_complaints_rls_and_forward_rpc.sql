-- ============================================================================
-- MIGRATION: Fix Complaints RLS Policies (Forwarding & Reopen) + Forward RPC
-- Resolves: "new row violates row-level security policy for table complaints"
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

-- 1. Drop ALL existing policies on public.complaints to eliminate any legacy conflicting policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'complaints'
    LOOP
        EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.complaints', pol.policyname);
    END LOOP;
END;
$$;

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- 2. Re-create clean, non-conflicting RLS policies on public.complaints
CREATE POLICY "Student can view own complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Department staff and office heads can view department complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
          AND (
              p.department_id = complaints.department_id
              OR p.department_id = complaints.forwarded_from_department_id
          )
    )
);

CREATE POLICY "Super admins can view all department complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Authenticated users can submit complaints"
ON public.complaints FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.departments d
        WHERE d.id = department_id AND d.is_active = TRUE
    )
);

-- Allow current department authorities (or super_admin) to update status or forward to ANY active department
CREATE POLICY "Department authorities can update or forward current department complaints"
ON public.complaints FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND p.department_id = complaints.department_id
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.departments d
        WHERE d.id = department_id AND d.is_active = TRUE
    )
);

-- Allow complainant to reopen their own resolved/closed complaint
CREATE POLICY "Complainant can reopen own resolved complaint"
ON public.complaints FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    AND status IN ('resolved', 'closed')
)
WITH CHECK (
    user_id = auth.uid()
    AND status = 'reopened'
);

GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;

-- 3. Atomic Stored Procedure (RPC) for Inter-Department Forwarding
CREATE OR REPLACE FUNCTION public.forward_complaint(
    p_complaint_id UUID,
    p_target_department_id UUID,
    p_reason TEXT
)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor public.profiles%ROWTYPE;
    v_complaint public.complaints%ROWTYPE;
    v_from_dept public.departments%ROWTYPE;
    v_target_dept public.departments%ROWTYPE;
    v_trimmed_reason TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to forward complaints.';
    END IF;

    v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
    IF LENGTH(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'Transfer reason must be at least 5 characters.';
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;
    IF v_actor.is_blocked THEN
        RAISE EXCEPTION 'Account is blocked from performing administrative actions.';
    END IF;

    SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found.', p_complaint_id;
    END IF;

    IF v_actor.role <> 'super_admin' THEN
        IF v_actor.role NOT IN ('office_head', 'dept_admin', 'staff', 'officer')
           OR (v_actor.department_id IS NOT NULL AND v_actor.department_id IS DISTINCT FROM v_complaint.department_id) THEN
            RAISE EXCEPTION 'Permission denied: You may only forward complaints assigned to your department.';
        END IF;
    END IF;

    IF p_target_department_id = v_complaint.department_id THEN
        RAISE EXCEPTION 'Target department must differ from the current department.';
    END IF;

    SELECT * INTO v_target_dept
    FROM public.departments
    WHERE id = p_target_department_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected target department was not found or is inactive.';
    END IF;

    SELECT * INTO v_from_dept FROM public.departments WHERE id = v_complaint.department_id;

    UPDATE public.complaints
    SET department_id = p_target_department_id,
        forwarded_from_department_id = v_complaint.department_id,
        forwarded_reason = v_trimmed_reason,
        forwarded_at = NOW(),
        transfer_count = COALESCE(v_complaint.transfer_count, 0) + 1,
        assigned_to = NULL,
        updated_at = NOW()
    WHERE id = p_complaint_id
    RETURNING * INTO v_complaint;

    INSERT INTO public.complaint_history (
        complaint_id,
        actor_id,
        actor_name,
        action,
        from_status,
        to_status,
        note
    )
    VALUES (
        p_complaint_id,
        v_actor_id,
        v_actor.full_name,
        'DEPARTMENT_TRANSFERRED',
        v_complaint.status,
        v_complaint.status,
        FORMAT(
            'Complaint officially transferred from %s to %s. Department Note: "%s"',
            COALESCE(v_from_dept.name, 'Previous Department'),
            v_target_dept.name,
            v_trimmed_reason
        )
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        action,
        target,
        details
    )
    VALUES (
        v_actor_id,
        v_actor.full_name,
        v_actor.role,
        'COMPLAINT_FORWARDED_INTER_DEPT',
        v_complaint.tracking_id,
        FORMAT(
            'Transferred ticket from %s to %s. Reason: %s',
            COALESCE(v_from_dept.code, 'PREV'),
            v_target_dept.code,
            v_trimmed_reason
        )
    );

    RETURN v_complaint;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_complaint(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forward_complaint(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
