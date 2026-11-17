-- ============================================================================
-- MIGRATION: Public Complaint Tracking RPC (Safe Anon & Authenticated Lookup)
-- Resolves: "Could not find the function public.track_complaint_by_id(p_tracking_id) in the schema cache"
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.track_complaint_by_id(p_tracking_id VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_complaint RECORD;
    v_history JSONB;
    v_messages JSONB;
    v_feedback JSONB;
BEGIN
    SELECT
        c.id,
        c.tracking_id,
        c.user_id,
        c.department_id,
        d.code AS department_code,
        d.name AS department_name,
        c.category,
        c.subject,
        c.description,
        c.priority,
        c.is_sos,
        c.status,
        c.is_anonymous,
        c.deadline,
        c.created_at,
        c.updated_at
    INTO v_complaint
    FROM public.complaints c
    JOIN public.departments d ON d.id = c.department_id
    WHERE UPPER(c.tracking_id) = UPPER(TRIM(p_tracking_id))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'complaint_id', h.complaint_id,
                'actor_id', h.actor_id,
                'actor_name', h.actor_name,
                'action', h.action,
                'from_status', h.from_status,
                'to_status', h.to_status,
                'note', h.note,
                'created_at', h.created_at
            ) ORDER BY h.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_history
    FROM public.complaint_history h
    WHERE h.complaint_id = v_complaint.id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'complaint_id', m.complaint_id,
                'sender_id', m.sender_id,
                'sender_name', CASE WHEN v_complaint.is_anonymous AND m.sender_id = v_complaint.user_id THEN 'Anonymous Student' ELSE m.sender_name END,
                'sender_role', m.sender_role,
                'body', m.body,
                'is_internal', m.is_internal,
                'created_at', m.created_at
            ) ORDER BY m.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_messages
    FROM public.complaint_messages m
    WHERE m.complaint_id = v_complaint.id
      AND m.is_internal = FALSE;

    SELECT to_jsonb(f.*)
    INTO v_feedback
    FROM public.complaint_feedback f
    WHERE f.complaint_id = v_complaint.id
    LIMIT 1;

    RETURN jsonb_build_object(
        'id', v_complaint.id,
        'tracking_id', v_complaint.tracking_id,
        'user_id', v_complaint.user_id,
        'department_id', v_complaint.department_id,
        'department_code', v_complaint.department_code,
        'department_name', v_complaint.department_name,
        'category', v_complaint.category,
        'subject', v_complaint.subject,
        'description', v_complaint.description,
        'priority', v_complaint.priority,
        'is_sos', v_complaint.is_sos,
        'status', v_complaint.status,
        'is_anonymous', v_complaint.is_anonymous,
        'deadline', v_complaint.deadline,
        'created_at', v_complaint.created_at,
        'updated_at', v_complaint.updated_at,
        'history', v_history,
        'messages', v_messages,
        'feedback', v_feedback
    );
END;
$$;

REVOKE ALL ON FUNCTION public.track_complaint_by_id(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint_by_id(VARCHAR) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
