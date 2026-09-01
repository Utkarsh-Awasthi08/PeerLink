'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import InviteCode from '@/components/InviteCode';
import TransferStats from '@/components/TransferStats';
import { usePeerLink } from '@/hooks/usePeerLink';
import toast from 'react-hot-toast';
import { FiPause, FiPlay, FiShield, FiX, FiShare2, FiFile } from 'react-icons/fi';

/** Format bytes into a human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString();

export default function Home() {
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');

  // ── Staged file queue state ─────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSharing, setIsSharing] = useState(false);

  const sender = usePeerLink({ role: 'sender' });
  const receiver = usePeerLink({ role: 'receiver' });

  useEffect(() => {
    return () => {
      sender.disconnect();
      receiver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload / Share flow ──────────────────────────────────────────────────────

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles((prev) => {
      // Deduplicate by name+size
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const newFiles = files.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...newFiles];
    });
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleShare = () => {
    if (selectedFiles.length === 0) return;
    setIsSharing(true);
    sender.connect(generateCode());
  };

  // When peer connects, kick off the multi-file transfer
  useEffect(() => {
    if (sender.status === 'Peer connected! Ready for transfer.' && isSharing && selectedFiles.length > 0) {
      toast.success('Peer connected! Waiting for receiver to request files...');
      sender.shareFiles(selectedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sender.status]);

  const handleCancelShare = () => {
    sender.disconnect();
    setIsSharing(false);
    setSelectedFiles([]);
  };

  // ── Download / Receive flow ──────────────────────────────────────────────────

  const handleDownload = (code: string) => {
    window.location.href = `/d/${code}`;
  };

  // Auto-download each file as it arrives (fires once per file_eof)
  useEffect(() => {
    if (!receiver.receivedFile) return;
    const { blob, filename } = receiver.receivedFile;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Downloaded "${filename}" ✅`);
  }, [receiver.receivedFile]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const isSendingDone = sender.status.includes('sent successfully');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-4 text-center">
            <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
              PeerLink
            </h1>
            <p className="text-sm text-gray-400 mt-1">Zero-server. Fully encrypted. Peer-to-peer.</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 mx-2">
            {(['upload', 'download'] as const).map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                className={`flex-1 px-4 py-3.5 font-medium text-sm transition-colors ${activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'upload' ? '📤 Share Files' : '📥 Receive Files'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'upload' ? (
              /* ── Share tab ── */
              <div className="space-y-4">

                {/* ── State 1: File Selection (not yet sharing) ── */}
                {!isSharing && (
                  <>
                    <FileUpload
                      onFilesSelected={handleFilesSelected}
                      disabled={false}
                    />

                    {/* File Queue */}
                    {selectedFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} queued
                          &nbsp;·&nbsp;
                          {formatBytes(selectedFiles.reduce((a, f) => a + f.size, 0))} total
                        </p>

                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {selectedFiles.map((file, i) => (
                            <li
                              key={`${file.name}-${file.size}-${i}`}
                              className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl"
                            >
                              <div className="p-1.5 bg-blue-100 rounded-lg flex-shrink-0">
                                <FiFile className="w-4 h-4 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                              </div>
                              <button
                                id={`remove-file-${i}`}
                                onClick={() => removeFile(i)}
                                className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                                title="Remove file"
                              >
                                <FiX className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>

                        <button
                          id="btn-generate-share"
                          onClick={handleShare}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg active:scale-[.98]"
                        >
                          <FiShare2 className="w-4 h-4" />
                          Generate Link &amp; Share
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* ── State 2: Actively sharing ── */}
                {isSharing && (
                  <div className="space-y-4">
                    {/* Status pill */}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          isSendingDone ? 'bg-green-500' :
                          sender.isPaused ? 'bg-yellow-400' : 'bg-blue-500 animate-pulse'
                        }`}
                      />
                      {sender.status}
                    </div>

                    {/* Per-file progress list */}
                    {Object.keys(sender.fileProgresses).length > 0 && (
                      <ul className="space-y-2">
                        {selectedFiles.map((file, i) => (
                          <li key={`${file.name}-${i}`} className="px-3 py-2 bg-gray-50 rounded-xl">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-600 truncate max-w-[75%]">{file.name}</p>
                              <span className="text-xs text-gray-400">{sender.fileProgresses[i] ?? 0}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${sender.fileProgresses[i] ?? 0}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Invite code + QR */}
                    <InviteCode port={sender.code} encryptionKey={sender.encryptionKey} />

                    {/* Pause / Resume */}
                    {sender.progress > 0 && !isSendingDone && (
                      <div className="flex flex-col gap-2 mt-4">
                        {sender.isStreaming && (
                          <button
                            onClick={sender.isPaused ? sender.resume : sender.pause}
                            className={`w-full py-3 px-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-sm
                              ${sender.isPaused 
                                ? 'bg-green-500 text-white hover:bg-green-600' 
                                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
                          >
                            {sender.isPaused ? <FiPlay className="w-5 h-5" /> : <FiPause className="w-5 h-5" />}
                            {sender.isPaused ? 'Resume' : 'Pause'}
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      id="btn-cancel"
                      onClick={handleCancelShare}
                      className="text-red-400 text-xs hover:underline w-full text-center"
                    >
                      Cancel &amp; Start Over
                    </button>
                  </div>
                )}
              </div>

            ) : (
              /* ── Receive tab ── */
              <div>
                <FileDownload
                  onDownload={(code) => handleDownload(code)}
                  isDownloading={false}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-center gap-1.5 text-xs text-gray-300">
            <FiShield className="w-3 h-3" />
            <span>End-to-end encrypted · Files never touch our servers</span>
          </div>
        </div>
      </div>
    </div>
  );
}