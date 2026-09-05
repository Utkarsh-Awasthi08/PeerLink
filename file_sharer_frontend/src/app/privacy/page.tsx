import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  FiShield, FiEyeOff, FiServer, FiLock, FiTrash2,
  FiArrowRight, FiAlertCircle,
} from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Privacy Policy — PeerLink',
  description: "PeerLink's privacy commitment: we cannot see your files, we do not store them, and the architecture is designed so that no one can.",
};

const SECTIONS = [
  {
    icon: FiEyeOff,
    gradient: 'from-blue-500 to-indigo-600',
    title: 'What we can see — almost nothing',
    paragraphs: [
      'When you use PeerLink, the only information that touches our servers is the minimum required to connect two browsers: a randomly generated 5-digit room code, and the WebRTC connection metadata (SDP offer/answer and ICE candidates). This metadata describes how to establish the encrypted channel — it contains your public IP address and port numbers, but not a single byte of your file content or file names.',
      'Once the WebRTC connection is established (typically within 2–5 seconds), our signaling server exits completely. It holds no connection state and has no further involvement in the session.',
    ],
  },
  {
    icon: FiServer,
    gradient: 'from-indigo-500 to-violet-600',
    title: 'What we do not store — everything important',
    paragraphs: [
      'PeerLink stores no files, ever. We have no database of transfers, no file names, no file metadata, no transfer logs tied to your identity. When the signaling session ends (the room code expires after the connection is formed), even the room code is gone.',
      'We do not use cookies to track you across sessions. We do not build user profiles. We have no analytics SDK that reports your behaviour back to us. The only server log that exists is a standard web server access log (IP + timestamp + HTTP method) retained for 7 days for abuse prevention, then automatically deleted.',
    ],
  },
  {
    icon: FiLock,
    gradient: 'from-sky-500 to-blue-600',
    title: 'How encryption protects your files',
    paragraphs: [
      'WebRTC mandates encryption at the protocol level — it is not optional and cannot be disabled. Every PeerLink transfer is protected by DTLS 1.3 (Datagram Transport Layer Security), the same family of cryptography as HTTPS. DTLS 1.3 provides:',
    ],
    bullets: [
      "Forward secrecy — a new ephemeral key pair is negotiated for every session. Compromising one session's key reveals nothing about past or future sessions.",
      'Mutual authentication — both browsers verify each other\'s fingerprints before any data flows, preventing man-in-the-middle interception.',
      'Integrity protection — every packet is authenticated with HMAC. If a packet is tampered with in transit, it is rejected.',
      'Confidentiality — payload bytes are AES-GCM encrypted. Anyone intercepting traffic on the wire sees only ciphertext.',
    ],
    afterBullets: 'The WebSocket signaling channel (used only for the initial handshake) uses WSS — TLS 1.2 or 1.3 — enforced by the server. Unencrypted WebSocket connections (ws://) are rejected.',
  },
  {
    icon: FiShield,
    gradient: 'from-violet-500 to-indigo-600',
    title: 'The signaling server — what it touches and when',
    paragraphs: [
      "PeerLink's backend is a Spring Boot WebSocket application deployed on Render. Its sole function is the WebRTC signaling handshake:",
    ],
    steps: [
      { step: '1', text: 'Sender opens a WebSocket and sends an SDP offer tagged with their room code.' },
      { step: '2', text: 'Receiver connects with the same code and receives the offer.' },
      { step: '3', text: 'Receiver sends an SDP answer and ICE candidates back through the server.' },
      { step: '4', text: 'Sender receives them. The WebRTC connection is established. The server is done.' },
    ],
    afterSteps: 'The entire signaling exchange is under 5 KB of data. No file content is ever present in this exchange. The server is stateless — it does not persist any signaling messages to disk.',
  },
  {
    icon: FiTrash2,
    gradient: 'from-blue-600 to-cyan-500',
    title: 'Local browser storage (OPFS)',
    paragraphs: [
      'On some browsers (notably Safari and Firefox), PeerLink uses the Origin Private File System (OPFS) as a temporary disk buffer during transfer. OPFS is a sandboxed directory managed by your browser — it is local to your own device and completely inaccessible to PeerLink\'s servers or any other website.',
      'Files written to OPFS during transfer are immediately exported to your chosen save location when the transfer completes. PeerLink does not retain any handles to OPFS after the file is saved. Your browser will garbage-collect the temporary OPFS entry the next time it runs its storage cleanup, or you can clear it manually via your browser\'s site data settings.',
    ],
  },
  {
    icon: FiAlertCircle,
    gradient: 'from-amber-500 to-orange-500',
    title: 'STUN servers and your IP address',
    paragraphs: [
      "To discover the best network path between two peers, WebRTC contacts STUN (Session Traversal Utilities for NAT) servers. PeerLink uses Google's public STUN servers (stun.l.google.com:19302). Your public IP address is shared with the STUN server during this lookup — this is a fundamental property of how NAT traversal works on the internet, not unique to PeerLink.",
      'The result of the STUN lookup (your reflexive IP and port) is included in the ICE candidates sent through the signaling server. This means the receiving peer learns your public IP address as part of establishing the connection — equivalent to what happens in any WebRTC video call or online multiplayer game. If you require anonymity, consider using a VPN before initiating a transfer.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#eef2ff] font-sans">

      {/* ── Hero Strip ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#1e3a8a] via-[#1d4ed8] to-[#eef2ff] pt-20 pb-40 px-4 text-center">
        <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-full bg-sky-300/10 blur-3xl" />
        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-3">
          Your data, your rules
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white max-w-xl mx-auto leading-tight">
          We built PeerLink so we&apos;d never need to see your files.
        </h1>
        <p className="mt-5 text-blue-100/85 text-lg max-w-lg mx-auto leading-relaxed">
          Privacy isn&apos;t a policy checkbox for us — it&apos;s a design constraint.
        </p>
        <p className="mt-2 text-blue-200/60 text-xs">
          Last updated: September 2026
        </p>
      </div>

      {/* ── TL;DR Card ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 -mt-16 mx-auto max-w-3xl px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-xl border border-emerald-100 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-3 rounded-xl bg-emerald-100">
              <FiShield className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 mb-2">TL;DR — The three-sentence version</h2>
              <ul className="space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <span>Your files travel directly between browsers over an encrypted WebRTC channel — they never pass through our servers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <span>We do not store files, file names, or any transfer metadata. The only thing our server ever sees is the room code used to pair two browsers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <span>All traffic is protected by DTLS 1.3 encryption — even if someone intercepted every packet, they could not read your files.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── P2P Diagram ────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8">
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-2 text-center">
            <p className="text-blue-500 font-semibold text-xs tracking-widest uppercase mb-1">Architecture</p>
            <h2 className="text-lg font-black text-gray-900">See the difference at a glance</h2>
            <p className="text-gray-500 text-sm mt-1">
              Cloud services route your files through their servers. PeerLink doesn&apos;t.
            </p>
          </div>
          <div className="px-4 pb-5 pt-3">
            <Image
              src="/images/Gemini_Generated_Image_wslbmkwslbmkwslb.webp"
              alt="Comparison diagram: third-party cloud services upload then download your files through their servers, while PeerLink transfers directly between browsers with no server involvement"
              width={900}
              height={506}
              className="w-full h-auto rounded-xl border border-blue-50"
            />
          </div>
        </div>
      </div>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 pb-24 space-y-6">
        {SECTIONS.map((section, i) => {
          const Icon = section.icon;
          return (
            <div key={i} className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className={`flex-shrink-0 p-3 rounded-xl bg-gradient-to-br ${section.gradient} text-white shadow-sm`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-black text-gray-900 leading-snug">{section.title}</h2>
              </div>

              <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                {section.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}

                {'bullets' in section && section.bullets && (
                  <ul className="space-y-2 mt-2">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-2" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {'afterBullets' in section && section.afterBullets && (
                  <p>{section.afterBullets}</p>
                )}

                {'steps' in section && section.steps && (
                  <ol className="space-y-3 mt-2">
                    {section.steps.map((s, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
                          {s.step}
                        </span>
                        <span>{s.text}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {'afterSteps' in section && section.afterSteps && (
                  <p>{section.afterSteps}</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Contact */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6 sm:p-8 text-center">
          <h2 className="text-lg font-black text-gray-900 mb-2">Questions or concerns?</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">
            If you believe PeerLink has handled your data incorrectly, or if you have questions about this policy, please open an issue on GitHub. We take every report seriously and will respond within 48 hours.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="https://github.com/Utkarsh-Awasthi08/PeerLink/issues"
              target="_blank"
              rel="noopener noreferrer"
              id="privacy-github-issues"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-blue-200 bg-white text-blue-700 font-semibold text-sm hover:bg-blue-50 transition-colors shadow-sm"
            >
              Open a GitHub Issue
            </a>
            <Link
              href="/#transfer"
              id="privacy-cta-share"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm active:scale-[.98]"
            >
              Start Sharing <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
