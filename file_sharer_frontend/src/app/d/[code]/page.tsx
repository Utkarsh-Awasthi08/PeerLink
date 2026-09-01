'use client';

import { useEffect, useState, useRef } from 'react';
import { usePeerLink } from '@/hooks/usePeerLink';
import TransferStats from '@/components/TransferStats';
import toast from 'react-hot-toast';
import { FiShield, FiLock, FiCheckCircle } from 'react-icons/fi';

export default function DownloadPage() {
  const [code, setCode] = useState<string>('');
  const [encKeyStr, setEncKeyStr] = useState<string | undefined>(undefined);
  const initialized = useRef(false);

  // Track all files that have been fully downloaded
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);

  const {
    status,
    progress,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    totalFilesInBatch,
    currentFileIndexInBatch,
    connect,
    disconnect,
  } = usePeerLink({ role: 'receiver' });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const pathCode = window.location.pathname.split('/').pop() || '';
    const keyStr = window.location.hash.slice(1) || undefined;
    setCode(pathCode);
    setEncKeyStr(keyStr);
    connect(pathCode, keyStr);

    return () => disconnect();
  }, [connect, disconnect]);

  // Fires once per file (new object ref each time) — auto-download individually
  useEffect(() => {
    if (!receivedFile) return;
    const { blob, filename } = receivedFile;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setDownloadedFiles((prev) => [...prev, filename]);
    toast.success(`"${filename}" saved! 📥`);
  }, [receivedFile]);

  const isEncrypted = !!encKeyStr;
  const isAllDone = progress === 100;
  const isMultiFile = totalFilesInBatch > 1;
  const isBusy = progress > 0 && !isAllDone;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-600">PeerLink</h1>
          <p className="text-gray-400 text-sm mt-1">Secure P2P File Transfer</p>
        </div>

        {/* Room + encryption badges */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          <div className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-mono">
            Room: <strong>{code}</strong>
          </div>
          {isEncrypted && (
            <div className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-semibold">
              <FiLock className="w-3.5 h-3.5" /> E2E Encrypted
            </div>
          )}
          {isMultiFile && (
            <div className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full font-semibold">
              {totalFilesInBatch} files
            </div>
          )}
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2 mb-4">
          {isBusy && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent flex-shrink-0" />
          )}
          <p className="text-gray-600 text-sm">{status}</p>
        </div>

        {/* Current file indicator for multi-file batches */}
        {isMultiFile && isBusy && (
          <p className="text-xs text-center text-gray-400 mb-3">
            Receiving file {currentFileIndexInBatch + 1} of {totalFilesInBatch}
          </p>
        )}

        {/* Transfer stats (overall progress) */}
        {progress > 0 && (
          <div className="mb-5">
            <TransferStats
              progress={progress}
              speedBytesPerSec={speedBytesPerSec}
              etaSeconds={etaSeconds}
              color="blue"
            />
          </div>
        )}

        {/* Downloaded file list */}
        {downloadedFiles.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {downloadedFiles.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl text-sm text-green-700"
              >
                <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        )}

        {/* All done state */}
        {isAllDone && (
          <div className="text-center mt-2">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-green-600 font-semibold mb-4">
              {isMultiFile
                ? `All ${totalFilesInBatch} files downloaded!`
                : 'File downloaded successfully!'}
            </p>
            <a
              href="/"
              className="inline-block px-5 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium text-sm"
            >
              Share Your Own Files
            </a>
          </div>
        )}

        {/* Security notice */}
        <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <FiShield className="w-3 h-3" />
          <span>Files transfer directly between browsers — server never sees your data.</span>
        </div>
      </div>
    </div>
  );
}
