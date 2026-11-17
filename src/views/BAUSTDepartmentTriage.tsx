import React, { useState, useEffect } from 'react';
import {
  Download,
  AlertTriangle,
  Shield,
  Search,
  RefreshCw,
  Lock,
  ArrowRightLeft,
  Inbox,
  SendHorizontal,
  Tag,
} from 'lucide-react';
import { Complaint, UserProfile, BAUSTDepartment } from '../types/index.ts';
import { supabase, isSupabaseConfigured, isValidUuid } from '../lib/supabase.ts';
import { exportComplaintsToCSV } from '../lib/departments.ts';
import { CategoryManagerModal } from '../components/CategoryManagerModal.tsx';

interface BAUSTDepartmentTriageProps {
  currentUser: UserProfile;
  departments: BAUSTDepartment[];
  onSelectComplaint: (id: string) => void;
  refreshTrigger: number;
  onCategoriesChanged?: () => void;
}

export const BAUSTDepartmentTriage: React.FC<BAUSTDepartmentTriageProps> = ({
  currentUser,
  departments,
  onSelectComplaint,
  refreshTrigger,
  onCategoriesChanged,
}) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [forwardedOutComplaints, setForwardedOutComplaints] = useState<Complaint[]>([]);
  const [queueTab, setQueueTab] = useState<'active' | 'transferred_in' | 'forwarded_out'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sosOnly, setSosOnly] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);

  const canManageCategories =
    currentUser.role === 'office_head' ||
    currentUser.role === 'dept_admin' ||
    currentUser.role === 'super_admin';

  useEffect(() => {
    void loadComplaints();
  }, [currentUser.id, currentUser.department_id, currentUser.role, refreshTrigger]);

  const mapComplaintRow = (row: any): Complaint => {
    const deptObj = Array.isArray(row.dept) ? row.dept[0] : row.dept;
    const fromDeptObj = Array.isArray(row.from_dept) ? row.from_dept[0] : row.from_dept;
    const ownerObj = Array.isArray(row.owner) ? row.owner[0] : row.owner;

    const isMasked =
      Boolean(row.is_anonymous) &&
      !row.revealed_by_admin &&
      currentUser.role !== 'super_admin';

    return {
      ...row,
      student_name: isMasked ? 'Anonymous Student' : ownerObj?.full_name || 'Student',
      student_id: isMasked ? 'BAUST-CONFIDENTIAL' : ownerObj?.student_or_emp_id || '',
      student_email: isMasked ? 'confidential@baust.edu.bd' : ownerObj?.email || '',
      department_code: deptObj?.code || '',
      department_name: deptObj?.name || '',
      forwarded_from_department_code: fromDeptObj?.code,
      forwarded_from_department_name: fromDeptObj?.name,
    };
  };

  const loadComplaints = async () => {
    if (!isSupabaseConfigured) {
      setComplaints([]);
      setForwardedOutComplaints([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let activeQuery = supabase
        .from('complaints')
        .select(
          `
          *,
          dept:department_id (code, name),
          from_dept:forwarded_from_department_id (code, name),
          owner:user_id (full_name, student_or_emp_id, email)
        `
        )
        .order('is_sos', { ascending: false })
        .order('created_at', { ascending: false });

      if (currentUser.role !== 'super_admin' && isValidUuid(currentUser.department_id)) {
        activeQuery = activeQuery.eq('department_id', currentUser.department_id);
      }

      const { data: activeRows, error: activeError } = await activeQuery;

      if (!activeError && activeRows) {
        setComplaints(activeRows.map(mapComplaintRow));
      } else {
        setComplaints([]);
      }

      if (isValidUuid(currentUser.department_id)) {
        const { data: fwdRows } = await supabase
          .from('complaints')
          .select(
            `
            *,
            dept:department_id (code, name),
            from_dept:forwarded_from_department_id (code, name),
            owner:user_id (full_name, student_or_emp_id, email)
          `
          )
          .eq('forwarded_from_department_id', currentUser.department_id)
          .order('forwarded_at', { ascending: false });

        setForwardedOutComplaints((fwdRows || []).map(mapComplaintRow));
      } else {
        setForwardedOutComplaints([]);
      }
    } catch (e) {
      console.error('Failed to load department complaints:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    exportComplaintsToCSV(
      filtered,
      `baust_${(currentUser.department_code || 'all').toLowerCase()}_complaints.csv`
    );
  };

  const baseList =
    queueTab === 'forwarded_out'
      ? forwardedOutComplaints
      : queueTab === 'transferred_in'
      ? complaints.filter((c) => Boolean(c.forwarded_from_department_id))
      : complaints;

  const filtered = baseList.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
    if (sosOnly && !c.is_sos) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.tracking_id.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.student_name && c.student_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Triage Department Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Department Triage & Resolution Console
            </h1>
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
              {currentUser.role === 'super_admin'
                ? 'SUPER ADMIN'
                : `${currentUser.department_code || 'OFFICE'} TEACHER / ADMIN`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Logged in teacher / authority: <strong className="text-slate-800">{currentUser.full_name}</strong>{' '}
            · <span className="font-mono">{currentUser.student_or_emp_id}</span> · Department:{' '}
            <strong className="text-emerald-800">
              {currentUser.department_name || 'Central Institutional Oversight (All 14 Wings)'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {canManageCategories && (
            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Manage Categories</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadComplaints()}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs transition-colors flex items-center gap-1.5"
            title="Refresh department queue"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Strict Routing Verification Badge */}
      <div className="p-4 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 text-xs flex items-start gap-3">
        <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-white block">
            Department-Level Routing & RLS Isolation Active
          </span>
          {currentUser.role === 'super_admin' ? (
            <p className="text-slate-300">
              You are authenticated as <strong>Super Administrator</strong>. Centralized monitoring access is granted to inspect complaints across all 14 BAUST departments and offices.
            </p>
          ) : isValidUuid(currentUser.department_id) ? (
            <p className="text-slate-300">
              You are authenticated as <strong>{currentUser.department_name || 'Department Authority'}</strong>. Supabase Row Level Security (RLS) isolates this queue strictly to grievances targeting{' '}
              <code className="font-mono bg-slate-800 px-1 py-0.2 rounded text-emerald-300">
                {currentUser.department_code || 'ASSIGNED_DEPT'}
              </code>
              .
            </p>
          ) : (
            <p className="text-amber-300">
              Your account is authenticated, but your Supabase <code className="font-mono">departments</code> table has not been seeded yet or your profile is awaiting department UUID linking. Run <code className="font-mono">supabase/migrations/20261120_seed_departments_and_policies.sql</code> in Supabase SQL Editor and refresh.
            </p>
          )}
        </div>
      </div>

      {/* Queue Category Sub-Tabs */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setQueueTab('active')}
          className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
            queueTab === 'active'
              ? 'bg-emerald-800 text-white border-emerald-700 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Active Department Queue</span>
          <span
            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
              queueTab === 'active' ? 'bg-emerald-950 text-emerald-200' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {complaints.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setQueueTab('transferred_in')}
          className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
            queueTab === 'transferred_in'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>Transferred In</span>
          <span
            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
              queueTab === 'transferred_in' ? 'bg-amber-800 text-amber-100' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {complaints.filter((c) => Boolean(c.forwarded_from_department_id)).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setQueueTab('forwarded_out')}
          className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
            queueTab === 'forwarded_out'
              ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <SendHorizontal className="w-3.5 h-3.5" />
          <span>Forwarded Out</span>
          <span
            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
              queueTab === 'forwarded_out' ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {forwardedOutComplaints.length}
          </span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Case Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="reopened">Reopened</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Priority Level
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Search by Keyword or Tracking ID
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tracking ID, subject, student name..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sosOnly}
              onChange={(e) => setSosOnly(e.target.checked)}
              className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300"
            />
            <span className="font-semibold text-rose-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Filter Critical Emergency SOS Only
            </span>
          </label>

          <span className="text-slate-500 font-mono text-[11px]">
            Showing {filtered.length} of {baseList.length} tickets in queue
          </span>
        </div>
      </div>

      {/* Department High-Density Queue Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Tracking ID</th>
                <th className="px-4 py-3">Target Wing</th>
                <th className="px-4 py-3">Subject & Category</th>
                <th className="px-4 py-3">Complainant</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SLA Deadline</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading department grievance queue...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <p className="font-medium">No grievances in this department queue matching the filter.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Complaints routed to other BAUST departments are isolated by RLS.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectComplaint(c.id)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                      c.is_sos && c.status !== 'resolved' && c.status !== 'closed' ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5 font-mono font-bold text-emerald-800 whitespace-nowrap">
                      {c.tracking_id}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
                        {c.department_code}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate">{c.subject}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[11px] text-slate-500 truncate">{c.category}</span>
                        {c.forwarded_from_department_code && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-semibold border border-amber-200">
                            <ArrowRightLeft className="w-2.5 h-2.5 text-amber-700" />
                            From {c.forwarded_from_department_code}
                          </span>
                        )}
                        {queueTab === 'forwarded_out' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-800 bg-purple-100 px-1.5 py-0.2 rounded font-semibold border border-purple-200">
                            <SendHorizontal className="w-2.5 h-2.5 text-purple-700" />
                            To {c.department_code}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {c.is_anonymous ? (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Shield className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="font-medium">
                            {c.revealed_by_admin ? c.student_name : 'Anonymous'}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-medium text-slate-800 block">{c.student_name}</span>
                          <span className="text-[10px] font-mono text-slate-400 block">{c.student_id}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          c.is_sos
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : c.priority === 'critical'
                            ? 'bg-rose-50 text-rose-700'
                            : c.priority === 'high'
                            ? 'bg-orange-50 text-orange-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {c.is_sos ? 'SOS Critical' : c.priority}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                          c.status === 'resolved' || c.status === 'closed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === 'in_progress'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                      {c.deadline
                        ? new Date(c.deadline).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Standard'}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectComplaint(c.id);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
                      >
                        Triage Case
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Departmental Category Manager Modal (BUG 3) */}
      {canManageCategories && (
        <CategoryManagerModal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          currentUser={currentUser}
          departments={departments}
          onCategoriesChanged={onCategoriesChanged}
        />
      )}
    </div>
  );
};
