'use client';

import { useState } from 'react';
import { FiDownload } from 'react-icons/fi';

interface FileDownloadProps {
  onDownload: (code: string) => void;
  isDownloading: boolean;
}

export default function FileDownload({ onDownload, isDownloading }: FileDownloadProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = inviteCode.trim();
    const isFiveDigitNumber = /^\d{5}$/.test(code);
    if (!isFiveDigitNumber) {
      setError('Please enter a valid 5-digit invite code.');
      return;
    }

    onDownload(code);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-lg font-medium text-blue-800 mb-1">Receive a File</h3>
        <p className="text-sm text-blue-600">
          Enter the invite code shared with you, or open the shareable link directly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
            Invite Code
          </label>
          <input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="e.g. 48291"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono text-lg tracking-widest text-center"
            disabled={isDownloading}
            required
            maxLength={5}
            pattern="\d{5}"
          />
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>

        <button
          type="submit"
          className="flex items-center justify-center w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <span>Connecting...</span>
          ) : (
            <>
              <FiDownload className="mr-2" />
              <span>Connect &amp; Receive</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}