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
      e.target.value = ''; // reset to allow selecting same folder again
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled,
  });

  return (
    <>
    <div
      {...getRootProps()}
      className={`
        w-full py-14 px-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all select-none
        ${isDragActive
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50/80'
        }
        ${disabled ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-3.5">
        <div className="p-4 bg-blue-100/80 rounded-full text-blue-600 shadow-sm">
          <FiUploadCloud className="w-10 h-10" />
        </div>
        {isDragActive ? (
          <p className="text-blue-600 font-bold text-lg">Drop your files here!</p>
        ) : (
          <>
            <p className="text-gray-800 font-semibold text-lg">
              Drag &amp; drop files here, or <span className="text-blue-600 underline hover:text-blue-700">click to browse</span>
            </p>
            <p className="text-sm text-gray-500 font-medium">Any file type · Unlimited size · Multiple files supported</p>
            
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm text-sm font-semibold text-gray-700"
            >
              <FiFolder className="w-4 h-4 text-blue-500" />
              Select Folder
            </button>
            <div className="mt-4 text-left bg-orange-50 border border-orange-200 p-3 rounded-xl text-xs text-orange-800 w-full max-w-md">
              <p className="font-bold flex items-center gap-1 mb-1">🦁 Using Brave Browser?</p>
              <p className="mb-1">Brave blocks local connections by default. To fix:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                <li>Go to <code className="bg-orange-100 px-1 rounded">brave://settings/privacy</code></li>
                <li>Find <strong>WebRTC IP Handling Policy</strong></li>
                <li>Set to <strong>Default public and private interfaces</strong></li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
    <input
      type="file"
      {...{ webkitdirectory: "true" }}
      multiple
      ref={folderInputRef}
      onChange={handleFolderSelect}
      className="hidden"
    />
    </>
  );
}