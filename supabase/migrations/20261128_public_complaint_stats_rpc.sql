-- ============================================================================
-- Migration: 20261128_public_complaint_stats_rpc.sql
-- Purpose:   Provide a privacy-safe, read-only aggregate statistics RPC
--            public.get_public_complaint_stats() for the BAUST Complaint
--            Management System landing page and main dashboards.
--
-- Privacy Guarantee:
--   * Returns ONLY aggregate counts, daily date buckets, and BAUST
--     department codes/names.
--   * Zero PII: never exposes complainant IDs, names, emails, subjects,
--     descriptions, tracking IDs, or internal messages.
--   * Excludes spam-flagged rows (is_spam = FALSE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_complaint_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_complaints BIGINT := 0;
    v_active_complaints BIGINT := 0;
    v_resolved_complaints BIGINT := 0;
    v_daily_trend JSONB := '[]'::jsonb;
    v_by_department JSONB := '[]'::jsonb;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE is_spam = FALSE),
        COUNT(*) FILTER (WHERE is_spam = FALSE AND status NOT IN ('resolved', 'closed')),
        COUNT(*) FILTER (WHERE is_spam = FALSE AND status IN ('resolved', 'closed'))
    INTO
        v_total_complaints,
        v_active_complaints,
        v_resolved_complaints
    FROM public.complaints;

    WITH daily_counts AS (
        SELECT
            DATE(c.created_at AT TIME ZONE 'UTC') AS day_date,
            COUNT(*)::BIGINT AS daily_count
        FROM public.complaints c
        WHERE c.is_spam = FALSE
        GROUP BY DATE(c.created_at AT TIME ZONE 'UTC')
    ),
    cumulative_counts AS (
        SELECT
            dc.day_date,
            dc.daily_count,
            SUM(dc.daily_count) OVER (ORDER BY dc.day_date ASC)::BIGINT AS cumulative_total
        FROM daily_counts dc
        ORDER BY dc.day_date ASC
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'date', TO_CHAR(cc.day_date, 'YYYY-MM-DD'),
                'count', cc.daily_count,
                'cumulative_total', cc.cumulative_total
            )
            ORDER BY cc.day_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_daily_trend
    FROM cumulative_counts cc;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'code', dept_rows.code,
                'name', dept_rows.name,
                'count', dept_rows.complaint_count
            )
            ORDER BY dept_rows.complaint_count DESC, dept_rows.code ASC
        ),
        '[]'::jsonb
    )
    INTO v_by_department
    FROM (
        SELECT
            d.code,
            d.name,
            COUNT(c.id)::BIGINT AS complaint_count
        FROM public.departments d
        LEFT JOIN public.complaints c
            ON c.department_id = d.id
           AND c.is_spam = FALSE
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.code, d.name
    ) dept_rows;

    RETURN jsonb_build_object(
        'total_complaints', COALESCE(v_total_complaints, 0),
        'active_complaints', COALESCE(v_active_complaints, 0),
        'resolved_complaints', COALESCE(v_resolved_complaints, 0),
        'daily_trend', v_daily_trend,
        'by_department', v_by_department
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_complaint_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_complaint_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
