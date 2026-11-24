import React, { useState, useEffect } from 'react';
import {
  X,
  FolderPlus,
  Trash2,
  Tag,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  supabase,
  isSupabaseConfigured,
  isValidUuid,
  resolveDepartmentUuid,
} from '../lib/supabase.ts';
import { BAUSTDepartment, DepartmentCategory, UserProfile, formatDepartmentDisplayName } from '../types/index.ts';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  departments: BAUSTDepartment[];
  onCategoriesChanged?: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  departments,
  onCategoriesChanged,
}) => {
  const defaultDeptId =
    currentUser.department_id || departments[0]?.id || '';

  const [selectedDeptId, setSelectedDeptId] = useState<string>(defaultDeptId);
  const [categories, setCategories] = useState<DepartmentCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';
  const activeDeptId = isSuperAdmin
    ? selectedDeptId || departments[0]?.id || ''
    : currentUser.department_id || '';

  const activeDept = departments.find((d) => d.id === activeDeptId);

  useEffect(() => {
    if (isSuperAdmin && departments.length > 0 && !departments.some((d) => d.id === selectedDeptId)) {
      setSelectedDeptId(departments[0].id);
    }
  }, [isSuperAdmin, departments, selectedDeptId]);

  useEffect(() => {
    if (isOpen && activeDeptId) {
      void fetchCategories(activeDeptId);
    }
  }, [isOpen, activeDeptId]);

  const fetchCategories = async (deptId: string) => {
    if (!isSupabaseConfigured || !deptId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const resolvedId = isValidUuid(deptId)
        ? deptId
        : await resolveDepartmentUuid(deptId, departments);

      if (!resolvedId) {
        setCategories([]);
        return;
      }

      const { data, error } = await supabase
        .from('categories')
        .select('id, department_id, name, created_by, created_at, is_active')
        .eq('department_id', resolvedId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('schema cache') ||
          error.message?.toLowerCase().includes('does not exist')
        ) {
          setErrorMsg(
            "Could not find the table 'public.categories' in the schema cache. Please execute supabase/migrations/20261130_create_departmental_categories.sql in Supabase SQL Editor."
          );
          setCategories([]);
          return;
        }
        throw error;
      }
      setCategories((data as DepartmentCategory[]) || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load department categories.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = newCategoryName.trim();
    if (trimmed.length < 2) {
      setErrorMsg('Category name must be at least 2 characters.');
      return;
    }

    if (!activeDeptId) {
      setErrorMsg('No target department selected.');
      return;
    }

    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`"${trimmed}" already exists for this department.`);
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setSaving(true);
    try {
      const resolvedDeptId = await resolveDepartmentUuid(activeDeptId, departments);
      if (!resolvedDeptId) {
        throw new Error('Selected department was not found in Supabase departments table.');
      }

      const { data, error } = await supabase
        .from('categories')
        .insert({
          department_id: resolvedDeptId,
          name: trimmed,
          created_by: isValidUuid(currentUser.id) ? currentUser.id : null,
          is_active: true,
        })
        .select('id, department_id, name, created_by, created_at, is_active')
        .single();

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('schema cache')
        ) {
          throw new Error(
            "Could not find the table 'public.categories' in the schema cache. Please execute supabase/migrations/20261130_create_departmental_categories.sql in Supabase SQL Editor."
          );
        }
        throw error;
      }

      setCategories((prev) =>
        [...prev, data as DepartmentCategory].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewCategoryName('');
      setSuccessMsg(`Added category "${trimmed}" successfully.`);
      onCategoriesChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not insert category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (cat: DepartmentCategory) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isSupabaseConfigured) return;

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', cat.id);

      if (error) {
        throw error;
      }

      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setSuccessMsg(`Removed category "${cat.name}".`);
      onCategoriesChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete category.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-6 flex flex-col text-slate-800">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 sm:py-5 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close category manager"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white">
                Manage Departmental Categories
              </h2>
              <p className="text-xs text-emerald-400 truncate">
                {activeDept ? formatDepartmentDisplayName(activeDept) : 'Assigned BAUST Wing'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Department
              </label>
              <select
                value={activeDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDepartmentDisplayName(d)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Add New Category Form */}
          <form onSubmit={handleAddCategory} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Add New Complaint Category
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Network Firewall / Lab Equipment"
                maxLength={120}
                required
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="submit"
                disabled={saving || !newCategoryName.trim()}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5" />
                )}
                <span>Add Option</span>
              </button>
            </div>
          </form>

          {/* Existing Categories List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Active Categories ({categories.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Visible to students during filing
              </span>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 rounded-xl">
                Loading department categories...
              </div>
            ) : categories.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
                No custom categories configured for this wing yet. Add one above.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                {categories.map((cat) => (
                  <li
                    key={cat.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors"
                  >
                    <span className="font-medium text-slate-800">{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(cat)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      title={`Delete "${cat.name}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
