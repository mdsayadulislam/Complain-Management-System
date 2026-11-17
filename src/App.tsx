import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  BAUSTDepartment,
  UserProfile,
  Complaint,
  ComplaintNotification,
} from './types/index.ts';
import {
  supabase,
  isSupabaseConfigured,
  ensureAuthenticatedProfile,
  isValidUuid,
} from './lib/supabase.ts';
import { BAUST_OFFICIAL_DEPARTMENTS } from './lib/departments.ts';
import { BAUSTNavbar } from './components/BAUSTNavbar.tsx';
import { BAUSTSOSBanner } from './components/BAUSTSOSBanner.tsx';
import { BAUSTSubmitModal } from './components/BAUSTSubmitModal.tsx';
import { BAUSTComplaintDetailModal } from './components/BAUSTComplaintDetailModal.tsx';
import { BAUSTAuthModal } from './components/BAUSTAuthModal.tsx';
import { BAUSTProfileModal } from './components/BAUSTProfileModal.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { BAUSTStudentPortal } from './views/BAUSTStudentPortal.tsx';
import { BAUSTDepartmentTriage } from './views/BAUSTDepartmentTriage.tsx';
import { BAUSTPublicTracker } from './views/BAUSTPublicTracker.tsx';
import { BAUSTAnalyticsView } from './views/BAUSTAnalytics.tsx';
import { BAUSTAuditLogsView } from './views/BAUSTAuditLogs.tsx';
import { BAUSTArchitectureViewer } from './views/BAUSTArchitectureViewer.tsx';

function cleanDepartmentName(name: string): string {
  return name
    .replace(/\s*\(([A-Za-z0-9\s,&_-]+)\)\s*\(\1\)/gi, ' ($1)')
    .replace(/\s*\(([A-Za-z0-9\s]+),\s*\1\)/gi, ' ($1)');
}

interface HomeDashboardProps {
  currentUser: UserProfile;
  departments: BAUSTDepartment[];
  onSelectComplaint: (id: string) => void;
  onOpenSubmitModal: () => void;
  refreshTrigger: number;
  onCategoriesChanged: () => void;
}

const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser,
  departments,
  onSelectComplaint,
  onOpenSubmitModal,
  refreshTrigger,
  onCategoriesChanged,
}) => {
  const isStaffOrAdmin =
    currentUser.role === 'office_head' ||
    currentUser.role === 'dept_admin' ||
    currentUser.role === 'staff' ||
    currentUser.role === 'officer' ||
    currentUser.role === 'super_admin';

  if (isStaffOrAdmin) {
    return (
      <BAUSTDepartmentTriage
        currentUser={currentUser}
        departments={departments}
        onSelectComplaint={onSelectComplaint}
        refreshTrigger={refreshTrigger}
        onCategoriesChanged={onCategoriesChanged}
      />
    );
  }

  return (
    <BAUSTStudentPortal
      currentUser={currentUser}
      onSelectComplaint={onSelectComplaint}
      onOpenSubmitModal={onOpenSubmitModal}
      refreshTrigger={refreshTrigger}
    />
  );
};

export default function App() {
  const [departments, setDepartments] = useState<BAUSTDepartment[]>(BAUST_OFFICIAL_DEPARTMENTS);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [submitModalOpen, setSubmitModalOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);

  const [notifications, setNotifications] = useState<ComplaintNotification[]>([]);
  const [activeSosComplaint, setActiveSosComplaint] = useState<Complaint | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [categoryRefreshKey, setCategoryRefreshKey] = useState<number>(0);

  // Load BAUST Departments catalog from Supabase (with static official catalog fallback)
  const loadDepartments = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id, code, name, head_title, email, category_tags')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        const cleaned = (data as BAUSTDepartment[]).map((d) => ({
          ...d,
          name: cleanDepartmentName(d.name),
        }));
        setDepartments(cleaned);
      }
    } catch (err) {
      console.error('Failed to fetch BAUST departments:', err);
    }
  }, []);

  // BUG 1: Real Supabase Auth session bootstrap & state listener (Zero Demo/Mock Bypass)
  useEffect(() => {
    void loadDepartments();

    if (!isSupabaseConfigured) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const syncSession = async (authUser: import('@supabase/supabase-js').User | null) => {
      if (!authUser) {
        if (mounted) {
          setCurrentUser(null);
          setAuthError(null);
          setNotifications([]);
          setActiveSosComplaint(null);
          setLoading(false);
        }
        return;
      }

      if (mounted) setLoading(true);
      const { profile, error } = await ensureAuthenticatedProfile(authUser);
      if (mounted) {
        if (profile && profile.department_name) {
          profile.department_name = cleanDepartmentName(profile.department_name);
        }
        setCurrentUser(profile);
        setAuthError(error);
        if (profile) {
          setAuthModalOpen(false);
        }
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncSession(session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session?.user || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadDepartments]);

  // Re-load live Supabase department UUIDs once a user authenticates (in case anon read failed)
  useEffect(() => {
    if (currentUser) {
      void loadDepartments();
    }
  }, [currentUser, loadDepartments]);

  const fetchActiveSOS = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUser) {
      setActiveSosComplaint(null);
      return;
    }

    try {
      let query = supabase
        .from('complaints')
        .select('*, dept:department_id (code, name)')
        .eq('is_sos', true)
        .not('status', 'in', '(resolved,closed)')
        .order('created_at', { ascending: false })
        .limit(1);

      if (currentUser.role === 'student') {
        query = query.eq('user_id', currentUser.id);
      } else if (currentUser.role !== 'super_admin' && isValidUuid(currentUser.department_id)) {
        query = query.eq('department_id', currentUser.department_id);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        const row: any = data[0];
        const deptObj = Array.isArray(row.dept) ? row.dept[0] : row.dept;
        setActiveSosComplaint({
          ...row,
          department_code: deptObj?.code || '',
          department_name: deptObj?.name || '',
        } as Complaint);
      } else {
        setActiveSosComplaint(null);
      }
    } catch {
      setActiveSosComplaint(null);
    }
  }, [currentUser]);

  // Real-time SOS & grievance updates via Supabase Realtime
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser) return;

    void fetchActiveSOS();

    const channel = supabase
      .channel(`baust-complaints-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'complaints' },
        (payload) => {
          const record: any = payload.new || payload.old;
          if (record) {
            const isRelevant =
              currentUser.role === 'super_admin' ||
              record.user_id === currentUser.id ||
              (currentUser.department_id && record.department_id === currentUser.department_id);

            if (isRelevant) {
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const text =
                  payload.eventType === 'INSERT'
                    ? `${record.is_sos ? 'CRITICAL SOS: ' : 'New grievance: '}${record.subject || record.tracking_id}`
                    : `Updated ${record.tracking_id} (${String(record.status || '').replace('_', ' ')})`;

                setNotifications((prev) => [
                  {
                    id: `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    user_id: currentUser.id,
                    complaint_id: record.id,
                    tracking_id: record.tracking_id || '',
                    text,
                    type: record.is_sos ? 'sos_alert' : 'status_change',
                    is_read: false,
                    created_at: new Date().toISOString(),
                  },
                  ...prev.slice(0, 19),
                ]);
              }
              void fetchActiveSOS();
              setRefreshTrigger((prev) => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser, fetchActiveSOS]);

  const handleAuthSuccess = (profile: UserProfile) => {
    if (profile.department_name) {
      profile.department_name = cleanDepartmentName(profile.department_name);
    }
    setCurrentUser(profile);
    setAuthError(null);
    setAuthModalOpen(false);
    setLoading(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setAuthError(null);
    setNotifications([]);
    setActiveSosComplaint(null);
  };

  const handleProfileUpdated = (updatedUser: UserProfile) => {
    setCurrentUser(updatedUser);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const handleComplaintSubmitted = (complaint: Complaint) => {
    if (complaint.is_sos) {
      setActiveSosComplaint(complaint);
    }
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 antialiased selection:bg-emerald-600 selection:text-white">
        {/* Emergency SOS Banner */}
        <BAUSTSOSBanner
          sosComplaint={activeSosComplaint}
          onTriageClick={(c) => setSelectedComplaintId(c.id)}
        />

        {/* Navbar (No Demo Persona Switcher) */}
        <BAUSTNavbar
          currentUser={currentUser}
          onLogout={() => void handleLogout()}
          onOpenAuthModal={(mode) => {
            setAuthModalMode(mode);
            setAuthModalOpen(true);
          }}
          onOpenSubmitModal={() => {
            if (!currentUser) {
              setAuthModalMode('login');
              setAuthModalOpen(true);
            } else {
              setSubmitModalOpen(true);
            }
          }}
          onOpenProfileModal={() => setProfileModalOpen(true)}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onSelectComplaintFromNotif={(id) => setSelectedComplaintId(id)}
        />

        {/* Main Viewport with Strict Protected Routes & SPA Fallback (BUG 1 & BUG 2) */}
        <main className="flex-1 py-4 sm:py-8 px-3 sm:px-6 lg:px-8">
          {authError && (
            <div className="max-w-xl mx-auto mb-5 p-4 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 space-y-2.5 shadow-xs">
              <div>
                <strong className="block font-bold text-rose-950 mb-0.5">Session Profile Error</strong>
                <span className="leading-relaxed">{authError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 font-semibold rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
          <Routes>
            <Route
              path="/login"
              element={
                !loading && currentUser ? (
                  <Navigate to="/" replace />
                ) : (
                  <LoginPage
                    departments={departments}
                    onAuthSuccess={handleAuthSuccess}
                  />
                )
              }
            />

            <Route
              path="/track"
              element={<BAUSTPublicTracker currentUser={currentUser} />}
            />

            <Route element={<ProtectedRoute user={currentUser} loading={loading} />}>
              <Route
                path="/"
                element={
                  currentUser ? (
                    <HomeDashboard
                      currentUser={currentUser}
                      departments={departments}
                      onSelectComplaint={(id) => setSelectedComplaintId(id)}
                      onOpenSubmitModal={() => setSubmitModalOpen(true)}
                      refreshTrigger={refreshTrigger}
                      onCategoriesChanged={() => setCategoryRefreshKey((k) => k + 1)}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />

              <Route
                path="/student"
                element={
                  currentUser ? (
                    <BAUSTStudentPortal
                      currentUser={currentUser}
                      onSelectComplaint={(id) => setSelectedComplaintId(id)}
                      onOpenSubmitModal={() => setSubmitModalOpen(true)}
                      refreshTrigger={refreshTrigger}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />

              <Route
                path="/triage"
                element={
                  <ProtectedRoute
                    user={currentUser}
                    loading={loading}
                    allowedRoles={['office_head', 'dept_admin', 'staff', 'officer', 'super_admin']}
                  >
                    {currentUser && (
                      <BAUSTDepartmentTriage
                        currentUser={currentUser}
                        departments={departments}
                        onSelectComplaint={(id) => setSelectedComplaintId(id)}
                        refreshTrigger={refreshTrigger}
                        onCategoriesChanged={() => setCategoryRefreshKey((k) => k + 1)}
                      />
                    )}
                  </ProtectedRoute>
                }
              />

              <Route
                path="/analytics"
                element={
                  <ProtectedRoute
                    user={currentUser}
                    loading={loading}
                    allowedRoles={['office_head', 'dept_admin', 'staff', 'officer', 'super_admin']}
                  >
                    <BAUSTAnalyticsView departments={departments} currentUser={currentUser} />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/audit"
                element={
                  <ProtectedRoute
                    user={currentUser}
                    loading={loading}
                    allowedRoles={['super_admin']}
                  >
                    <BAUSTAuditLogsView />
                  </ProtectedRoute>
                }
              />

              <Route path="/architecture" element={<BAUSTArchitectureViewer />} />
            </Route>

            {/* Fallback catches deep-links/unknown routes cleanly */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Authentication Modal (Email/Password Sign In & Sign Up) */}
        <BAUSTAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          departments={departments}
          initialMode={authModalMode}
          onAuthSuccess={handleAuthSuccess}
        />

        {/* Submission Modal */}
        {currentUser && (
          <BAUSTSubmitModal
            isOpen={submitModalOpen}
            onClose={() => setSubmitModalOpen(false)}
            departments={departments}
            currentUser={currentUser}
            onSuccess={handleComplaintSubmitted}
            categoryRefreshKey={categoryRefreshKey}
          />
        )}

        {/* Detail Drawer, Atomic Status Transition RPC, Forwarding & Live Chat */}
        {currentUser && (
          <BAUSTComplaintDetailModal
            complaintId={selectedComplaintId}
            isOpen={Boolean(selectedComplaintId)}
            onClose={() => setSelectedComplaintId(null)}
            currentUser={currentUser}
            departments={departments}
            onRefresh={() => {
              setRefreshTrigger((prev) => prev + 1);
              void fetchActiveSOS();
            }}
          />
        )}

        {/* Self-Service Profile Management Modal */}
        {currentUser && (
          <BAUSTProfileModal
            isOpen={profileModalOpen}
            onClose={() => setProfileModalOpen(false)}
            currentUser={currentUser}
            departments={departments}
            onProfileUpdated={handleProfileUpdated}
          />
        )}

        {/* Institutional Footer (hidden in mobile responsive mode) */}
        <footer className="hidden md:block bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-5 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">BAUST</span>
              <span>·</span>
              <span>Bangladesh Army University of Science and Technology</span>
              <span>·</span>
              <span className="text-slate-500">Office of the Proctor & Student Affairs</span>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Department-Level Routing Engine · Supabase Auth & RLS Active
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
