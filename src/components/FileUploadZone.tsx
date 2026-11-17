import React, { useState, useRef } from 'react';
import {
  Upload,
  FileCheck,
  Trash2,
  AlertCircle,
  Loader2,
  Film,
  FileText,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { UploadedAttachment } from '../types/index.ts';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
] as const;

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

interface ToastMessage {
  id: string;
  text: string;
}

interface FileUploadZoneProps {
  userId: string;
  files: UploadedAttachment[];
  onChange: React.Dispatch<React.SetStateAction<UploadedAttachment[]>>;
  maxFiles?: number;
  maxSizeBytes?: number;
  disabled?: boolean;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  userId,
  files,
  onChange,
  maxFiles = MAX_FILES,
  maxSizeBytes = MAX_SIZE_BYTES,
  disabled = false,
}) => {
  const [uploadingCount, setUploadingCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pushErrorToast = (text: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const processFiles = async (incomingList: FileList | File[]) => {
    const incoming = Array.from(incomingList);
    if (incoming.length === 0) return;

    const remainingSlots = maxFiles - files.length;
    if (remainingSlots <= 0) {
      pushErrorToast(`Maximum ${maxFiles} evidence files allowed per complaint.`);
      return;
    }

    let candidateFiles = incoming;
    if (incoming.length > remainingSlots) {
      pushErrorToast(
        `Only ${remainingSlots} more file(s) can be attached (limit: ${maxFiles} files per complaint). Extra files were skipped.`
      );
      candidateFiles = incoming.slice(0, remainingSlots);
    }

    const validFiles: File[] = [];
    for (const file of candidateFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        pushErrorToast(
          `"${file.name}" has unsupported format (${file.type || 'unknown'}). Allowed: JPG, PNG, PDF, MP4.`
        );
        continue;
      }

      if (file.size > maxSizeBytes) {
        pushErrorToast(
          `"${file.name}" is ${formatFileSize(file.size)}, exceeding the ${Math.round(
            maxSizeBytes / (1024 * 1024)
          )} MB limit.`
        );
        continue;
      }

      if (file.size === 0) {
        pushErrorToast(`"${file.name}" is empty (0 bytes) and cannot be uploaded.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    if (!isSupabaseConfigured) {
      pushErrorToast(
        'Supabase Storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to upload evidence.'
      );
      return;
    }

    setUploadingCount((prev) => prev + validFiles.length);

    try {
      const uploadResults = await Promise.all(
        validFiles.map(async (file): Promise<UploadedAttachment | null> => {
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `${userId}/${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}-${sanitizedName}`;

          const { error: uploadError } = await supabase.storage
            .from('complaint-attachments')
            .upload(storagePath, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            pushErrorToast(`Upload failed for "${file.name}": ${uploadError.message}`);
            return null;
          }

          // Prefer signed URL for private complaint-attachments bucket (7 days), fallback to public URL
          const { data: signedData, error: signedError } = await supabase.storage
            .from('complaint-attachments')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

          let fileUrl = signedData?.signedUrl || '';
          if (signedError || !fileUrl) {
            const { data: pubData } = supabase.storage
              .from('complaint-attachments')
              .getPublicUrl(storagePath);
            fileUrl = pubData.publicUrl;
          }

          return {
            file_name: file.name,
            file_url: fileUrl,
            storage_path: storagePath,
            file_type: file.type,
            size_bytes: file.size,
          };
        })
      );

      const successful = uploadResults.filter(
        (item): item is UploadedAttachment => item !== null
      );

      if (successful.length > 0) {
        onChange((prev) => [...prev, ...successful].slice(0, maxFiles));
      }
    } finally {
      setUploadingCount((prev) => Math.max(0, prev - validFiles.length));
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = async (idx: number) => {
    const target = files[idx];
    onChange((prev) => prev.filter((_, i) => i !== idx));

    if (target?.storage_path && isSupabaseConfigured) {
      await supabase.storage
        .from('complaint-attachments')
        .remove([target.storage_path]);
    }
  };

  const renderTypeIcon = (mime: string) => {
    if (mime.startsWith('image/')) {
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />;
    }
    if (mime === 'video/mp4') {
      return <Film className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    }
    if (mime === 'application/pdf') {
      return <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    }
    return <FileCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />;
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 block">
          Evidence Attachments (Max {maxFiles} files, {Math.round(maxSizeBytes / (1024 * 1024))}MB each: JPG, PNG, PDF, MP4)
        </label>
        <span className="text-[11px] font-mono text-slate-500">
          {files.length}/{maxFiles} attached
        </span>
      </div>

      {/* Client-Side Validation Error Toasts */}
      {toasts.length > 0 && (
        <div className="space-y-1.5" role="alert" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start justify-between gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 shadow-xs"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{toast.text}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-rose-500 hover:text-rose-700 p-0.5"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
          isDragging
            ? 'border-emerald-600 bg-emerald-50/70'
            : 'border-slate-300 bg-slate-50 hover:bg-slate-100/80'
        } ${disabled || files.length >= maxFiles ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          id="baust-evidence-upload"
          multiple
          disabled={disabled || files.length >= maxFiles || uploadingCount > 0}
          accept="image/jpeg,image/png,application/pdf,video/mp4"
          onChange={handleInputChange}
          className="hidden"
        />
        <label
          htmlFor="baust-evidence-upload"
          className={`flex flex-col items-center justify-center gap-1.5 ${
            disabled || files.length >= maxFiles ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {uploadingCount > 0 ? (
            <>
              <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
              <span className="text-xs font-semibold text-emerald-800">
                Uploading {uploadingCount} file(s) to BAUST Storage...
              </span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-semibold text-emerald-700 hover:underline">
                {files.length >= maxFiles
                  ? `Maximum ${maxFiles} files reached`
                  : 'Click to select or drag & drop evidence files'}
              </span>
              <span className="text-[10px] text-slate-500">
                Supported: JPG, PNG, PDF, MP4 · Up to 20 MB per file
              </span>
            </>
          )}
        </label>
      </div>

      {/* Uploaded Files List */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, idx) => (
            <div
              key={`${file.storage_path || file.file_name}-${idx}`}
              className="flex items-center justify-between px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700"
            >
              <div className="flex items-center gap-2 min-w-0">
                {renderTypeIcon(file.file_type)}
                <span className="truncate font-medium text-slate-800">{file.file_name}</span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  ({formatFileSize(file.size_bytes)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(idx)}
                disabled={disabled}
                className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors shrink-0"
                title="Remove attachment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
