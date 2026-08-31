'use client';

import { FiZap, FiClock } from 'react-icons/fi';

interface TransferStatsProps {
  progress: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  isPaused?: boolean;
  color?: 'blue' | 'green';
}

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function TransferStats({
  progress,
  speedBytesPerSec,
  etaSeconds,
  isPaused = false,
  color = 'blue',
}: TransferStatsProps) {
  const barColor = color === 'green' ? 'bg-green-500' : 'bg-blue-600';
  const trackColor = color === 'green' ? 'bg-green-100' : 'bg-blue-100';

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className={`w-full ${trackColor} rounded-full h-3 mb-2 overflow-hidden`}>
        <div
          className={`${barColor} h-3 rounded-full transition-all duration-300 ${
            isPaused ? 'opacity-60' : ''
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{progress}%</span>

        <div className="flex items-center gap-3">
          {/* Transfer speed */}
          {speedBytesPerSec > 0 && !isPaused && (
            <span className="flex items-center gap-1">
              <FiZap className="w-3 h-3 text-yellow-500" />
              {formatSpeed(speedBytesPerSec)}
            </span>
          )}

          {/* ETA */}
          {etaSeconds !== null && !isPaused && (
            <span className="flex items-center gap-1">
              <FiClock className="w-3 h-3 text-blue-400" />
              {formatEta(etaSeconds)} left
            </span>
          )}

          {isPaused && (
            <span className="text-yellow-600 font-medium">Paused</span>
          )}
        </div>
      </div>
    </div>
  );
}
