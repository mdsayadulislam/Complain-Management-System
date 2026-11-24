import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Search, LogOut, ArrowRight, UserCheck } from 'lucide-react';
import { BAUSTDepartment, UserProfile } from '../types/index.ts';
import { BAUSTAuthModal } from '../components/BAUSTAuthModal.tsx';
import { BAUSTComplaintStatsChart } from '../components/BAUSTComplaintStatsChart.tsx';

interface LoginPageProps {
  departments: BAUSTDepartment[];
  currentUser?: UserProfile | null;
  onLogout?: () => Promise<void> | void;
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  departments,
  currentUser,
  onLogout,
  onAuthSuccess,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const shouldLogout = searchParams.get('logout') === 'true';

  useEffect(() => {
    if (shouldLogout) {
      void (async () => {
        await onLogout?.();
        // Remove logout param from URL cleanly
        searchParams.delete('logout');
        setSearchParams(searchParams, { replace: true });
      })();
    }
  }, [shouldLogout, onLogout, searchParams, setSearchParams]);

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center py-4 sm:py-8 px-1 sm:px-4">
      <div className="w-full max-w-xl space-y-4 sm:space-y-5">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-emerald-800 text-[11px] font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Authenticated Session Required</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">
            Complaint Management System
          </h1>
          <p className="text-xs text-slate-500">
            Sign in with your verified credentials to submit, manage, or triage departmental grievances.
          </p>
        </div>

        {/* If user is already authenticated in this browser, show a clear banner with Sign Out / Switch Account */}
        {currentUser && !shouldLogout && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-emerald-800 font-medium block">
                  Currently signed in:
                </span>
                <strong className="text-emerald-950 font-bold block truncate">
                  {currentUser.full_name} ({currentUser.email || currentUser.student_or_emp_id})
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => void onLogout?.()}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out / Switch</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <BAUSTAuthModal
          isOpen={true}
          isStandalonePage={true}
          initialMode={initialMode}
          departments={departments}
          onAuthSuccess={(profile) => {
            onAuthSuccess?.(profile);
            navigate('/', { replace: true });
          }}
        />

        <div className="text-center">
          <Link
            to="/track"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Track an existing grievance by Tracking ID</span>
          </Link>
        </div>
      </div>

      <div className="w-full max-w-4xl mt-8 sm:mt-10">
        <BAUSTComplaintStatsChart />
      </div>
    </div>
  );
};
