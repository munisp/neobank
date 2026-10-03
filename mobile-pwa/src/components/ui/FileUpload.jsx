import React, { useRef } from 'react';

export const FileUpload = ({ label, name, onFileChange, currentFile, accept, className = '' }) => {
  const inputRef = useRef(null);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50"
        >
          Choose file
        </button>
        <span className="text-sm text-gray-500 truncate">
          {currentFile ? (currentFile.name || currentFile) : 'No file selected'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange?.(e.target.files?.[0] || null)}
      />
    </div>
  );
};
export default FileUpload;
