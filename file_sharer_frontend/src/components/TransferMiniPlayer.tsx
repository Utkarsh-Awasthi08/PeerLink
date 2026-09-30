'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePeerLinkContext } from '@/context/PeerLinkContext';
import { FiUserX } from 'react-icons/fi';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s left`;
  return `${Math.ceil(seconds / 60)}m left`;
}

export default function TransferMiniPlayer() {
  const pathname = usePathname();
  const router   = useRouter();
  const { sender, isSharing, selectedFiles, handleDisconnectPeer } = usePeerLinkContext();

  // Auto-hide the "all done" state after a few seconds
  const [doneVisible, setDoneVisible] = useState(false);
  const allDone = sender.status.includes('sent successfully');

  useEffect(() => {
    if (allDone) {
      setDoneVisible(true);
      const t = setTimeout(() => setDoneVisible(false), 6000);
      return () => clearTimeout(t);
    } else {
      setDoneVisible(false);
    }
  }, [allDone]);

  // ── Visibility rules ─────────────────────────────────────────────────────
  // Only show when:
  //  1. User is NOT on the home page (they can already see the full card)
  //  2. A share session is active (sender has started connecting / is connected)
  const isHome = pathname === '/';
  if (isHome || !isSharing) return null;
  if (allDone && !doneVisible) return null;

  // ── Derive pill state ────────────────────────────────────────────────────
  const isErr = sender.status.toLowerCase().includes('disconnect') ||
                sender.status.toLowerCase().includes('error') ||
                sender.status.toLowerCase().includes('fail');

  const isStreaming     = sender.isStreaming;
  const isPaused        = sender.isPaused;
  const speedBps        = sender.speedBytesPerSec;
  const eta             = sender.etaSeconds;
  const fileCount       = selectedFiles.length;
  const completedCount  = sender.completedFiles.size;

  // Overall progress across all files
  const totalProgress = (() => {
    const entries = Object.values(sender.fileProgresses);
    if (entries.length === 0) return 0;
    return Math.round(entries.reduce((a, p) => a + p, 0) / fileCount);
  })();

  // ── Label & dot colour ───────────────────────────────────────────────────
  type DotColor = 'green' | 'yellow' | 'red' | 'emerald';
  let label    = '';
  let dotColor: DotColor = 'green';

  if (isErr) {
    label    = 'Connection lost';
    dotColor = 'red';
  } else if (allDone) {
    label    = `All ${fileCount} file${fileCount > 1 ? 's' : ''} sent ✓`;
    dotColor = 'emerald';
  } else if (isPaused) {
    label    = 'Transfer paused';
    dotColor = 'yellow';
  } else if (isStreaming) {
    // Always show speed and ETA — even during a brief 0-byte tick the hook
    // now emits the last known values, so we never need to hide them.
    const speedStr = ` · ${formatBytes(speedBps)}/s`;
    const etaStr   = eta !== null ? ` · ${formatEta(eta)}` : ' · ...';
    label = `Transferring ${completedCount + 1}/${fileCount} · ${totalProgress}%${speedStr}${etaStr}`;
    dotColor = 'green';
  } else if (sender.isPeerConnected) {
    label    = `Connected · ${fileCount} file${fileCount > 1 ? 's' : ''} ready`;
    dotColor = 'green';
  } else {
    label    = `Waiting for peer · ${fileCount} file${fileCount > 1 ? 's' : ''} staged`;
    dotColor = 'yellow';
  }

  const dotClasses: Record<DotColor, string> = {
    green:   'bg-green-400 animate-pulse',
    yellow:  'bg-yellow-400',
    red:     'bg-red-400',
    emerald: 'bg-emerald-400',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed bottom-5 right-5 z-50
        flex items-center gap-3
        px-4 py-3 rounded-2xl
        bg-[#0f1f5c]/95 backdrop-blur-md
        border border-white/10 shadow-2xl shadow-blue-950/40
        text-white text-sm font-medium
        transition-all duration-300
        animate-in fade-in slide-in-from-bottom-4
        max-w-xs sm:max-w-sm
      "
    >
      {/* Status dot */}
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClasses[dotColor]}`}
      />

      {/* Label */}
      <span className="truncate flex-1 text-white/90">{label}</span>

      {/* Return button */}
      <button
        id="mini-player-return"
        onClick={() => router.push('/#transfer')}
        className="
          ml-1 flex-shrink-0 px-3 py-1 rounded-lg
          bg-white/15 hover:bg-white/25
          text-white text-xs font-semibold
          transition-colors whitespace-nowrap
          border border-white/10
        "
      >
        Return →
      </button>

      {/* Kick button — only when a peer is actively connected */}
      {sender.isPeerConnected && (
        <button
          id="mini-player-disconnect"
          onClick={handleDisconnectPeer}
          title="Disconnect this receiver. Your files stay staged."
          className="
            ml-0.5 flex-shrink-0 p-1.5 rounded-lg
            bg-orange-500/20 hover:bg-orange-500/40
            text-orange-300 hover:text-orange-200
            transition-colors
            border border-orange-500/20
          "
        >
          <FiUserX className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
