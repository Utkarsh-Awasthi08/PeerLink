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
        w-full p-10 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all select-none
        ${isDragActive
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="p-4 bg-blue-100 rounded-full">
          <FiUploadCloud className="w-8 h-8 text-blue-500" />
        </div>
        {isDragActive ? (
          <p className="text-blue-600 font-semibold">Drop your files here!</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium text-base">
              Drag &amp; drop files here, or <span className="text-blue-500 underline">click to browse</span>
            </p>
            <p className="text-xs text-gray-400">Any file type · Unlimited size · Multiple files supported</p>
            <p className="text-[10px] text-gray-400 mt-2">*(Sending to a mobile device? Keep it under 6GB for best results)*</p>
          </>
        )}
      </div>
    </div>
  );
}