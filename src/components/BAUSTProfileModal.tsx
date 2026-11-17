import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  CreditCard,
  Phone,
  Building2,
  ShieldCheck,
  Camera,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  Upload,
  Copy,
} from 'lucide-react';
import {
  BAUSTDepartment,
  UserProfile,
  formatDepartmentDisplayName,
} from '../types/index.ts';
import { supabase, isSupabaseConfigured, resolveDepartmentUuid } from '../lib/supabase.ts';

const MIN_AVATAR_BYTES = 5 * 1024; // 5 KB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_AVATAR_DIMENSION = 512; // 512x512 px max bounding box
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface BAUSTProfileModalProps {
  currentUser: UserProfile | null;
  departments?: BAUSTDepartment[];
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated: (updatedUser: UserProfile) => void;
}

const PROFILE_DEPT_RLS_SQL = `DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND EXISTS (
        SELECT 1 FROM public.get_profile_immutable_fields(auth.uid()) g
        WHERE g.role = profiles.role
          AND g.is_blocked = profiles.is_blocked
    )
);`;

async function compressAndResizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * MAX_AVATAR_DIMENSION) / width);
          width = MAX_AVATAR_DIMENSION;
        } else {
          width = Math.round((width * MAX_AVATAR_DIMENSION) / height);
          height = MAX_AVATAR_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Browser canvas context is unavailable for image compression.'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress profile image.'));
            return;
          }
          if (blob.size > MAX_AVATAR_BYTES) {
            reject(
              new Error(
                'Compressed image still exceeds the 2 MB limit. Please select a smaller photo.'
              )
            );
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.82
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error('Unable to decode image file. Please choose a valid JPG, PNG, or WebP photo.')
      );
    };

    img.src = objectUrl;
  });
}

export const BAUSTProfileModal: React.FC<BAUSTProfileModalProps> = ({
  currentUser,
  departments = [],
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const [fullName, setFullName] = useState<string>(currentUser?.full_name || '');
  const [studentOrEmpId, setStudentOrEmpId] = useState<string>(
    currentUser?.student_or_emp_id || ''
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>(currentUser?.department_id || '');
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState<string>(currentUser?.avatar_url || '');
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rlsDeptBlocked, setRlsDeptBlocked] = useState<boolean>(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setFullName(currentUser.full_name || '');
      setStudentOrEmpId(currentUser.student_or_emp_id || '');

      let initialDeptId = currentUser.department_id || '';
      if (departments.length > 0) {
        const matchById = departments.find((d) => d.id === initialDeptId);
        if (!matchById && currentUser.department_code) {
          const matchByCode = departments.find(
            (d) => d.code.toUpperCase() === currentUser.department_code?.toUpperCase()
          );
          if (matchByCode) {
            initialDeptId = matchByCode.id;
          }
        }
      }
      setSelectedDeptId(initialDeptId);
      setPhone(currentUser.phone || '');
      setAvatarUrl(currentUser.avatar_url || '');
      setPendingAvatarBlob(null);
      setPreviewObjectUrl(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setRlsDeptBlocked(false);
    }
  }, [isOpen, currentUser, departments]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  if (!isOpen || !currentUser) return null;

  const isStudent = currentUser.role === 'student';
  const isSuperAdmin = currentUser.role === 'super_admin';

  const matchedSelectedDept = departments.find(
    (d) =>
      d.id === selectedDeptId ||
      (currentUser.department_code &&
        !selectedDeptId &&
        d.code.toUpperCase() === currentUser.department_code.toUpperCase())
  );

  const displayDeptCode =
    matchedSelectedDept?.code || (selectedDeptId ? currentUser.department_code : undefined);
  const displayDeptName =
    matchedSelectedDept?.name || (selectedDeptId ? currentUser.department_name : undefined);

  const compactRoleDeptLabel = isSuperAdmin
    ? 'Super Admin · All Departments'
    : isStudent
    ? displayDeptCode
      ? `${displayDeptCode} Student`
      : 'Student · Dept Not Set'
    : displayDeptCode
    ? `${displayDeptCode} Teacher / Admin`
    : 'Teacher / Admin · Dept Not Set';

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'BA';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrorMessage('Invalid format. Please choose a JPG, PNG, or WebP photo.');
      e.target.value = '';
      return;
    }

    if (file.size < MIN_AVATAR_BYTES) {
      setErrorMessage(
        `Photo is too small (${(file.size / 1024).toFixed(1)} KB). Minimum allowed size is 5 KB.`
      );
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setErrorMessage(
        `Photo is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`
      );
      e.target.value = '';
      return;
    }

    setCompressing(true);
    try {
      const compressedBlob = await compressAndResizeImage(file);
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
      const previewUrl = URL.createObjectURL(compressedBlob);
      setPreviewObjectUrl(previewUrl);
      setPendingAvatarBlob(compressedBlob);
      setAvatarUrl(previewUrl);
    } catch (err: any) {
      setErrorMessage(err.message || 'Image resizing and compression failed.');
    } finally {
      setCompressing(false);
    }
  };

  const handleRemoveAvatar = () => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
    }
    setPendingAvatarBlob(null);
    setAvatarUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setRlsDeptBlocked(false);

    if (!fullName.trim()) {
      setErrorMessage('Full Name is required.');
      return;
    }

    if (!studentOrEmpId.trim()) {
      setErrorMessage(isStudent ? 'Student ID is required.' : 'Teacher / Employee ID is required.');
      return;
    }

    if (!isSuperAdmin && departments.length > 0 && !selectedDeptId) {
      setErrorMessage('Please select your department.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setLoading(true);

    try {
      let finalAvatarUrl = avatarUrl;

      if (pendingAvatarBlob) {
        const uploadTs = Date.now();
        const storagePath = `${currentUser.id}/avatar-${uploadTs}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(storagePath, pendingAvatarBlob, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Avatar upload failed: ${uploadError.message}`);
        }

        const { data: pubData } = supabase.storage.from('profiles').getPublicUrl(storagePath);

        const baseUrl = pubData.publicUrl;
        finalAvatarUrl = baseUrl.includes('?')
          ? `${baseUrl}&v=${uploadTs}`
          : `${baseUrl}?v=${uploadTs}`;
      }

      const chosenDept = departments.find((d) => d.id === selectedDeptId);
      let resolvedDeptId: string | null = null;
      if (selectedDeptId) {
        resolvedDeptId = await resolveDepartmentUuid(
          selectedDeptId || chosenDept?.code,
          departments
        );
      }

      const cleanedId = studentOrEmpId.trim().toUpperCase();

      const { data: updatedRow, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          student_or_emp_id: cleanedId,
          department_id: resolvedDeptId,
          phone: phone.trim() || null,
          avatar_url: finalAvatarUrl,
        })
        .eq('id', currentUser.id)
        .select('*')
        .single();

      if (updateError) {
        const lowerMsg = (updateError.message || '').toLowerCase();
        if (
          updateError.code === '23505' ||
          lowerMsg.includes('profiles_student_or_emp_id_key') ||
          lowerMsg.includes('student_or_emp_id')
        ) {
          throw new Error(
            `The ID "${cleanedId}" is already registered to another BAUST account. Please verify your ID or contact your department administrator.`
          );
        }
        if (
          updateError.code === '42501' ||
          lowerMsg.includes('row-level security') ||
          lowerMsg.includes('policy')
        ) {
          setRlsDeptBlocked(true);
          throw new Error(
            'Supabase RLS blocked updating your department. Run the updated profile policy SQL fix in your Supabase SQL Editor and click Save Changes again.'
          );
        }
        throw new Error(updateError.message || 'Failed to save profile changes.');
      }

      if (!updatedRow) {
        throw new Error('Failed to save profile changes.');
      }

      // Keep auth metadata synced silently in the background
      void supabase.auth.updateUser({
        data: {
          full_name: updatedRow.full_name,
          student_or_emp_id: updatedRow.student_or_emp_id,
          department_id: updatedRow.department_id,
          department_code: chosenDept?.code || currentUser.department_code || null,
          phone: updatedRow.phone || '',
        },
      });

      const hydratedDept =
        departments.find((d) => d.id === updatedRow.department_id) || chosenDept;

      const updatedUser: UserProfile = {
        ...currentUser,
        full_name: updatedRow.full_name,
        student_or_emp_id: updatedRow.student_or_emp_id,
        department_id: updatedRow.department_id,
        department_code: hydratedDept?.code || (updatedRow.department_id ? currentUser.department_code : undefined),
        department_name: hydratedDept?.name || (updatedRow.department_id ? currentUser.department_name : undefined),
        phone: updatedRow.phone || '',
        avatar_url: updatedRow.avatar_url || '',
      };

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        setPreviewObjectUrl(null);
      }
      setPendingAvatarBlob(null);
      setAvatarUrl(updatedUser.avatar_url);
      setSuccessMessage('Profile updated successfully.');
      onProfileUpdated(updatedUser);

      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while saving profile changes.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return {
          label: 'Super Admin (VC Secretariat)',
          classes: 'bg-rose-950/70 text-rose-300 border-rose-800',
        };
      case 'office_head':
      case 'dept_admin':
        return {
          label: 'Teacher / Department Admin',
          classes: 'bg-amber-950/70 text-amber-300 border-amber-800',
        };
      case 'staff':
      case 'officer':
        return {
          label: 'Teacher / Authorized Officer',
          classes: 'bg-blue-950/70 text-blue-300 border-blue-800',
        };
      case 'student':
      default:
        return {
          label: 'Student',
          classes: 'bg-emerald-950/70 text-emerald-300 border-emerald-800',
        };
    }
  };

  const roleInfo = getRoleBadge(currentUser.role);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
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

          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                  My Profile & Identity Settings
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                  {compactRoleDeptLabel}
                </span>
              </div>
              <p className="text-xs text-emerald-400 mt-0.5 truncate">
                {displayDeptName
                  ? isStudent
                    ? `Student of ${displayDeptName}`
                    : `${isSuperAdmin ? 'Central Oversight' : 'Teacher / Admin'} · ${displayDeptName}`
                  : 'BAUST Student & Personnel Profile Management'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              {rlsDeptBlocked && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(PROFILE_DEPT_RLS_SQL);
                    setCopiedRlsSql(true);
                    setTimeout(() => setCopiedRlsSql(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-rose-300 text-rose-800 rounded-lg text-[11px] font-semibold hover:bg-rose-100 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedRlsSql ? 'Copied SQL Fix' : 'Copy SQL Fix'}</span>
                </button>
              )}
            </div>
          )}

          {/* Self-Service Avatar Upload */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center gap-5">
            <div className="relative group shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-emerald-600 shadow-md bg-white"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-slate-700 flex flex-col items-center justify-center text-white shadow-md">
                  <span className="text-xl font-bold font-mono tracking-wider text-emerald-400">
                    {getInitials(fullName)}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">
                    {isStudent ? 'Student' : 'Teacher'}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1.5 bg-emerald-600 text-white rounded-full shadow hover:bg-emerald-500 transition-colors"
                title="Change profile photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Profile Photo (User Avatar)
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Leave empty or upload your official photo (JPG, PNG, or WebP; 5 KB – 2 MB). Photos are resized and compressed automatically before storage.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <button
                  type="button"
                  disabled={compressing || loading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{compressing ? 'Compressing...' : 'Select Photo'}</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleRemoveAvatar}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-rose-200 hover:border-rose-300 text-rose-600 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Remove Photo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Institutional Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Assigned Role
              </span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${roleInfo.classes}`}
              >
                {roleInfo.label}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                {isStudent ? 'Student Department' : 'Teacher / Office Department'}
              </span>
              <span className="font-bold text-slate-800 block truncate">
                {displayDeptName ||
                  (isSuperAdmin ? 'BAUST Super Admin (All Depts)' : 'Not Assigned')}
              </span>
              <span className="text-[10px] text-emerald-700 font-mono font-semibold block">
                {compactRoleDeptLabel}
              </span>
            </div>
          </div>

          {/* Editable Profile Fields */}
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Full Name *</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Sadman Sakib"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-xs transition-colors"
                required
              />
            </div>

            <div>
              <label className="text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isStudent ? 'Student ID *' : 'Teacher / Employee ID *'}</span>
              </label>
              <input
                type="text"
                value={studentOrEmpId}
                onChange={(e) => setStudentOrEmpId(e.target.value)}
                placeholder={isStudent ? 'e.g., BAUST-0802420405101103' : 'e.g., FAC-CSE-001'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-medium text-slate-800 text-xs transition-colors uppercase"
                required
              />
            </div>

            {departments.length > 0 && (
              <div>
                <label className="text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {isStudent
                      ? 'Department *'
                      : isSuperAdmin
                      ? 'Department (Optional for Super Admin)'
                      : 'Department / Office *'}
                  </span>
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  required={!isSuperAdmin}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-xs transition-colors"
                >
                  <option value="">-- Select Department or Office --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatDepartmentDisplayName(d)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contact Number</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g., +880 1711-234567"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-medium text-slate-800 text-xs transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>Institutional Email (Read-Only)</span>
              </label>
              <input
                type="email"
                value={currentUser.email}
                disabled
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-slate-500 text-xs cursor-not-allowed"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || compressing}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
