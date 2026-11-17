import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { UserProfile, UserRole } from '../types/index.ts';

interface ProtectedRouteProps {
  user: UserProfile | null;
  loading: boolean;
  allowedRoles?: UserRole[];
  redirectTo?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  user,
  loading,
  allowedRoles,
  redirectTo = '/login',
  children,
}) => {
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-xs text-slate-500 font-mono">
        <div className="w-8 h-8 border-2 border-emerald-600/30 border-t-emerald-700 rounded-full animate-spin" />
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-emerald-700" />
          <span>Verifying BAUST Supabase session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (user.is_blocked) {
    return (
      <div className="max-w-lg mx-auto my-12 p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2">
        <h2 className="text-base font-bold text-rose-900">Account Suspended</h2>
        <p className="text-xs text-rose-700">
          Your BAUST grievance portal account is currently restricted. Please contact the Office of the Proctor.
        </p>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
