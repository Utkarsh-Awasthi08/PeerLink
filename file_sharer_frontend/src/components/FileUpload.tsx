'use client';

import { useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUploadCloud, FiFolder } from 'react-icons/fi';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function FileUpload({ onFilesSelected, disabled = false }: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) onFilesSelected(acceptedFiles);
    },
    [onFilesSelected],
  );

  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled,
  });

  return (
    <>
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          w-full py-10 px-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all select-none
          ${isDragActive
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50/60'
          }
          ${disabled ? 'opacity-40 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="p-4 bg-blue-100 rounded-full text-blue-600">
            <FiUploadCloud className="w-9 h-9" />
          </div>
          {isDragActive ? (
            <p className="text-blue-600 font-bold text-lg">Drop your files here!</p>
          ) : (
            <>
              <p className="text-gray-700 font-semibold text-base">
                Drag &amp; drop files here, or{' '}
                <span className="text-blue-600 underline hover:text-blue-700">click to browse</span>
              </p>
              <p className="text-sm text-gray-400">Any file type · Unlimited size · Multiple files</p>
            </>
          )}
        </div>
      </div>

      {/* Folder picker (outside drop zone to avoid double-dialog) */}
      <div className="flex items-center justify-center mt-2">
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-all shadow-sm text-sm font-semibold text-gray-600"
        >
          <FiFolder className="w-4 h-4 text-blue-500" />
          Select Folder
        </button>
      </div>

      {/* Brave Browser warning — outside the dropzone */}
      <div className="mt-3 text-left bg-orange-50 border border-orange-200 p-3 rounded-xl text-xs text-orange-800">
        <p className="font-bold flex items-center gap-1 mb-1">🦁 Using Brave Browser?</p>
        <p className="mb-1">Brave blocks local connections by default for both sender and receiver. To fix:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
          <li>Go to <code className="bg-orange-100 px-1 rounded">brave://settings/privacy</code></li>
          <li>Find <strong>WebRTC IP Handling Policy</strong></li>
          <li>Set to <strong>Default public and private interfaces</strong></li>
        </ol>
      </div>

      <input
        type="file"
        {...{ webkitdirectory: 'true' }}
        multiple
        ref={folderInputRef}
        onChange={handleFolderSelect}
        className="hidden"
      />
    </>
  );
}
