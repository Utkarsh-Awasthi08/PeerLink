'use client';

import { useEffect, useState } from 'react';
import { usePeerLink } from '@/hooks/usePeerLink';
import TransferStats from '@/components/TransferStats';
import toast from 'react-hot-toast';
import { FiShield, FiLock, FiDownload, FiFile, FiClock, FiX } from 'react-icons/fi';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

import { useRouter } from 'next/navigation';

export default function DownloadPage() {
  const router = useRouter();
  const [code, setCode] = useState<string>('');

  // Track all files that have been fully downloaded by index
  const [downloadedIndices, setDownloadedIndices] = useState<Set<number>>(new Set());
  const [downloadQueue, setDownloadQueue] = useState<number[]>([]);

  const {
    status,
    progress,
    isPaused,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    manifest,
    downloadingIndex,
    requestFile,
    sendQueueSignal,
    cancelTransfer,
    connect,
    disconnect,
  } = usePeerLink({ role: 'receiver' });

  useEffect(() => {
    const pathCode = window.location.pathname.split('/').pop() || '';
    setCode(pathCode);
    connect(pathCode);

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Redirect to home if connection fails
  useEffect(() => {
    const s = status.toLowerCase();
    if (
      s.includes('no peer found') ||
      s.includes('disconnect') ||
      s.includes('error') ||
      s.includes('fail')
    ) {
      toast.error(status);
      router.push('/?error=' + encodeURIComponent(status) + '&tab=download');
    }
  }, [status, router]);

  // Handle newly downloaded file
  useEffect(() => {
    if (!receivedFile) return;
    const { blob, filename, index, handledByStream } = receivedFile;

    if (handledByStream) {
      toast.success(`"${filename}" saved directly to disk! 📥`);
    } else {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (receivedFile.cleanup) {
          receivedFile.cleanup();
        }
      }, 10000);
      toast.success(`"${filename}" downloaded! 📥`);
    }

    setDownloadedIndices((prev) => new Set(prev).add(index));
  }, [receivedFile]);

  // Process the download queue sequentially
  useEffect(() => {
    if (downloadingIndex === null && downloadQueue.length > 0) {
      const nextIndex = downloadQueue[0];
      setDownloadQueue((prev) => prev.slice(1));
      requestFile(nextIndex);
    }
  }, [downloadQueue, downloadingIndex, requestFile]);

  const allDownloaded = manifest.length > 0 && downloadedIndices.size === manifest.length;

  const handleDownloadAll = () => {
    if (allDownloaded) {
      // If all are downloaded, re-queue all of them
      const indices = manifest.map((f) => f.index);
      setDownloadQueue(indices);
      indices.forEach(idx => sendQueueSignal(idx));
    } else {
      // Only queue files not yet downloaded AND not currently transferring
      const toDownload = manifest
        .map((f) => f.index)
        .filter((index) => !downloadedIndices.has(index) && index !== downloadingIndex);
      if (toDownload.length > 0) {
        setDownloadQueue(toDownload);
        toDownload.forEach(idx => sendQueueSignal(idx));
        toast('Starting sequential download! 🚀', { icon: '🍿' });
      } else {
        toast('All files are already downloaded!');
      }
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6 md:p-8">
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 max-w-2xl w-full transition-all">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            PeerLink
          </h1>
          <p className="text-gray-500 text-sm font-medium mt-1">Secure P2P File Transfer</p>
        </div>

        {/* Room + encryption badges */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          <div className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-mono">
            Room: <strong>{code}</strong>
          </div>
          <div className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-semibold">
            <FiLock className="w-3.5 h-3.5" /> E2E Encrypted
          </div>
        </div>

        {/* Status line */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {downloadingIndex !== null && !isPaused && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent flex-shrink-0" />
          )}
          <div className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            status.toLowerCase().includes('no peer found') || status.toLowerCase().includes('disconnect') || status.toLowerCase().includes('error') || status.toLowerCase().includes('fail')
              ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm'
              : status.includes('received ✅')
              ? 'bg-green-50 text-green-700 border border-green-200 shadow-sm'
              : 'text-gray-600'
          }`}>
            {status}
          </div>
        </div>

        {/* File Manifest List */}
        {manifest.length > 0 && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                Available Files ({manifest.length})
              </h3>
              {manifest.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadQueue.length > 0}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {allDownloaded ? 'Download All Again' : 'Download All'}
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
                          // Actively downloading — show progress + cancel button
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                              {progress}%
                            </div>
                            <button
                              onClick={cancelTransfer}
                              title="Cancel this download"
                              className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 border border-red-200 transition-all active:scale-95"
                            >
                              <FiX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : downloadQueue.includes(file.index) ? (
                          // File is in the local download queue — waiting its turn
                          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                            <FiClock className="w-3 h-3" />
                            In queue
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
                            onClick={() => {
                              if (isBusy) {
                                // A transfer is in progress: add to queue instead
                                if (!downloadQueue.includes(file.index)) {
                                  setDownloadQueue(prev => [...prev, file.index]);
                                  sendQueueSignal(file.index);
                                }
                              } else {
                                requestFile(file.index);
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm bg-blue-600 text-white hover:bg-blue-700 hover:shadow active:scale-95"
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
        <div className="mt-8 pt-4 border-t border-gray-100 flex flex-col items-center justify-center gap-1.5 text-sm text-gray-600 font-medium text-center">
          <div className="flex items-center justify-center gap-2">
            <FiShield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Files transfer directly between browsers — server never sees your data.</span>
          </div>
          <div className="text-xs text-gray-500 font-normal">
            💡 <strong>Pro Tip:</strong> For maximum gigabit transfer speeds, ensure both devices are connected to the same Wi-Fi / Local Network.
          </div>
        </div>
      </div>
    </div>
  );
}
