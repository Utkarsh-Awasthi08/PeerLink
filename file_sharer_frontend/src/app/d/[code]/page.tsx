'use client';

import { useEffect, useState, useRef } from 'react';
import { usePeerLink } from '@/hooks/usePeerLink';
import TransferStats from '@/components/TransferStats';
import toast from 'react-hot-toast';
import { FiShield, FiLock, FiCheckCircle, FiDownload, FiFile } from 'react-icons/fi';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DownloadPage() {
  const [code, setCode] = useState<string>('');
  const [encKeyStr, setEncKeyStr] = useState<string | undefined>(undefined);
  const initialized = useRef(false);

  // Track all files that have been fully downloaded by index
  const [downloadedIndices, setDownloadedIndices] = useState<Set<number>>(new Set());
  const [downloadQueue, setDownloadQueue] = useState<number[]>([]);

  const {
    status,
    progress,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    manifest,
    downloadingIndex,
    requestFile,
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

  // Handle newly downloaded file
  useEffect(() => {
    if (!receivedFile) return;
    const { blob, filename, index } = receivedFile;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setDownloadedIndices((prev) => new Set(prev).add(index));
    toast.success(`"${filename}" downloaded! 📥`);
  }, [receivedFile]);

  // Process the download queue sequentially
  useEffect(() => {
    if (downloadingIndex === null && downloadQueue.length > 0) {
      const nextIndex = downloadQueue[0];
      setDownloadQueue((prev) => prev.slice(1));
      requestFile(nextIndex);
    }
  }, [downloadQueue, downloadingIndex, requestFile]);

  const handleDownloadAll = () => {
    // Add all un-downloaded files to the queue
    const unDownloaded = manifest
      .map((f) => f.index)
      .filter((idx) => !downloadedIndices.has(idx));
    
    if (unDownloaded.length > 0) {
      setDownloadQueue(unDownloaded);
      toast('Starting sequential download! 🚀', { icon: '🍿' });
    } else {
      toast('All files are already downloaded!');
    }
  };

  const isEncrypted = !!encKeyStr;

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
        </div>

        {/* Status line */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {downloadingIndex !== null && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent flex-shrink-0" />
          )}
          <p className="text-gray-600 text-sm font-medium">{status}</p>
        </div>

        {/* File Manifest List */}
        {manifest.length > 0 && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                Available Files ({manifest.length})
              </h3>
              {manifest.length > 1 && downloadedIndices.size < manifest.length && (
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadQueue.length > 0}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Download All
                </button>
              )}
            </div>

            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {manifest.map((file) => {
                const isDownloading = downloadingIndex === file.index;
                const isDownloaded = downloadedIndices.has(file.index);
                const isBusy = downloadingIndex !== null; // someone else is downloading

                return (
                  <li key={file.index} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <FiFile className="w-5 h-5 text-blue-500" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                      </div>
                      
                      <div className="flex-shrink-0 ml-2">
                        {isDownloading ? (
                          <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                            {progress}%
                          </div>
                        ) : isDownloaded ? (
                          <button
                            onClick={() => requestFile(file.index)}
                            disabled={isBusy}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                              isBusy
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200 hover:shadow active:scale-95'
                            }`}
                          >
                            <FiDownload className="w-3.5 h-3.5" />
                            Again
                          </button>
                        ) : (
                          <button
                            onClick={() => requestFile(file.index)}
                            disabled={isBusy}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                              isBusy 
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow active:scale-95'
                            }`}
                          >
                            <FiDownload className="w-3.5 h-3.5" />
                            Get
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Individual Progress Bar */}
                    {isDownloading && (
                      <div className="mt-3">
                        <TransferStats
                          progress={progress}
                          speedBytesPerSec={speedBytesPerSec}
                          etaSeconds={etaSeconds}
                          color="blue"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {manifest.length === 0 && !status.includes('Disconnected') && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Waiting for sender to share files...
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
