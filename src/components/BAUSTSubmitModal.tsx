import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Shield,
  CheckCircle,
  Copy,
  Loader2,
} from 'lucide-react';
import {
  BAUSTDepartment,
  Complaint,
  ComplaintPriority,
  DepartmentCategory,
  UploadedAttachment,
  UserProfile,
  formatDepartmentDisplayName,
} from '../types/index.ts';
import {
  supabase,
  isSupabaseConfigured,
  isValidUuid,
  resolveDepartmentUuid,
} from '../lib/supabase.ts';
import { FileUploadZone } from './FileUploadZone.tsx';

interface BAUSTSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: BAUSTDepartment[];
  currentUser: UserProfile;
  onSuccess: (complaint: Complaint) => void;
  categoryRefreshKey?: number;
}

export const BAUSTSubmitModal: React.FC<BAUSTSubmitModalProps> = ({
  isOpen,
  onClose,
  departments,
  currentUser,
  onSuccess,
  categoryRefreshKey = 0,
}) => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id || '');
  const [dynamicCategories, setDynamicCategories] = useState<DepartmentCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<ComplaintPriority>('medium');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isSos, setIsSos] = useState<boolean>(false);
  const [files, setFiles] = useState<UploadedAttachment[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdComplaint, setCreatedComplaint] = useState<Complaint | null>(null);
  const [copiedTrackingId, setCopiedTrackingId] = useState(false);

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  // Sync default or fallback department ID once live Supabase UUID departments load
  useEffect(() => {
    if (departments.length === 0) return;
    if (!selectedDeptId) {
      setSelectedDeptId(departments[0].id);
      return;
    }
    const exactMatch = departments.find((d) => d.id === selectedDeptId);
    if (!exactMatch) {
      const codeGuess = selectedDeptId.replace(/^dept-/i, '').toUpperCase();
      const byCode = departments.find((d) => d.code.toUpperCase() === codeGuess);
      setSelectedDeptId(byCode?.id || departments[0].id);
    }
  }, [departments, selectedDeptId]);

  // Reset modal form state when reopened
  useEffect(() => {
    if (isOpen) {
      setCreatedComplaint(null);
      setErrorMsg(null);
      setSubject('');
      setDescription('');
      setPriority('medium');
      setIsAnonymous(false);
      setIsSos(false);
      setFiles([]);
    }
  }, [isOpen]);

  const pickDefaultCategory = (names: string[]): string => {
    const specific = names.find((n) => n.trim().toLowerCase() !== 'others');
    return specific || names[0] || 'Others';
  };

  // BUG 3: Fetch dynamic categories filtered by selectedDeptId from Supabase `categories` table
  useEffect(() => {
    if (!isOpen || !selectedDeptId) return;

    let cancelled = false;
    const loadCategories = async () => {
      if (!isSupabaseConfigured) {
        setDynamicCategories([]);
        setCategory(pickDefaultCategory(selectedDept?.category_tags || []));
        return;
      }

      setLoadingCategories(true);
      try {
        const resolvedId = isValidUuid(selectedDeptId)
          ? selectedDeptId
          : await resolveDepartmentUuid(selectedDeptId, departments);

        if (cancelled) return;

        if (!resolvedId) {
          setDynamicCategories([]);
          setCategory(pickDefaultCategory(selectedDept?.category_tags || []));
          return;
        }

        const { data, error } = await supabase
          .from('categories')
          .select('id, department_id, name, created_by, created_at')
          .eq('department_id', resolvedId)
          .order('name', { ascending: true });

        if (cancelled) return;

        if (!error && data && data.length > 0) {
          const rows = data as DepartmentCategory[];
          setDynamicCategories(rows);
          setCategory(pickDefaultCategory(rows.map((r) => r.name)));
        } else {
          setDynamicCategories([]);
          setCategory(pickDefaultCategory(selectedDept?.category_tags || []));
        }
      } catch {
        if (!cancelled) {
          setDynamicCategories([]);
          setCategory(pickDefaultCategory(selectedDept?.category_tags || []));
        }
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    };

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedDeptId, departments, categoryRefreshKey]);

  useEffect(() => {
    if (isSos) {
      setPriority('critical');
    }
  }, [isSos]);

  const rawCategoryNames: string[] =
    dynamicCategories.length > 0
      ? dynamicCategories.map((c) => c.name)
      : selectedDept?.category_tags || [];

  const nonOtherCategories = rawCategoryNames.filter(
    (name) => name.trim().toLowerCase() !== 'others'
  );
  const existingOthersLabel = rawCategoryNames.find(
    (name) => name.trim().toLowerCase() === 'others'
  );
  const categoryOptions: string[] = selectedDeptId
    ? [...nonOtherCategories, existingOthersLabel || 'Others']
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId || !subject.trim() || !description.trim() || !category.trim()) {
      setErrorMsg('Please select a target department, category, and complete all required fields.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const resolvedDeptId = await resolveDepartmentUuid(selectedDeptId, departments);
      if (!resolvedDeptId) {
        throw new Error(
          `Target department "${selectedDept?.code || selectedDeptId}" was not found in your Supabase "departments" table. Please run supabase/schema.sql in Supabase SQL Editor.`
        );
      }

      const year = new Date().getFullYear();
      const rand = Math.floor(100000 + Math.random() * 900000);
      const trackingId = `CMP-BAUST-${year}-${rand}`;
      const isSosEnabled = Boolean(isSos);
      const effectivePriority: ComplaintPriority = isSosEnabled ? 'critical' : priority;
      const deadlineHours = isSosEnabled ? 4 : 48;
      const deadline = new Date(Date.now() + deadlineHours * 3600 * 1000).toISOString();

      const { data: insertedComplaint, error: insertError } = await supabase
        .from('complaints')
        .insert({
          tracking_id: trackingId,
          user_id: currentUser.id,
          department_id: resolvedDeptId,
          category: category.trim(),
          subject: subject.trim(),
          description: description.trim(),
          priority: effectivePriority,
          is_sos: isSosEnabled,
          status: 'submitted',
          deadline,
          is_anonymous: Boolean(isAnonymous),
        })
        .select('*')
        .single();

      if (insertError || !insertedComplaint) {
        throw new Error(insertError?.message || 'Failed to register complaint.');
      }

      if (files.length > 0) {
        const attachmentRows = files.map((f) => ({
          complaint_id: insertedComplaint.id,
          file_name: f.file_name,
          file_url: f.file_url,
          storage_path: f.storage_path || null,
          file_type: f.file_type,
          size_bytes: f.size_bytes,
        }));

        let { error: attError } = await supabase
          .from('complaint_attachments')
          .insert(attachmentRows);

        if (
          attError &&
          (attError.code === 'PGRST204' ||
            attError.message.toLowerCase().includes('storage_path'))
        ) {
          const legacyRows = files.map((f) => ({
            complaint_id: insertedComplaint.id,
            file_name: f.file_name,
            file_url: f.file_url,
            file_type: f.file_type,
            size_bytes: f.size_bytes,
          }));
          const retryRes = await supabase
            .from('complaint_attachments')
            .insert(legacyRows);
          attError = retryRes.error;
        }

        if (attError) {
          throw new Error(`Complaint saved, but attachments failed: ${attError.message}`);
        }
      }

      await supabase.from('complaint_history').insert({
        complaint_id: insertedComplaint.id,
        actor_id: currentUser.id,
        actor_name: isAnonymous ? 'Anonymous Student' : currentUser.full_name,
        action: 'SUBMITTED',
        from_status: null,
        to_status: 'submitted',
        note: `Complaint officially registered and routed specifically to ${selectedDept?.name || 'Target Department'}.`,
      });

      const hydrated: Complaint = {
        ...insertedComplaint,
        student_name: currentUser.full_name,
        student_id: currentUser.student_or_emp_id,
        student_email: currentUser.email,
        department_code: selectedDept?.code,
        department_name: selectedDept?.name,
        attachments: [],
      };

      setCreatedComplaint(hydrated);
      onSuccess(hydrated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting complaint');
    } finally {
      setSubmitting(false);
    }
  };

  const copyTrackingToClipboard = () => {
    if (createdComplaint) {
      void navigator.clipboard.writeText(createdComplaint.tracking_id);
      setCopiedTrackingId(true);
      setTimeout(() => setCopiedTrackingId(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50 gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              {createdComplaint ? 'BAUST Official Grievance Receipt' : 'Register Grievance to Target Authority'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Bangladesh Army University of Science and Technology (BAUST)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {createdComplaint ? (
          <div className="p-4 sm:p-6 text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
                Target Authority Routing Confirmed
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{createdComplaint.subject}</h3>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg max-w-md mx-auto text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                Official BAUST Tracking ID
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xl font-mono font-bold text-emerald-800 tracking-tight">
                  {createdComplaint.tracking_id}
                </span>
                <button
                  type="button"
                  onClick={copyTrackingToClipboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded shadow-xs transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedTrackingId ? 'Copied!' : 'Copy ID'}</span>
                </button>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Assigned Target Wing:</span>
                  <strong className="text-slate-900">{createdComplaint.department_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Routing Isolation:</span>
                  <span className="text-emerald-700 font-medium">
                    Locked to {createdComplaint.department_code} Admin
                  </span>
                </div>
              </div>
            </div>

            {createdComplaint.is_sos && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 text-left flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Critical SOS Alert Active</span>
                  <span>
                    Target Department Head and On-Duty Proctors have received instant emergency notification.
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md">
                {errorMsg}
              </div>
            )}

            {/* Emergency SOS Toggle */}
            <div
              className={`p-3.5 rounded-lg border transition-all ${
                isSos
                  ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                      isSos ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Emergency / SOS Critical Incident
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Use for life safety, physical harassment, fire, lab electrical hazard, or water flood.
                      Forces Critical priority & notifies department head instantly.
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isSos}
                    onChange={(e) => setIsSos(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>
            </div>

            {/* Target BAUST Department */}
            <div>
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                Select Target BAUST Department or Office *
              </label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {formatDepartmentDisplayName(dept)}
                  </option>
                ))}
              </select>
              {selectedDept && (
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Official Recipient: <strong className="text-slate-700">{selectedDept.head_title}</strong> ({selectedDept.email})
                </span>
              )}
            </div>

            {/* Dynamic Category & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between mb-1">
                  <span>Departmental Category *</span>
                  {loadingCategories && <Loader2 className="w-3 h-3 animate-spin text-emerald-700" />}
                </label>
                {categoryOptions.length > 0 ? (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  >
                    {categoryOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Enter complaint category"
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                  disabled={isSos}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="low">Low (General Inquiry)</option>
                  <option value="medium">Medium (Standard Academic Concern)</option>
                  <option value="high">High (Impacting Examination / Clearance)</option>
                  <option value="critical">Critical (Immediate Laboratory Danger / SOS)</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Grievance Subject / Incident Title *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Workstation software crash in CSE Software Lab 2"
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Detailed Statement & Location Information *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="State the exact building, lab/hall room, date of occurrence, and requested resolution..."
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* Anonymous Toggle */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Submit as Anonymous Whistleblower
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Identity is masked at database level. Visible only if legally unmasked by Super Admin.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-emerald-700 rounded border-slate-300 cursor-pointer"
              />
            </div>

            {/* BUG 4: Evidence FileUploadZone (Max 5 files, 20MB each, JPG/PNG/PDF/MP4) */}
            <FileUploadZone
              userId={currentUser.id}
              files={files}
              onChange={setFiles}
              disabled={submitting}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-colors ${
                  isSos ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-700 hover:bg-emerald-600'
                } disabled:opacity-50`}
              >
                {submitting
                  ? 'Routing to Department...'
                  : isSos
                  ? 'Broadcast Emergency SOS'
                  : `Route to ${selectedDept?.code || 'Department'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
