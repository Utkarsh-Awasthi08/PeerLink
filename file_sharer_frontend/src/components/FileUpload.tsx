'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUploadCloud } from 'react-icons/fi';

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled,
  });

  return (
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 bg-amber-50 border border-amber-200/80 rounded-full text-xs font-medium text-amber-800">
              <span>💡 Sending to mobile? Keep under 6GB for best stability</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}