'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FiCopy, FiCheck, FiLink, FiLock, FiMaximize2, FiX } from 'react-icons/fi';

interface InviteCodeProps {
  port: string | null;
}

export default function InviteCode({ port }: InviteCodeProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    setAppUrl(process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
  }, []);

  if (!port) return null;

  const shareableLink = `${appUrl}/d/${port}`;

  const copyCode = () => {
    navigator.clipboard.writeText(port);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareableLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <>
      <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-green-800">Ready to Share!</h3>
        </div>
        <p className="text-sm text-green-600 mb-4">
          Share this code or link. Keep this tab open until the transfer completes.
        </p>

        {/* QR + text section */}
        <div className="flex gap-4 items-start">
          {/* QR code thumbnail */}
          <button
            onClick={() => setShowQrModal(true)}
            title="View full QR code"
            className="flex-shrink-0 p-1.5 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow group relative"
          >
            <QRCodeSVG value={shareableLink} size={72} />
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity">
              <FiMaximize2 className="w-5 h-5 text-white" />
            </span>
          </button>

          {/* Code + link copy rows */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {/* Code row */}
            <div className="flex items-center">
              <div className="flex-1 bg-white p-2.5 rounded-l-md border border-r-0 border-gray-300 font-mono text-lg font-bold text-gray-800 truncate">
                {port}
              </div>
              <button
                onClick={copyCode}
                className="p-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-r-md transition-colors"
                title="Copy invite code"
              >
                {copiedCode ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
              </button>
            </div>

            {/* Link row */}
            <div className="flex items-center">
              <div className="flex-1 bg-white p-2.5 rounded-l-md border border-r-0 border-gray-300 text-xs text-gray-500 truncate font-mono">
                {shareableLink}
              </div>
              <button
                onClick={copyLink}
                className="p-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-r-md transition-colors"
                title="Copy shareable link"
              >
                {copiedLink ? <FiCheck className="w-4 h-4" /> : <FiLink className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* QR Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex w-full items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Scan to Receive</h3>
              <button onClick={() => setShowQrModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <QRCodeSVG value={shareableLink} size={220} includeMargin />
            <p className="text-xs text-gray-500 text-center">
              Scan with any phone camera to start the download.
            </p>
          </div>
        </div>
      )}
    </>
  );
}