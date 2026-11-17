import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRightLeft,
  AlertTriangle,
  Send,
  Copy,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BAUSTDepartment, Complaint, UserProfile, formatDepartmentDisplayName } from '../types/index.ts';
import { supabase, isSupabaseConfigured, resolveDepartmentUuid } from '../lib/supabase.ts';

interface BAUSTForwardModalProps {
  complaint: Complaint | null;
  departments: BAUSTDepartment[];
  currentUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedComplaint: Complaint) => void;
}

export const BAUSTForwardModal: React.FC<BAUSTForwardModalProps> = ({
  complaint,
  departments,
  currentUser,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [targetDeptId, setTargetDeptId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rlsSqlNeeded, setRlsSqlNeeded] = useState<boolean>(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setTargetDeptId('');
      setReason('');
      setError(null);
      setRlsSqlNeeded(false);
    }
  }, [isOpen, complaint?.id]);

  if (!isOpen || !complaint) return null;

  const forwardRlsFixSql = `DO $$ DECLARE pol RECORD; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'complaints' LOOP EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.complaints', pol.policyname); END LOOP; END $$;
CREATE POLICY "Student can view own complaints" ON public.complaints FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Department staff and office heads can view department complaints" ON public.complaints FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('office_head', 'dept_admin', 'staff', 'officer') AND (p.department_id = complaints.department_id OR p.department_id = complaints.forwarded_from_department_id)));
CREATE POLICY "Super admins can view all department complaints" ON public.complaints FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Authenticated users can submit complaints" ON public.complaints FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.departments d WHERE d.id = department_id AND d.is_active = TRUE));
CREATE POLICY "Department authorities can update or forward current department complaints" ON public.complaints FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role IN ('office_head', 'dept_admin', 'staff', 'officer') AND p.department_id = complaints.department_id)))) WITH CHECK (EXISTS (SELECT 1 FROM public.departments d WHERE d.id = department_id AND d.is_active = TRUE));
NOTIFY pgrst, 'reload schema';`;

  const eligibleDepartments = departments.filter((d) => d.id !== complaint.department_id);
  const selectedTargetDept = departments.find((d) => d.id === targetDeptId);

  const presets = [
    {
      label: t('presets.eee_label'),
      text: t('presets.eee_text'),
      deptCode: 'EEE',
    },
    {
      label: t('presets.reg_label'),
      text: t('presets.reg_text'),
      deptCode: 'REGISTRAR',
    },
    {
      label: t('presets.exam_label'),
      text: t('presets.exam_text'),
      deptCode: 'EXAM_CONTROLLER',
    },
    {
      label: t('presets.ict_label'),
      text: t('presets.ict_text'),
      deptCode: 'ICT',
    },
    {
      label: t('presets.hostel_label'),
      text: t('presets.hostel_text'),
      deptCode: 'HOSTEL',
    },
  ];

  const handleApplyPreset = (preset: (typeof presets)[0]) => {
    setReason(preset.text);
    const matchedDept = eligibleDepartments.find(
      (d) => d.code.toUpperCase() === preset.deptCode.toUpperCase()
    );
    if (matchedDept) {
      setTargetDeptId(matchedDept.id);
    }
  };

  const handleForwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRlsSqlNeeded(false);

    if (!targetDeptId) {
      setError(t('forward_modal.err_select_dept'));
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError(t('forward_modal.err_reason_len'));
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured.');
      return;
    }

    setLoading(true);
    try {
      const resolvedTargetId = await resolveDepartmentUuid(targetDeptId, departments);
      if (!resolvedTargetId) {
        throw new Error('Selected target department does not have a valid database UUID yet.');
      }

      const targetDept = departments.find((d) => d.id === targetDeptId || d.id === resolvedTargetId);
      const fromDeptId = complaint.department_id;
      const fromDeptName = complaint.department_name || 'Previous Department';
      const now = new Date().toISOString();

      const { error: rpcError } = await supabase.rpc('forward_complaint', {
        p_complaint_id: complaint.id,
        p_target_department_id: resolvedTargetId,
        p_reason: reason.trim(),
      });

      if (rpcError) {
        const lowerRpc = rpcError.message.toLowerCase();
        const isMissingRpc =
          rpcError.code === 'PGRST202' ||
          lowerRpc.includes('schema cache') ||
          lowerRpc.includes('could not find the function');

        if (!isMissingRpc) {
          throw new Error(rpcError.message);
        }

        const { error: updateError } = await supabase
          .from('complaints')
          .update({
            department_id: resolvedTargetId,
            forwarded_from_department_id: fromDeptId,
            forwarded_reason: reason.trim(),
            forwarded_at: now,
            transfer_count: (complaint.transfer_count || 0) + 1,
            assigned_to: null,
          })
          .eq('id', complaint.id);

        if (updateError) {
          if (updateError.message.toLowerCase().includes('row-level security policy')) {
            setRlsSqlNeeded(true);
            throw new Error(
              'Supabase RLS policy blocked forwarding on "complaints". Click "Copy SQL Fix" below and run it in your Supabase SQL Editor, then click Confirm Transfer again.'
            );
          }
          throw new Error(updateError.message || 'Failed to transfer complaint');
        }

        const { error: historyError } = await supabase.from('complaint_history').insert({
          complaint_id: complaint.id,
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          action: 'DEPARTMENT_TRANSFERRED',
          from_status: complaint.status,
          to_status: complaint.status,
          note: `Complaint officially transferred from ${fromDeptName} to ${
            targetDept?.name || 'Target Department'
          }. Department Note: "${reason.trim()}"`,
        });

        if (historyError) {
          console.warn('Transfer succeeded, but history entry failed:', historyError.message);
        }

        await supabase.from('audit_logs').insert({
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'COMPLAINT_FORWARDED_INTER_DEPT',
          target: complaint.tracking_id,
          details: `Transferred ticket from ${complaint.department_code || fromDeptId} to ${
            targetDept?.code || targetDeptId
          }. Reason: ${reason.trim()}`,
        });
      }

      onSuccess({
        ...complaint,
        department_id: resolvedTargetId,
        department_code: targetDept?.code,
        department_name: targetDept?.name,
        forwarded_from_department_id: fromDeptId,
        forwarded_from_department_code: complaint.department_code,
        forwarded_from_department_name: fromDeptName,
        forwarded_reason: reason.trim(),
        forwarded_at: now,
        transfer_count: (complaint.transfer_count || 0) + 1,
        assigned_to: null,
      });
      onClose();
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('row-level security policy')) {
        setRlsSqlNeeded(true);
      }
      setError(err.message || 'Department transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden my-6 flex flex-col text-slate-800">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-sm shadow-md">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                {t('forward_modal.title')}
              </h2>
              <p className="text-xs text-amber-400">
                {t('forward_modal.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleForwardSubmit} noValidate className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Case Overview */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                {complaint.tracking_id}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {t('forward_modal.current_dept')}: <strong className="text-slate-900">{complaint.department_code}</strong>
              </span>
            </div>
            <h4 className="font-bold text-slate-900 line-clamp-1">{complaint.subject}</h4>
            <p className="text-slate-600 text-[11px] line-clamp-2">{complaint.description}</p>
          </div>

          {/* Target Department */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('forward_modal.target_dept_label')}
            </label>
            <select
              value={targetDeptId}
              onChange={(e) => setTargetDeptId(e.target.value)}
              required
              className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium"
            >
              <option value="">{t('forward_modal.select_target_placeholder')}</option>
              {eligibleDepartments
                .filter(
                  (dept, idx, arr) =>
                    arr.findIndex((x) => x.code.toUpperCase() === dept.code.toUpperCase()) === idx
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDepartmentDisplayName(d)}
                  </option>
                ))}
            </select>
            {selectedTargetDept && (
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                {t('forward_modal.target_success_note', {
                  deptName: formatDepartmentDisplayName(selectedTargetDept),
                })}
              </p>
            )}
          </div>

          {/* Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('forward_modal.quick_presets')}
              </label>
              <span className="text-[10px] text-slate-400">{t('forward_modal.click_to_add')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-all text-left"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {t('forward_modal.reason_label')}
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('forward_modal.reason_placeholder')}
              className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-900"
            />
          </div>

          {/* Warning */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px] leading-relaxed">
              <strong className="block font-bold">{t('forward_modal.warning_title')}</strong>
              {t('forward_modal.warning_desc')}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {rlsSqlNeeded && (
                <div className="pl-6 space-y-2">
                  <p className="text-[11px] text-slate-700">
                    Paste and run this in <strong>Supabase Dashboard → SQL Editor</strong>, then click{' '}
                    <strong>Confirm Transfer</strong> again:
                  </p>
                  <pre className="p-2 bg-slate-900 text-emerald-300 rounded-md overflow-x-auto max-h-32 text-[10px] font-mono select-all whitespace-pre-wrap">
                    {forwardRlsFixSql}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(forwardRlsFixSql);
                      setCopiedRlsSql(true);
                      setTimeout(() => setCopiedRlsSql(false), 2500);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedRlsSql ? 'SQL Fix Copied!' : 'Copy SQL Fix for Supabase'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {t('forward_modal.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? t('forward_modal.transferring') : t('forward_modal.confirm_transfer')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
