import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Search } from 'lucide-react';
import { BAUSTDepartment, UserProfile } from '../types/index.ts';
import { BAUSTAuthModal } from '../components/BAUSTAuthModal.tsx';
import { BAUSTComplaintStatsChart } from '../components/BAUSTComplaintStatsChart.tsx';

interface LoginPageProps {
  departments: BAUSTDepartment[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ departments, onAuthSuccess }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

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
