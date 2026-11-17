-- ============================================================================
-- MIGRATION: Fix "Database error creating anonymous user" on Supabase Auth
-- Root cause: auth.users trigger public.handle_new_user() failed when
-- anonymous users were inserted with email = NULL.
-- Safe to run standalone and idempotent.
-- ============================================================================

-- 1. Allow NULL email on public.profiles as extra safety (anonymous users get synthetic email)
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- 2. Make handle_new_user() completely NULL-safe and non-blocking for anonymous sign-ins
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_dept_id UUID;
    v_is_anon BOOLEAN;
    v_full_name VARCHAR(150);
    v_email VARCHAR(150);
    v_student_id VARCHAR(50);
BEGIN
    v_is_anon := COALESCE(NEW.is_anonymous, FALSE) OR (NULLIF(TRIM(COALESCE(NEW.email, '')), '') IS NULL);

    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF v_role NOT IN ('student', 'office_head', 'dept_admin', 'staff', 'officer') THEN
        v_role := 'student';
    END IF;

    BEGIN
        v_dept_id := NULLIF(NEW.raw_user_meta_data->>'department_id', '')::UUID;
        IF v_dept_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_dept_id) THEN
            v_dept_id := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_dept_id := NULL;
    END;

    v_full_name := LEFT(
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            'Anonymous Student'
        ),
        150
    );

    v_email := LEFT(
        COALESCE(
            NULLIF(LOWER(TRIM(COALESCE(NEW.email, ''))), ''),
            'anon-' || LOWER(REPLACE(NEW.id::TEXT, '-', '')) || '@anonymous.baust.edu.bd'
        ),
        150
    );

    v_student_id := LEFT(
        COALESCE(
            NULLIF(UPPER(TRIM(NEW.raw_user_meta_data->>'student_or_emp_id')), ''),
            CASE
                WHEN v_is_anon THEN 'ANON-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8))
                ELSE 'BAUST-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8))
            END
        ),
        50
    );

    BEGIN
        INSERT INTO public.profiles (
            id,
            full_name,
            email,
            student_or_emp_id,
            phone,
            role,
            department_id,
            avatar_url
        )
        VALUES (
            NEW.id,
            v_full_name,
            v_email,
            v_student_id,
            NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
            v_role,
            v_dept_id,
            ''
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Never abort auth.users insertion (prevent "Database error creating anonymous user");
        -- client ensureAuthenticatedProfile() will finish provisioning on session start.
        RAISE WARNING 'handle_new_user fallback triggered for user %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
