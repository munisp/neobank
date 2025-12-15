/**
 * Document Upload Component
 * Reusable component for uploading documents with preview
 */

'use client';

import * as React from 'react';
import { Upload, File, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils/cn';
import { formatFileSize } from '@/lib/utils/format';

export interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  accept?: string;
  maxSize?: number; // in MB
  currentFile?: File | null;
  uploadStatus?: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
  label?: string;
  description?: string;
}

export function DocumentUpload({
  onFileSelect,
  onFileRemove,
  accept = 'image/jpeg,image/png,image/jpg,application/pdf',
  maxSize = 10,
  currentFile,
  uploadStatus = 'idle',
  error,
  label = 'Upload Document',
  description = 'Drag and drop or click to browse',
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Generate preview for images
  React.useEffect(() => {
    if (currentFile && currentFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(currentFile);
    } else {
      setPreview(null);
    }
  }, [currentFile]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      return;
    }

    onFileSelect(file);
  };

  const handleRemove = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setPreview(null);
    onFileRemove?.();
  };

  const getStatusIcon = () => {
    switch (uploadStatus) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'uploading':
        return (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>

      {!currentFile ? (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 hover:border-gray-400',
            error && 'border-red-500'
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-sm font-medium text-gray-900 mb-1">{description}</p>
          <p className="text-xs text-gray-500">
            {accept.split(',').map(t => t.split('/')[1].toUpperCase()).join(', ')} up to {maxSize}MB
          </p>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-start gap-4">
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="h-20 w-20 rounded object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100 flex items-center justify-center">
                <File className="h-8 w-8 text-gray-400" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {currentFile.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFileSize(currentFile.size)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRemove}
                    disabled={uploadStatus === 'uploading'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {uploadStatus === 'uploading' && (
                <div className="mt-2">
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

export default DocumentUpload;
