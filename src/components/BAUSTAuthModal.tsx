import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Lock,
  Mail,
  Building2,
  AlertCircle,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Shield,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  BAUSTDepartment,
  UserProfile,
  UserRole,
  formatDepartmentDisplayName,
} from '../types/index.ts';
import {
  supabase,
  isSupabaseConfigured,
  ensureAuthenticatedProfile,
  resolveDepartmentUuid,
} from '../lib/supabase.ts';

interface BAUSTAuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  departments: BAUSTDepartment[];
  onAuthSuccess?: (profile: UserProfile) => void;
  initialMode?: 'login' | 'register';
  isStandalonePage?: boolean;
}

export const BAUSTAuthModal: React.FC<BAUSTAuthModalProps> = ({
  isOpen,
  onClose,
  departments,
  onAuthSuccess,
  initialMode = 'login',
  isStandalonePage = false,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setEmailNotConfirmedError(false);
    setAnonDbTriggerError(false);
  }, [initialMode]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [studentOrEmpId, setStudentOrEmpId] = useState('');
  const [studentIdBlurred, setStudentIdBlurred] = useState(false);
  const studentIdInputRef = useRef<HTMLInputElement>(null);
  const [facultyDeptCode, setFacultyDeptCode] = useState(
    departments.find((d) => d.code === 'CSE')?.code || departments[0]?.code || 'CSE'
  );
  const [facultyCustomId, setFacultyCustomId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [departmentId, setDepartmentId] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [anonDbTriggerError, setAnonDbTriggerError] = useState(false);
  const [emailNotConfirmedError, setEmailNotConfirmedError] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState('');
  const [copiedSqlFix, setCopiedSqlFix] = useState(false);
  const [copiedConfirmSql, setCopiedConfirmSql] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [anonLoading, setAnonLoading] = useState(false);

  useEffect(() => {
    if (!departmentId || departments.length === 0) return;
    if (!departments.some((d) => d.id === departmentId)) {
      const codeGuess = departmentId.replace(/^dept-/i, '').toUpperCase();
      const matched = departments.find((d) => d.code.toUpperCase() === codeGuess);
      if (matched) {
        setDepartmentId(matched.id);
      }
    }
  }, [departments, departmentId]);

  if (!isOpen && !isStandalonePage) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnonDbTriggerError(false);
    setEmailNotConfirmedError(false);
    setInfoMessage(null);

    if (!loginEmail.trim() || !loginPassword) {
      setError('Please enter your institutional email and password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError(
        'Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = loginEmail.trim().toLowerCase();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: loginPassword,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setEmailNotConfirmedError(true);
          setPendingConfirmEmail(normalizedEmail);
          throw new Error(
            'Your email address has not been confirmed yet. Check your inbox/spam for the verification link, resend the email below, or run the SQL snippet in Supabase SQL Editor.'
          );
        }
        throw new Error(signInError.message);
      }

      if (!signInData.user) {
        throw new Error('Authentication succeeded, but no user session was returned.');
      }

      const { profile, error: profileError } = await ensureAuthenticatedProfile(signInData.user);
      if (!profile) {
        throw new Error(
          profileError ||
            'Unable to load your BAUST user profile. Please verify Supabase schema & RLS setup.'
        );
      }

      onAuthSuccess?.(profile);
      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setError(null);
    setAnonDbTriggerError(false);
    setEmailNotConfirmedError(false);
    setInfoMessage(null);

    if (!isSupabaseConfigured) {
      setError(
        'Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
      return;
    }

    setAnonLoading(true);
    try {
      const { data, error: anonError } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            full_name: 'Anonymous Student',
            role: 'student',
          },
        },
      });

      if (anonError) {
        const lower = anonError.message.toLowerCase();
        if (lower.includes('anonymous sign-ins are disabled')) {
          throw new Error(
            'Anonymous sign-ins are disabled in Supabase. Enable "Allow anonymous sign-ins" in Supabase Dashboard → Authentication → Settings.'
          );
        }
        if (lower.includes('database error creating anonymous user') || lower.includes('database error')) {
          setAnonDbTriggerError(true);
          throw new Error(
            'Database trigger error creating anonymous user: Run the updated anonymous-safe handle_new_user() trigger in your Supabase SQL Editor (click "Copy SQL Fix" below and run it in Supabase SQL Editor).'
          );
        }
        throw new Error(anonError.message);
      }

      if (!data.user) {
        throw new Error('Anonymous session succeeded, but no user record was returned.');
      }

      const { profile, error: profileError } = await ensureAuthenticatedProfile(data.user);
      if (!profile) {
        throw new Error(
          profileError ||
            'Unable to initialize anonymous student profile. Please verify Supabase schema & RLS setup.'
        );
      }

      onAuthSuccess?.(profile);
      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Anonymous sign-in failed.');
    } finally {
      setAnonLoading(false);
    }
  };

  const anonTriggerFixSql = `ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_role TEXT; v_dept_id UUID; v_is_anon BOOLEAN;
    v_full_name VARCHAR(150); v_email VARCHAR(150); v_student_id VARCHAR(50);
BEGIN
    v_is_anon := COALESCE(NEW.is_anonymous, FALSE) OR (NULLIF(TRIM(COALESCE(NEW.email, '')), '') IS NULL);
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF v_role NOT IN ('student', 'office_head', 'dept_admin', 'staff', 'officer') THEN v_role := 'student'; END IF;
    BEGIN
        v_dept_id := NULLIF(NEW.raw_user_meta_data->>'department_id', '')::UUID;
        IF v_dept_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_dept_id) THEN v_dept_id := NULL; END IF;
    EXCEPTION WHEN OTHERS THEN v_dept_id := NULL; END;
    v_full_name := LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Anonymous Student'), 150);
    v_email := LEFT(COALESCE(NULLIF(LOWER(TRIM(COALESCE(NEW.email, ''))), ''), 'anon-' || LOWER(REPLACE(NEW.id::TEXT, '-', '')) || '@anonymous.baust.edu.bd'), 150);
    v_student_id := LEFT(COALESCE(NULLIF(UPPER(TRIM(NEW.raw_user_meta_data->>'student_or_emp_id')), ''), CASE WHEN v_is_anon THEN 'ANON-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8)) ELSE 'BAUST-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8)) END), 50);
    BEGIN
        INSERT INTO public.profiles (id, full_name, email, student_or_emp_id, phone, role, department_id, avatar_url)
        VALUES (NEW.id, v_full_name, v_email, v_student_id, NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), v_role, v_dept_id, '')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user fallback for %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`;

  const confirmEmailSql = `-- Confirm pending user(s) in Supabase Auth SQL Editor
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL${
    (pendingConfirmEmail || loginEmail.trim())
      ? `\n   OR LOWER(email) = LOWER('${(pendingConfirmEmail || loginEmail.trim()).replace(/'/g, "''")}')`
      : ''
  };`;

  const handleResendConfirmation = async () => {
    const targetEmail = (pendingConfirmEmail || loginEmail).trim().toLowerCase();
    if (!targetEmail) {
      setError('Enter your email address first so we know where to resend the verification link.');
      return;
    }
    setResendingEmail(true);
    setError(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (resendError) {
        throw new Error(resendError.message);
      }
      setEmailNotConfirmedError(false);
      setInfoMessage(
        `Verification email resent to ${targetEmail}. Please check your inbox and spam folder, then click the confirmation link.`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleFacultyDeptCodeChange = (code: string) => {
    setFacultyDeptCode(code);
    const matched = departments.find((d) => d.code === code);
    if (matched) {
      setDepartmentId(matched.id);
    }
  };

  const handleDepartmentSelectChange = (deptId: string) => {
    setDepartmentId(deptId);
    const matched = departments.find((d) => d.id === deptId);
    if (matched) {
      setFacultyDeptCode(matched.code);
    }
  };

  const handleSelectRole = (nextRole: UserRole) => {
    setRole(nextRole);
    if (nextRole !== 'student') {
      const currentMatch = departments.find((d) => d.id === departmentId);
      const targetDept =
        currentMatch ||
        departments.find((d) => d.code === facultyDeptCode) ||
        departments[0];
      if (targetDept) {
        setFacultyDeptCode(targetDept.code);
        setDepartmentId(targetDept.id);
      }
    }
  };

  const trimmedStudentDigits = studentOrEmpId.replace(/\D/g, '');
  const isStudentIdInvalid =
    trimmedStudentDigits.length > 0 &&
    (trimmedStudentDigits.length < 4
      ? studentIdBlurred || !'0802'.startsWith(trimmedStudentDigits)
      : !trimmedStudentDigits.startsWith('0802') ||
        (studentIdBlurred && trimmedStudentDigits.length <= 4));

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnonDbTriggerError(false);
    setEmailNotConfirmedError(false);
    setInfoMessage(null);

    if (role === 'student') {
      if (!trimmedStudentDigits.startsWith('0802') || trimmedStudentDigits.length <= 4) {
        setStudentIdBlurred(true);
        studentIdInputRef.current?.focus();
        return;
      }
    }

    const trimmedCustomFacultyId = facultyCustomId.trim().replace(/^-+/, '').toUpperCase();
    const effectiveId =
      role === 'student'
        ? `BAUST-${trimmedStudentDigits}`
        : trimmedCustomFacultyId && facultyDeptCode
        ? `FAC-${facultyDeptCode.toUpperCase()}-${trimmedCustomFacultyId}`
        : '';

    if (!fullName.trim() || !email.trim() || !effectiveId || !registerPassword) {
      setError(
        role === 'student'
          ? 'All required fields must be completed.'
          : 'Please complete all required fields, select your department code, and enter your faculty/employee ID.'
      );
      return;
    }

    if (registerPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (registerPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (role === 'student' && !departmentId) {
      setError('Please select your department.');
      return;
    }

    if (role !== 'student' && !departmentId && !facultyDeptCode) {
      setError('Department selection is mandatory for teachers, office heads, and admins.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError(
        'Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();
      const cleanId = effectiveId;
      const selectedDept =
        departments.find((d) => d.id === departmentId) ||
        (role !== 'student' ? departments.find((d) => d.code === facultyDeptCode) : undefined);
      const selectedDeptCode =
        selectedDept?.code || (role !== 'student' ? facultyDeptCode : '') || null;

      let resolvedDeptId = await resolveDepartmentUuid(
        departmentId || selectedDeptCode,
        departments
      );

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: registerPassword,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          data: {
            full_name: cleanName,
            student_or_emp_id: cleanId,
            phone: phone.trim(),
            role,
            department_id: resolvedDeptId,
            department_code: selectedDeptCode,
          },
        },
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (signUpData.user && signUpData.session) {
        // Re-resolve as an authenticated user in case public.departments RLS blocks anon SELECT
        if (!resolvedDeptId && (departmentId || selectedDeptCode)) {
          resolvedDeptId = await resolveDepartmentUuid(
            departmentId || selectedDeptCode,
            departments
          );
        }

        let { error: upsertError } = await supabase.from('profiles').upsert(
          {
            id: signUpData.user.id,
            full_name: cleanName,
            email: cleanEmail,
            student_or_emp_id: cleanId,
            phone: phone.trim() || null,
            role,
            department_id: resolvedDeptId,
            avatar_url: '',
          },
          { onConflict: 'id' }
        );

        if (
          upsertError &&
          (upsertError.code === '23505' ||
            upsertError.message.toLowerCase().includes('student_or_emp_id'))
        ) {
          const uniqueSuffix = signUpData.user.id.replace(/-/g, '').slice(0, 6).toUpperCase();
          const collisionSafeId = `${cleanId.slice(0, 42)}-${uniqueSuffix}`;
          const retryRes = await supabase.from('profiles').upsert(
            {
              id: signUpData.user.id,
              full_name: cleanName,
              email: cleanEmail,
              student_or_emp_id: collisionSafeId,
              phone: phone.trim() || null,
              role,
              department_id: resolvedDeptId,
              avatar_url: '',
            },
            { onConflict: 'id' }
          );
          upsertError = retryRes.error;
        }

        if (upsertError) {
          throw new Error(`Account created, but profile save failed: ${upsertError.message}`);
        }

        const { profile, error: profileError } = await ensureAuthenticatedProfile(signUpData.user);
        if (!profile) {
          throw new Error(profileError || 'Account created, but profile could not be loaded.');
        }

        onAuthSuccess?.(profile);
        onClose?.();
      } else {
        setPendingConfirmEmail(cleanEmail);
        setInfoMessage(
          `Account created for ${cleanEmail}! Check your inbox to confirm your email, or confirm the user in Supabase Dashboard → Authentication → Users.`
        );
        setLoginEmail(cleanEmail);
        setMode('login');
      }
    } catch (err: any) {
      setError(err.message || 'Registration error.');
    } finally {
      setLoading(false);
    }
  };

  const cardContent = (
    <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col text-slate-800">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 sm:p-6 relative">
        {!isStandalonePage && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="hidden md:flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white text-sm shadow-md border border-emerald-400/40">
            BAUST
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white leading-tight">
              BAUST Portal Authentication
            </h2>
            <p className="text-xs text-emerald-400">
              Bangladesh Army University of Science and Technology
            </p>
          </div>
        </div>

        <div className="md:hidden pr-8">
          <h2 className="text-base font-bold tracking-tight text-white leading-tight">
            Portal Authentication
          </h2>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-800 p-1 rounded-xl mt-3 md:mt-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setEmailNotConfirmedError(false);
              setAnonDbTriggerError(false);
            }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setEmailNotConfirmedError(false);
              setAnonDbTriggerError(false);
            }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 overflow-y-auto max-h-[75vh]">
        {!isSupabaseConfigured && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <strong>Configuration Required:</strong> Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in your environment to enable live authentication.
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-800">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
            {pendingConfirmEmail && (
              <div className="pl-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleResendConfirmation()}
                  disabled={resendingEmail}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-[11px] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${resendingEmail ? 'animate-spin' : ''}`} />
                  <span>{resendingEmail ? 'Resending...' : 'Resend Email'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(confirmEmailSql);
                    setCopiedConfirmSql(true);
                    setTimeout(() => setCopiedConfirmSql(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedConfirmSql ? 'SQL Copied!' : 'Copy Confirm SQL'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-800">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {emailNotConfirmedError && (
              <div className="pl-6 space-y-2.5">
                <div className="p-2.5 bg-white/90 border border-rose-200 rounded-lg text-[11px] text-slate-700 space-y-1.5">
                  <p className="font-semibold text-slate-900">
                    How to confirm this account in Supabase (pick one):
                  </p>
                  <p>
                    1. <strong>Fastest:</strong> Open{' '}
                    <span className="font-semibold">
                      Supabase Dashboard → Authentication → Providers → Email
                    </span>{' '}
                    and turn <strong>OFF &ldquo;Confirm email&rdquo;</strong>, then confirm the user under{' '}
                    <span className="font-semibold">Authentication → Users</span>.
                  </p>
                  <p>
                    2. <strong>Or run in Supabase SQL Editor:</strong>
                  </p>
                  <pre className="p-2 bg-slate-900 text-emerald-300 rounded-md overflow-x-auto text-[10px] font-mono select-all whitespace-pre-wrap">
                    {confirmEmailSql}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResendConfirmation()}
                    disabled={resendingEmail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-[11px] transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resendingEmail ? 'animate-spin' : ''}`} />
                    <span>{resendingEmail ? 'Resending...' : 'Resend Verification Email'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(confirmEmailSql);
                      setCopiedConfirmSql(true);
                      setTimeout(() => setCopiedConfirmSql(false), 2500);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedConfirmSql ? 'Confirm SQL Copied!' : 'Copy SQL to Confirm User'}</span>
                  </button>
                </div>
              </div>
            )}
            {anonDbTriggerError && (
              <div className="pl-6">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(anonTriggerFixSql);
                    setCopiedSqlFix(true);
                    setTimeout(() => setCopiedSqlFix(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSqlFix ? 'SQL Fix Copied!' : 'Copy SQL Fix for Supabase'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address (e.g. name@baust.edu.bd) *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@baust.edu.bd"
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || anonLoading}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Signing in...' : 'Sign In to Dashboard'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Or Anonymous Access
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void handleAnonymousLogin()}
                disabled={loading || anonLoading}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-800 shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {anonLoading
                    ? 'Starting Anonymous Session...'
                    : 'Continue Anonymously (Supabase Guest)'}
                </span>
              </button>
              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                Submits and tracks grievances via a private anonymous Supabase Auth session without
                providing an email or password.
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleRegisterSubmit(e)} className="space-y-4">
            {/* Role Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Account Role *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectRole('student')}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                    role === 'student'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="block font-bold">Student</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Submit & track complaints
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('office_head')}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                    role === 'office_head'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="block font-bold">Teacher / Office Head / Admin</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Department triage & forwarding
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Md. Mahmudul Hasan"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {role === 'student' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Student ID *
                  </label>
                  <div className="flex items-stretch gap-1.5 font-mono text-xs">
                    <span className="px-2.5 sm:px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-700 flex items-center select-none shrink-0">
                      BAUST
                    </span>
                    <span className="flex items-center text-slate-400 font-bold select-none">-</span>
                    <input
                      ref={studentIdInputRef}
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={16}
                      value={studentOrEmpId}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '');
                        setStudentOrEmpId(digitsOnly);
                        if (digitsOnly.length === 0 || '0802'.startsWith(digitsOnly) || digitsOnly.startsWith('0802')) {
                          setStudentIdBlurred(false);
                        }
                      }}
                      onBlur={() => {
                        if (studentOrEmpId.length > 0) {
                          setStudentIdBlurred(true);
                        }
                      }}
                      placeholder="0802420405101103"
                      aria-label="Student ID"
                      aria-invalid={isStudentIdInvalid}
                      className={`flex-1 min-w-0 px-3 py-2 text-xs border rounded-lg outline-none font-mono transition-colors ${
                        isStudentIdInvalid
                          ? 'border-rose-500 text-rose-600 bg-rose-50/40 focus:ring-2 focus:ring-rose-500 focus:border-rose-500'
                          : 'border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1700-000000"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Employee / Faculty ID (FAC - Department - ID) *
                  </label>
                  <div className="flex items-stretch gap-1.5 font-mono text-xs">
                    <span className="px-2.5 sm:px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-700 flex items-center select-none shrink-0">
                      FAC
                    </span>
                    <span className="flex items-center text-slate-400 font-bold select-none">-</span>
                    <select
                      value={facultyDeptCode}
                      onChange={(e) => handleFacultyDeptCodeChange(e.target.value)}
                      required
                      aria-label="Faculty department code"
                      className="px-2 sm:px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shrink-0 max-w-[130px] sm:max-w-[175px]"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.code}>
                          {d.code}
                        </option>
                      ))}
                    </select>
                    <span className="flex items-center text-slate-400 font-bold select-none">-</span>
                    <input
                      type="text"
                      required
                      value={facultyCustomId}
                      onChange={(e) => setFacultyCustomId(e.target.value)}
                      placeholder="012"
                      aria-label="Custom faculty or employee ID"
                      className="flex-1 min-w-[70px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    Full ID:{' '}
                    <strong className="text-emerald-700">
                      FAC-{facultyDeptCode || 'DEPT'}-
                      {facultyCustomId.trim().replace(/^-+/, '').toUpperCase() || 'ID'}
                    </strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1700-000000"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address (e.g. name@baust.edu.bd) *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@baust.edu.bd"
                autoComplete="email"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              {role !== 'student' && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Register with your own <span className="font-mono">name@baust.edu.bd</span> (or any valid email) — no fixed department-head email is required.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {role === 'student'
                  ? 'Student Department *'
                  : 'Teacher / Office Department *'}
              </label>
              <select
                value={departmentId}
                onChange={(e) => handleDepartmentSelectChange(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
              >
                <option value="">-- Select Department or Office --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDepartmentDisplayName(d)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Creating account...' : 'Register & Continue'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );

  if (isStandalonePage) {
    return cardContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="my-6 w-full max-w-xl">{cardContent}</div>
    </div>
  );
};
