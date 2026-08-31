'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import InviteCode from '@/components/InviteCode';
import TransferStats from '@/components/TransferStats';
import { usePeerLink } from '@/hooks/usePeerLink';
import toast from 'react-hot-toast';
import { FiPause, FiPlay, FiShield } from 'react-icons/fi';

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');

  const sender = usePeerLink({ role: 'sender' });
  const receiver = usePeerLink({ role: 'receiver' });

  useEffect(() => {
    return () => {
      sender.disconnect();
      receiver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString();

  // ── Upload / Share flow ─────────────────────────────────────────────────────

  const handleFileUpload = (file: File) => {
    const MAX_FILE_SIZE_MB = 500;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`❌ File too large! Max ${MAX_FILE_SIZE_MB} MB allowed.`);
      return;
    }
    setUploadedFile(file);
    sender.connect(generateCode());
  };

  useEffect(() => {
    if (sender.status === 'Peer connected! Ready for transfer.' && uploadedFile) {
      toast.success('Peer connected! Starting encrypted transfer...');
      sender.sendFile(uploadedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sender.status, uploadedFile]);

  // ── Download / Receive flow ─────────────────────────────────────────────────

  const handleDownload = (inputCode: string) => {
    receiver.connect(inputCode);
  };

  useEffect(() => {
    if (receiver.receivedFile) {
      const { blob, filename } = receiver.receivedFile;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Download complete! 🚀');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiver.receivedFile]);

  const isTransferring = sender.progress > 0 && sender.progress < 100;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">PeerLink</h1>
        <p className="text-xl text-gray-500">Secure WebRTC P2P File Sharing</p>
      </header>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b">
          {(['upload', 'download'] as const).map((tab) => (
            <button
              key={tab}
              className={`flex-1 px-4 py-3.5 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'upload' ? '📤 Share a File' : '📥 Receive a File'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Share tab ── */}
          {activeTab === 'upload' ? (
            <div>
              {!uploadedFile ? (
                <FileUpload onFileUpload={handleFileUpload} isUploading={false} />
              ) : (
                <div className="space-y-4">
                  {/* File info */}
                  <div className="p-4 border rounded-xl bg-gray-50">
                    <p className="text-base font-semibold text-gray-700 mb-0.5">
                      Sharing:{' '}
                      <span className="text-blue-600 truncate">{uploadedFile.name}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>

                  {/* Status pill */}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        sender.status.includes('complete') ? 'bg-green-500' :
                        sender.isPaused ? 'bg-yellow-400' : 'bg-blue-500 animate-pulse'
                      }`}
                    />
                    {sender.status}
                  </div>

                  {/* Transfer stats */}
                  {sender.progress > 0 && (
                    <TransferStats
                      progress={sender.progress}
                      speedBytesPerSec={sender.speedBytesPerSec}
                      etaSeconds={sender.etaSeconds}
                      isPaused={sender.isPaused}
                      color="blue"
                    />
                  )}

                  {/* Pause / Resume */}
                  {isTransferring && (
                    <div>
                      {sender.isPaused ? (
                        <button
                          onClick={sender.resume}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                        >
                          <FiPlay /> Resume Transfer
                        </button>
                      ) : (
                        <button
                          onClick={sender.pause}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium"
                        >
                          <FiPause /> Pause Transfer
                        </button>
                      )}
                    </div>
                  )}

                  {/* Invite code + QR */}
                  <InviteCode port={sender.code} encryptionKey={sender.encryptionKey} />

                  <button
                    onClick={() => { sender.disconnect(); setUploadedFile(null); }}
                    className="text-red-400 text-xs hover:underline"
                  >
                    Cancel & Start Over
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Receive tab ── */
            <div>
              {!receiver.code ? (
                <FileDownload
                  onDownload={(code) => handleDownload(code)}
                  isDownloading={false}
                />
              ) : (
                <div className="space-y-4">
                  {/* Status pill */}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        receiver.status.includes('complete') ? 'bg-green-500' : 'bg-blue-500 animate-pulse'
                      }`}
                    />
                    {receiver.status}
                  </div>

                  {/* Transfer stats */}
                  {receiver.progress > 0 && (
                    <TransferStats
                      progress={receiver.progress}
                      speedBytesPerSec={receiver.speedBytesPerSec}
                      etaSeconds={receiver.etaSeconds}
                      color="green"
                    />
                  )}

                  {receiver.status.includes('complete') && (
                    <button
                      onClick={() => {
                        receiver.disconnect();
                        setActiveTab('upload');
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                    >
                      Share Your Own File
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-10 text-center text-gray-400 text-xs flex items-center justify-center gap-1.5">
        <FiShield className="w-3 h-3" />
        PeerLink © {new Date().getFullYear()} — WebRTC · E2E Encrypted · Zero Server Storage
      </footer>
    </div>
  );
}