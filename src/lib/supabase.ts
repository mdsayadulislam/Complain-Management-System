import { createClient, SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { BAUSTDepartment, UserProfile, UserRole } from '../types/index.ts';

declare global {
  interface Window {
    __BAUST_ENV__?: {
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
    };
  }
}

const runtimeEnv = typeof window !== 'undefined' ? window.__BAUST_ENV__ : undefined;

const supabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  runtimeEnv?.VITE_SUPABASE_URL ||
  ''
).trim();

const supabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  runtimeEnv?.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseUrl.includes('placeholder.supabase.co');

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value?: string | null): value is string {
  return Boolean(value && UUID_REGEX.test(value.trim()));
}

const DEPT_SLUG_TO_CODE: Record<string, string> = {
  as: 'ARTS_SCIENCE',
  arts_science: 'ARTS_SCIENCE',
  exam: 'EXAM_CONTROLLER',
  exam_controller: 'EXAM_CONTROLLER',
};

/**
 * Resolves a selected department value (either a real UUID, a department code like "CE",
 * or a static fallback ID like "dept-ce") into a valid Supabase `public.departments.id` UUID.
 * Returns null if unresolved.
 */
export async function resolveDepartmentUuid(
  selectedIdOrCode?: string | null,
  departments: BAUSTDepartment[] = []
): Promise<string | null> {
  if (!selectedIdOrCode) return null;
  const trimmed = selectedIdOrCode.trim();
  if (UUID_REGEX.test(trimmed)) return trimmed;

  if (!isSupabaseConfigured) return null;

  const trimmedLower = trimmed.toLowerCase();
  const strippedLower = trimmed.replace(/^dept-/i, '').toLowerCase();
  const matched = departments.find(
    (d) =>
      d.id === trimmed ||
      d.code.toLowerCase() === trimmedLower ||
      d.code.toLowerCase() === strippedLower
  );

  const codeToLookup =
    matched?.code ||
    DEPT_SLUG_TO_CODE[strippedLower] ||
    trimmed.replace(/^dept-/i, '').toUpperCase();
  if (!codeToLookup) return null;

  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id')
      .ilike('code', codeToLookup)
      .maybeSingle();

    if (!error && data?.id && isValidUuid(data.id)) {
      return data.id;
    }
  } catch {
    // ignore lookup error
  }

  return null;
}

export interface ProfileLookupResult {
  profile: UserProfile | null;
  error: string | null;
}

async function hydrateDepartmentFields(
  departmentId: string | null
): Promise<{ code?: string; name?: string }> {
  if (!departmentId || !isValidUuid(departmentId)) return {};
  try {
    const { data } = await supabase
      .from('departments')
      .select('code, name')
      .eq('id', departmentId)
      .maybeSingle();
    return {
      code: data?.code || undefined,
      name: data?.name || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Fetches the authenticated user's profile from `public.profiles`.
 * If no profile row exists yet (e.g. created via Supabase Auth before trigger setup),
 * automatically provisions one from auth user metadata.
 */
export async function ensureAuthenticatedProfile(
  authUser: SupabaseAuthUser
): Promise<ProfileLookupResult> {
  if (!isSupabaseConfigured) {
    return {
      profile: null,
      error: 'Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, student_or_emp_id, phone, role, department_id, is_blocked, avatar_url, created_at'
    )
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) {
    if (error.code === '42P17') {
      return {
        profile: null,
        error:
          'Database RLS policy recursion detected on public.profiles (42P17). Please run the latest supabase/fixes.sql in your Supabase SQL Editor.',
      };
    }
    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.message.toLowerCase().includes('schema cache') ||
      error.message.toLowerCase().includes('does not exist')
    ) {
      return {
        profile: null,
        error:
          'Supabase database tables are not initialized yet (missing public.profiles). Open your Supabase Dashboard -> SQL Editor, run supabase/schema.sql followed by supabase/fixes.sql, then click Retry.',
      };
    }
    return {
      profile: null,
      error: `Failed to load user profile: ${error.message}`,
    };
  }

  let profileRow = data;

  // Auto-provision missing profile row on first login (including Supabase anonymous auth users)
  if (!profileRow) {
    const meta = (authUser.user_metadata || {}) as Record<string, any>;
    const isAnonymousUser = Boolean((authUser as { is_anonymous?: boolean }).is_anonymous) || !authUser.email;
    const rawRole = String(meta.role || 'student');
    const safeRole: UserRole = (
      ['student', 'office_head', 'dept_admin', 'staff', 'officer'].includes(rawRole)
        ? rawRole
        : 'student'
    ) as UserRole;
    const rawDeptId = typeof meta.department_id === 'string' ? meta.department_id : null;
    let safeDeptId = isValidUuid(rawDeptId) ? rawDeptId : null;
    if (!safeDeptId) {
      const deptCodeHint =
        (typeof meta.department_code === 'string' && meta.department_code.trim()) ||
        (typeof meta.student_or_emp_id === 'string' && meta.student_or_emp_id.startsWith('FAC-')
          ? meta.student_or_emp_id.split('-')[1]
          : '');
      if (deptCodeHint) {
        safeDeptId = await resolveDepartmentUuid(deptCodeHint);
      }
    }
    const fallbackEmail = authUser.email
      ? authUser.email.toLowerCase()
      : `anon-${authUser.id.slice(0, 12).toLowerCase()}@anonymous.baust.edu.bd`;
    const fallbackName =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (isAnonymousUser
        ? 'Anonymous Student'
        : authUser.email
        ? authUser.email.split('@')[0]
        : 'BAUST User');
    const fallbackId =
      (typeof meta.student_or_emp_id === 'string' && meta.student_or_emp_id.trim().toUpperCase()) ||
      (isAnonymousUser
        ? `ANON-${authUser.id.slice(0, 8).toUpperCase()}`
        : `BAUST-${authUser.id.slice(0, 8).toUpperCase()}`);

    let { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: authUser.id,
          full_name: fallbackName,
          email: fallbackEmail,
          student_or_emp_id: fallbackId,
          phone: typeof meta.phone === 'string' && meta.phone.trim() ? meta.phone.trim() : null,
          role: safeRole,
          department_id: safeDeptId,
          avatar_url: '',
        },
        { onConflict: 'id' }
      )
      .select(
        'id, full_name, email, student_or_emp_id, phone, role, department_id, is_blocked, avatar_url, created_at'
      )
      .single();

    if (
      insertError &&
      (insertError.code === '23505' ||
        insertError.message.toLowerCase().includes('student_or_emp_id'))
    ) {
      const uniqueSuffix = authUser.id.replace(/-/g, '').slice(0, 6).toUpperCase();
      const collisionSafeId = `${fallbackId.slice(0, 42)}-${uniqueSuffix}`;
      const retryRes = await supabase
        .from('profiles')
        .upsert(
          {
            id: authUser.id,
            full_name: fallbackName,
            email: fallbackEmail,
            student_or_emp_id: collisionSafeId,
            phone: typeof meta.phone === 'string' && meta.phone.trim() ? meta.phone.trim() : null,
            role: safeRole,
            department_id: safeDeptId,
            avatar_url: '',
          },
          { onConflict: 'id' }
        )
        .select(
          'id, full_name, email, student_or_emp_id, phone, role, department_id, is_blocked, avatar_url, created_at'
        )
        .single();
      inserted = retryRes.data;
      insertError = retryRes.error;
    }

    if (insertError || !inserted) {
      return {
        profile: null,
        error:
          insertError?.message ||
          'Profile record missing and auto-creation failed. Ensure supabase/fixes.sql has been executed.',
      };
    }

    profileRow = inserted;
  }

  // Auto-link department UUID if an existing profile has department_id = NULL (e.g. signed up before departments were seeded)
  if (!isValidUuid(profileRow.department_id) && profileRow.role !== 'super_admin') {
    const meta = (authUser.user_metadata || {}) as Record<string, any>;
    const rawMetaDeptId = typeof meta.department_id === 'string' ? meta.department_id : '';
    const empIdStr = String(profileRow.student_or_emp_id || meta.student_or_emp_id || '');
    const facCodeMatch = empIdStr.toUpperCase().startsWith('FAC-')
      ? empIdStr.split('-')[1] || ''
      : '';
    const deptHint =
      (isValidUuid(rawMetaDeptId) ? rawMetaDeptId : '') ||
      (typeof meta.department_code === 'string' && meta.department_code.trim()) ||
      facCodeMatch ||
      rawMetaDeptId;

    if (deptHint) {
      const healedDeptId = await resolveDepartmentUuid(deptHint);
      if (healedDeptId) {
        const { error: healError } = await supabase
          .from('profiles')
          .update({ department_id: healedDeptId })
          .eq('id', authUser.id);

        if (!healError) {
          profileRow = { ...profileRow, department_id: healedDeptId };
        }
      }
    }
  }

  const dept = await hydrateDepartmentFields(profileRow.department_id);

  return {
    profile: {
      id: profileRow.id,
      full_name: profileRow.full_name,
      email: profileRow.email,
      student_or_emp_id: profileRow.student_or_emp_id,
      phone: profileRow.phone || undefined,
      role: profileRow.role as UserRole,
      department_id: profileRow.department_id,
      department_code: dept.code,
      department_name: dept.name,
      is_blocked: Boolean(profileRow.is_blocked),
      avatar_url: profileRow.avatar_url || '',
      created_at: profileRow.created_at,
    },
    error: null,
  };
}

export async function fetchAuthenticatedProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !userId) return null;

  const { data: authData } = await supabase.auth.getUser();
  if (authData?.user && authData.user.id === userId) {
    const res = await ensureAuthenticatedProfile(authData.user);
    return res.profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, student_or_emp_id, phone, role, department_id, is_blocked, avatar_url, created_at'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  const dept = await hydrateDepartmentFields(data.department_id);

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    student_or_emp_id: data.student_or_emp_id,
    phone: data.phone || undefined,
    role: data.role as UserRole,
    department_id: data.department_id,
    department_code: dept.code,
    department_name: dept.name,
    is_blocked: Boolean(data.is_blocked),
    avatar_url: data.avatar_url || '',
    created_at: data.created_at,
  };
}
