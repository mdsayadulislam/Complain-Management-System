-- ============================================================================
-- MIGRATION: Atomic Complaint Status Transition RPC & Immutable History Trigger
-- Resolves: "Could not find the function public.update_complaint_status(p_complaint_id, p_new_status, p_note) in the schema cache"
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'complaint_history records are strictly immutable and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_immutable_complaint_history ON public.complaint_history;
CREATE TRIGGER enforce_immutable_complaint_history
BEFORE UPDATE OR DELETE ON public.complaint_history
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.update_complaint_status(
    p_complaint_id UUID,
    p_new_status VARCHAR,
    p_note TEXT
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
    v_from_status VARCHAR(30);
    v_trimmed_note TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update complaint status.';
    END IF;

    v_trimmed_note := TRIM(COALESCE(p_note, ''));
    IF LENGTH(v_trimmed_note) < 3 THEN
        RAISE EXCEPTION 'A mandatory rationale note (minimum 3 characters) is required for status transitions.';
    END IF;

    IF p_new_status NOT IN ('submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened') THEN
        RAISE EXCEPTION 'Invalid complaint status: %', p_new_status;
    END IF;

    SELECT * INTO v_actor
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    IF v_actor.is_blocked THEN
        RAISE EXCEPTION 'Account is blocked from performing administrative actions.';
    END IF;

    SELECT * INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found.', p_complaint_id;
    END IF;

    IF v_actor.role <> 'super_admin' THEN
        IF v_actor.role NOT IN ('office_head', 'dept_admin', 'staff', 'officer')
           OR v_actor.department_id IS DISTINCT FROM v_complaint.department_id THEN
            RAISE EXCEPTION 'Permission denied: You may only update complaints assigned to your department.';
        END IF;
    END IF;

    v_from_status := v_complaint.status;

    UPDATE public.complaints
    SET status = p_new_status,
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
        'STATUS_UPDATED',
        v_from_status,
        p_new_status,
        v_trimmed_note
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
        'STATUS_TRANSITION',
        v_complaint.tracking_id,
        FORMAT('Transitioned status from %s to %s. Note: %s', v_from_status, p_new_status, v_trimmed_note)
    );

    RETURN v_complaint;
END;
$$;

REVOKE ALL ON FUNCTION public.update_complaint_status(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_complaint_status(UUID, VARCHAR, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
