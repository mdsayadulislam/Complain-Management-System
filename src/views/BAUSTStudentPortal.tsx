import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Shield,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Complaint, UserProfile } from '../types/index.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { BAUSTComplaintStatsChart } from '../components/BAUSTComplaintStatsChart.tsx';

interface BAUSTStudentPortalProps {
  currentUser: UserProfile;
  onSelectComplaint: (id: string) => void;
  onOpenSubmitModal: () => void;
  refreshTrigger: number;
}

export const BAUSTStudentPortal: React.FC<BAUSTStudentPortalProps> = ({
  currentUser,
  onSelectComplaint,
  onOpenSubmitModal,
  refreshTrigger,
}) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    void loadComplaints();
  }, [currentUser.id, refreshTrigger]);

  const loadComplaints = async () => {
    if (!isSupabaseConfigured) {
      setComplaints([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('complaints')
        .select(
          `
          *,
          dept:department_id (code, name)
        `
        )
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Complaint[] = data.map((row: any) => {
          const deptObj = Array.isArray(row.dept) ? row.dept[0] : row.dept;
          return {
            ...row,
            student_name: currentUser.full_name,
            student_id: currentUser.student_or_emp_id,
            student_email: currentUser.email,
            department_code: deptObj?.code || '',
            department_name: deptObj?.name || '',
          };
        });
        setComplaints(mapped);
      } else {
        setComplaints([]);
      }
    } catch (e) {
      console.error('Failed to load student complaints:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = complaints.filter((c) => {
    if (filter === 'active') {
      if (c.status === 'resolved' || c.status === 'closed') return false;
    } else if (filter === 'resolved') {
      if (c.status !== 'resolved' && c.status !== 'closed') return false;
    } else if (filter === 'sos') {
      if (!c.is_sos) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.tracking_id.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.department_name && c.department_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const activeCount = complaints.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length;
  const resolvedCount = complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
  const sosCount = complaints.filter(
    (c) => c.is_sos && c.status !== 'resolved' && c.status !== 'closed'
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Student Welcome Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Student Grievance & Tracking Portal
            </h1>
            {currentUser.department_code && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                {currentUser.department_code} Student
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complainant: <strong className="text-slate-800">{currentUser.full_name}</strong> ·{' '}
            <span className="font-mono">{currentUser.student_or_emp_id}</span>
            {currentUser.department_name ? (
              <>
                {' '}
                · <strong className="text-emerald-800">{currentUser.department_name}</strong>
              </>
            ) : null}{' '}
            · All grievances are routed directly to the designated BAUST department head.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSubmitModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors w-full sm:w-auto md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Report New Grievance / SOS</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Filed
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {complaints.length}
            </span>
            <span className="text-xs text-slate-400">Lifetime</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            In Investigation
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-blue-700 tabular-nums">
              {activeCount}
            </span>
            <span className="text-xs text-blue-600 font-medium">Department Triage</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Emergency SOS
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
              {sosCount}
            </span>
            <span className="text-xs text-rose-600 font-medium">Priority Broadcast</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Resolved Issues
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
              {resolvedCount}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Completed</span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors ${
              filter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            All ({complaints.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors ${
              filter === 'active' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('sos')}
            className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors ${
              filter === 'sos' ? 'bg-rose-100 text-rose-900 shadow-xs font-semibold' : 'text-rose-700'
            }`}
          >
            SOS Alerts ({sosCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors ${
              filter === 'resolved' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-auto sm:min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracking ID or keyword..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Complaints List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-xl">
            Querying your grievances under Row Level Security...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No grievances recorded</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                You have not filed any grievances matching this filter.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSubmitModal}
              className="px-4 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600"
            >
              Submit Your First Grievance
            </button>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelectComplaint(c.id)}
              className="p-4 sm:p-5 bg-white border border-slate-200 hover:border-emerald-600 rounded-xl cursor-pointer transition-all hover:shadow-xs group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                    {c.tracking_id}
                  </span>

                  <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
                    Target: {c.department_code}
                  </span>

                  {c.is_sos && (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded uppercase tracking-wide">
                      SOS Incident
                    </span>
                  )}

                  {c.is_anonymous && (
                    <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                      <Shield className="w-3 h-3 text-emerald-700" />
                      Anonymous
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded capitalize ${
                      c.status === 'resolved' || c.status === 'closed'
                        ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                        : c.status === 'in_progress'
                        ? 'text-amber-800 bg-amber-50 border border-amber-200'
                        : 'text-blue-800 bg-blue-50 border border-blue-200'
                    }`}
                  >
                    {c.status.replace('_', ' ')}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition-colors" />
                </div>
              </div>

              <div className="mt-3">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {c.subject}
                </h3>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                  {c.description}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-2.5 border-t border-slate-100">
                <span className="font-semibold text-slate-800">{c.department_name}</span>
                <span aria-hidden="true">·</span>
                <span>{c.category}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">Priority: {c.priority}</span>
                <span aria-hidden="true">·</span>
                <span>Submitted {new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <BAUSTComplaintStatsChart refreshTrigger={refreshTrigger} />
    </div>
  );
};
