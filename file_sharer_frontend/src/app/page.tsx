'use client';

import { useState, useEffect, useRef } from 'react';
import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import InviteCode from '@/components/InviteCode';
import { usePeerLink } from '@/hooks/usePeerLink';
import toast from 'react-hot-toast';
import {
  FiPause, FiPlay, FiShield, FiX, FiShare2, FiFile, FiCheck,
  FiPlusCircle, FiClock, FiZap, FiLock, FiSliders, FiDownloadCloud,
  FiLayers, FiRefreshCw,
} from 'react-icons/fi';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString();

const FEATURES = [
  {
    icon: FiLayers,
    title: 'Multi-File & Folder Sharing',
    description:
      'Drop any number of files or entire folder structures at once. Senders can add more files on the fly during an active session without reconnecting.',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
  },
  {
    icon: FiSliders,
    title: 'Selective On-Demand Downloads',
    description:
      'The receiver sees a full file manifest before downloading anything. Pick individual files or hit "Download All" to queue everything — you stay in control.',
    gradient: 'from-indigo-500 to-blue-500',
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    text: 'text-indigo-700',
  },
  {
    icon: FiLock,
    title: 'Native End-to-End Encryption',
    description:
      'Every byte is wrapped in WebRTC DTLS 1.3 encryption before leaving your device. File content never passes through any intermediate server — not even ours.',
    gradient: 'from-violet-500 to-indigo-500',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    text: 'text-violet-700',
  },
  {
    icon: FiZap,
    title: 'Unlimited Size — Zero RAM Usage',
    description:
      'Chunks stream directly to your hard drive via File System Access API or OPFS sandbox. Browser memory stays flat even for 100 GB transfers — no crashes.',
    gradient: 'from-sky-500 to-blue-600',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    text: 'text-sky-700',
  },
  {
    icon: FiDownloadCloud,
    title: 'Pause, Resume & Cancel',
    description:
      'Pause or cancel an active transfer at any time. Partial buffers are cleanly discarded and the queue advances automatically to the next file without reconnecting.',
    gradient: 'from-blue-600 to-violet-500',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
  },
  {
    icon: FiRefreshCw,
    title: 'Resilient Error Recovery',
    description:
      'If a peer disconnects or an invalid code is entered, the app immediately detects the failure, shows a clear error, and redirects back to the lobby automatically.',
    gradient: 'from-cyan-500 to-indigo-500',
    bg: 'bg-cyan-50',
    border: 'border-cyan-100',
    text: 'text-cyan-700',
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const sender = usePeerLink({ role: 'sender' });
  const receiver = usePeerLink({ role: 'receiver' });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const errorMsg = searchParams.get('error');
      const tab = searchParams.get('tab');
      if (errorMsg) {
        toast.error(decodeURIComponent(errorMsg), { duration: 4000 });
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (tab === 'download') setActiveTab('download');
    }
    return () => { sender.disconnect(); receiver.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      return [...prev, ...files.filter((f) => !existing.has(`${f.name}-${f.size}`))];
    });
  };

  const removeFile = (index: number) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index));

  const handleShare = () => {
    if (selectedFiles.length === 0) return;
    setIsSharing(true);
    sender.connect(generateCode());
  };

  useEffect(() => {
    if (sender.status === 'Peer connected! Ready for transfer.' && isSharing && selectedFiles.length > 0) {
      toast.success('Peer connected! Waiting for receiver to request files...');
      sender.shareFiles(selectedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sender.status]);

  const handleCancelShare = () => { sender.disconnect(); setIsSharing(false); setSelectedFiles([]); };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      return [...prev, ...files.filter(f => !existing.has(`${f.name}-${f.size}`))];
    });
    sender.addFiles(files);
    if (addMoreInputRef.current) addMoreInputRef.current.value = '';
  };

  const handleDownload = (code: string) => { window.location.href = `/d/${code}`; };

  useEffect(() => {
    if (!receiver.receivedFile) return;
    const { blob, filename } = receiver.receivedFile;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Downloaded "${filename}" ✅`);
  }, [receiver.receivedFile]);

  const isSendingDone = sender.status.includes('sent successfully');
  const isErr = (s: string) =>
    s.toLowerCase().includes('disconnect') ||
    s.toLowerCase().includes('error') ||
    s.toLowerCase().includes('fail');

  return (
    <div className="min-h-screen bg-[#eef2ff] font-sans">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#1e3a8a] via-[#1d4ed8] to-[#eef2ff] pt-16 pb-72 px-4 text-center">
        <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-full bg-sky-300/10 blur-3xl" />
        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-3">
          Browser-to-Browser · Zero Servers
        </p>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white">
          PeerLink
        </h1>
        <p className="mt-4 text-blue-100/90 text-lg font-medium max-w-md mx-auto leading-relaxed">
          Fully encrypted, peer-to-peer file sharing — straight from your browser.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {['🔒 DTLS E2E Encrypted', '⚡ Unlimited File Size', '📂 Folder Support'].map(b => (
            <span key={b} className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-medium">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* ── App Card ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 -mt-52 mx-auto w-full max-w-xl px-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-blue-100/80 overflow-hidden">

          <div className="flex border-b border-gray-100">
            {(['upload', 'download'] as const).map((tab) => (
              <button key={tab} id={`tab-${tab}`}
                className={`flex-1 px-5 py-4 font-semibold text-base transition-colors ${activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/40'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50/50'}`}
                onClick={() => setActiveTab(tab)}>
                {tab === 'upload' ? '📤 Share Files' : '📥 Receive Files'}
              </button>
            ))}
          </div>

          <div className="p-6 sm:p-8">
            {activeTab === 'upload' ? (
              <div className="space-y-4">
                {!isSharing && (
                  <>
                    <FileUpload onFilesSelected={handleFilesSelected} disabled={false} />
                    {selectedFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} queued &nbsp;·&nbsp;
                          {formatBytes(selectedFiles.reduce((a, f) => a + f.size, 0))} total
                        </p>
                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {selectedFiles.map((file, i) => (
                            <li key={`${file.name}-${file.size}-${i}`}
                              className="flex items-center gap-3 px-3 py-2 bg-blue-50/50 rounded-xl border border-blue-100">
                              <div className="p-1.5 bg-blue-100 rounded-lg flex-shrink-0">
                                <FiFile className="w-4 h-4 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                              </div>
                              <button id={`remove-file-${i}`} onClick={() => removeFile(i)}
                                className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-400 transition-colors">
                                <FiX className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button id="btn-generate-share" onClick={handleShare}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-[.98]">
                          <FiShare2 className="w-4 h-4" />
                          Generate Link &amp; Share
                        </button>
                      </div>
                    )}
                  </>
                )}

                {isSharing && (
                  <div className="space-y-4">
                    <div className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border ${
                      isErr(sender.status) ? 'bg-red-50 text-red-600 border-red-200'
                      : isSendingDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        isErr(sender.status) ? 'bg-red-500'
                        : isSendingDone ? 'bg-emerald-500'
                        : sender.isPaused ? 'bg-yellow-400'
                        : 'bg-blue-500 animate-pulse'}`} />
                      {sender.status}
                    </div>

                    {Object.keys(sender.fileProgresses).length > 0 && (
                      <ul className="space-y-2">
                        {selectedFiles.map((file, i) => (
                          <li key={`${file.name}-${i}`} className="px-3 py-2 bg-blue-50/50 rounded-xl border border-blue-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-600 truncate max-w-[70%]">{file.name}</p>
                              <span className="text-xs">
                                {sender.completedFiles.has(i) ? (
                                  <span className="flex items-center gap-1 text-emerald-600 font-bold"><FiCheck className="w-3.5 h-3.5" /> Sent</span>
                                ) : sender.queuedFiles.has(i) ? (
                                  <span className="flex items-center gap-1 text-amber-600 font-semibold"><FiClock className="w-3 h-3" /> Next requested</span>
                                ) : (
                                  <span className="text-gray-400">{sender.fileProgresses[i] ?? 0}%</span>
                                )}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full transition-all duration-300 ${
                                sender.completedFiles.has(i) ? 'bg-emerald-500' :
                                sender.queuedFiles.has(i) ? 'bg-amber-400' : 'bg-blue-500'}`}
                                style={{ width: `${sender.fileProgresses[i] ?? 0}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <InviteCode port={sender.code} />

                    {sender.progress > 0 && !isSendingDone && sender.isStreaming && (
                      <div className="flex gap-2 mt-4">
                        <button onClick={sender.isPaused ? sender.resume : sender.pause}
                          className={`flex-1 py-3 px-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-sm
                            ${sender.isPaused ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}>
                          {sender.isPaused ? <FiPlay className="w-5 h-5" /> : <FiPause className="w-5 h-5" />}
                          {sender.isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button onClick={sender.cancelTransfer}
                          className="py-3 px-4 rounded-xl font-bold flex justify-center items-center gap-2 bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 active:scale-95">
                          <FiX className="w-5 h-5" /> Cancel
                        </button>
                      </div>
                    )}

                    {(sender.status.includes('Peer connected') || sender.status.includes('Waiting for peer') ||
                      sender.status.includes('Sending') || sender.status.includes('sent successfully')) && (
                      <>
                        <input ref={addMoreInputRef} type="file" multiple className="hidden" onChange={handleAddMoreFiles} />
                        <button onClick={() => addMoreInputRef.current?.click()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all active:scale-[.98]">
                          <FiPlusCircle className="w-4 h-4" /> + Add More Files
                        </button>
                      </>
                    )}

                    <button id="btn-cancel" onClick={handleCancelShare}
                      className="text-red-400 text-xs hover:underline w-full text-center">
                      Cancel &amp; Start Over
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <FileDownload onDownload={(code) => handleDownload(code)} isDownloading={false} />
              </div>
            )}
          </div>

          {/* Card Footer */}
          <div className="px-6 py-4 bg-blue-50/60 border-t border-blue-100 flex flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-2 text-sm text-blue-900 font-medium">
              <FiShield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>End-to-end encrypted · Files never touch our servers</span>
            </div>
            <p className="text-xs text-blue-600/70 font-normal">
              💡 <strong>Pro Tip:</strong> For maximum speeds, connect both devices to the same Wi-Fi / LAN.
            </p>
          </div>
        </div>
      </div>

      {/* ── Features Section ────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-24 pb-32">
        <div className="text-center mb-14">
          <p className="text-blue-500 font-semibold text-xs tracking-widest uppercase mb-3">Why PeerLink?</p>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="mt-3 text-gray-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Built on WebRTC, designed for privacy. No accounts, no cloud storage, no limits.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title}
                className={`rounded-2xl p-6 ${feature.bg} border ${feature.border} hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-default`}>
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} text-white shadow-sm mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className={`text-sm font-bold ${feature.text} mb-1.5`}>{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-400 font-medium">
          {[
            { e: '🔒', l: 'WebRTC DTLS 1.3 Encryption' },
            { e: '🌐', l: 'Open Source on GitHub' },
            { e: '🚫', l: 'Zero Data Retention' },
            { e: '⚡', l: 'LAN Gigabit Speeds' },
          ].map(item => (
            <div key={item.l} className="flex items-center gap-2">
              <span>{item.e}</span><span>{item.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
