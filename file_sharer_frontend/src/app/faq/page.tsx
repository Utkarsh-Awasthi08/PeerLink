'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FiChevronDown, FiArrowRight } from 'react-icons/fi';

const FAQS = [
  {
    q: 'Why peer-to-peer instead of uploading to a cloud server?',
    a: `Cloud servers are convenient but they come with real trade-offs: your files leave your device, sit on a third party's hardware (sometimes across borders), get logged and sometimes scanned, and are subject to that company's retention and breach policies. With P2P, data travels directly from your browser to the receiver's browser over an encrypted WebRTC channel. The file never exists on any server — not even ours. It is the closest digital equivalent of physically handing someone a USB drive, except it works across the entire internet.`,
  },
  {
    q: 'Why is the transfer speed lower than my internet speed?',
    a: `Several factors reduce real-world throughput below what a speed-test reports:\n\n• **WebRTC overhead:** DTLS 1.3 encryption, SCTP framing, and SRTP headers add ~8–15% overhead to every packet.\n\n• **NAT traversal:** When devices are on different networks (e.g. your home vs. a colleague's office), traffic must be relayed through a STUN-discovered path. If both NATs are symmetric, a TURN relay is used, halving effective bandwidth.\n\n• **Browser throttling:** Browsers enforce internal send/receive buffer limits per data channel.\n\n• **The bottleneck is always the weaker side:** If your upload speed is 157 Mbps but the receiver's download speed is 20 Mbps, you are capped at 20 Mbps.\n\n💡 **Pro tip:** On the same Wi-Fi or wired LAN, WebRTC picks a local path and you will see speeds close to your full network capacity (hundreds of Mbps or more).`,
  },
  {
    q: 'How do I send an entire folder?',
    a: `On the homepage, next to the file drop zone you will see a **"Select Folder"** button. Clicking it opens your OS native folder picker. PeerLink recursively walks the entire directory, preserving the folder structure, and queues every file inside. The receiver sees the full manifest and can download individual files or everything at once. Alternatively you can drag a folder directly from Finder / Explorer onto the drop zone — most modern browsers support this too.`,
  },
  {
    q: 'Are files stored on your servers?',
    a: `No. PeerLink's backend is a lightweight WebSocket signaling server. Its only job is to relay the SDP offer/answer and ICE candidates needed to establish the WebRTC connection — this is a few hundred bytes of connection metadata, not your files. Once the two browsers are connected (typically within 2–5 seconds), the signaling server plays no further role. File bytes travel exclusively through the direct encrypted WebRTC data channel between the two browsers. Our server never sees a single byte of your files.`,
  },
  {
    q: 'Do I need to create an account or install anything?',
    a: `No account, no app, no browser extension — nothing. PeerLink is a standard web app that runs entirely inside your browser tab. The sender opens the site, drops files, and shares a 5-digit code. The receiver enters the code (or follows the share link). That's the entire setup. Both parties need a modern browser (Chrome 89+, Edge 89+, Firefox 78+, Safari 15.4+).`,
  },
  {
    q: 'What happens if one device loses connection mid-transfer?',
    a: `PeerLink listens to the WebRTC ICE connection state. If the connection drops (network switch, sleep, navigating away), the app immediately detects the failure — typically within 5 seconds — displays a clear error message, and redirects both parties back to the lobby. Any partially received chunks are safely discarded. You can then start a fresh session and resume from where you left off by re-sharing the remaining files.`,
  },
  {
    q: 'Is PeerLink safe to use on public Wi-Fi?',
    a: `Yes. Every PeerLink transfer is wrapped in WebRTC's mandatory DTLS 1.3 encryption. DTLS (Datagram TLS) is the same family of cryptography as HTTPS — anyone sniffing your Wi-Fi traffic will see only encrypted packets with no readable content. The WebSocket signaling channel uses WSS (TLS 1.2/1.3). Neither the file content nor the file name is ever transmitted in plaintext.`,
  },
  {
    q: 'What browsers are supported?',
    a: `Any browser that implements the WebRTC specification:\n\n• **Chrome / Chromium** 89+ (Mac, Windows, Linux, Android) — Full support including File System Access API for zero-RAM streaming.\n\n• **Edge** 89+ — Identical to Chrome (same Blink engine).\n\n• **Firefox** 78+ — Full WebRTC support; uses OPFS sandbox for streaming.\n\n• **Safari** 15.4+ (Mac, iPhone, iPad) — Full WebRTC support since 2022; uses OPFS sandbox because Apple does not implement the File System Access API.\n\n• **Samsung Internet**, **Brave**, **Opera** — Supported (Chromium-based).\n\n⚠️ Brave's aggressive fingerprinting shields may block WebRTC. If transfers fail in Brave, temporarily lower the shield level for the PeerLink domain.`,
  },
  {
    q: 'Can multiple people receive the same file simultaneously?',
    a: `In the current version, each room code creates a one-to-one WebRTC session between a single sender and a single receiver. To share with multiple people at once, the sender can open multiple tabs, each generating a unique room code — one per recipient. Multi-peer group transfer (1-to-many) is on the roadmap.`,
  },
];

function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);

  // Render basic markdown-like bold (**text**) in answers
  const renderAnswer = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={i} className="block mb-1 last:mb-0">
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="font-semibold text-gray-800">{part}</strong> : part
          )}
        </span>
      );
    });
  };

  const showDiagram = index === 0;

  return (
    <div className="border border-blue-100 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      <button
        id={`faq-item-${index}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-sm sm:text-base font-semibold text-gray-800 leading-snug">{q}</span>
        <FiChevronDown
          className={`w-5 h-5 text-blue-500 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-[900px]' : 'max-h-0'}`}
      >
        <div className="px-6 pb-6 pt-0 text-sm text-gray-600 leading-relaxed border-t border-blue-50 space-y-0">
          <div className="pt-4">{renderAnswer(a)}</div>
          {showDiagram && (
            <div className="mt-5">
              <Image
                src="/images/Gemini_Generated_Image_wslbmkwslbmkwslb.webp"
                alt="Diagram showing third-party cloud upload/download path vs PeerLink direct peer-to-peer connection"
                width={900}
                height={506}
                className="w-full h-auto rounded-xl border border-blue-100"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#eef2ff] font-sans">

      {/* ── Hero Strip ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#1e3a8a] via-[#1d4ed8] to-[#eef2ff] pt-20 pb-40 px-4 text-center">
        <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-full bg-sky-300/10 blur-3xl" />
        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-3">
          Got questions?
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white max-w-xl mx-auto leading-tight">
          Frequently Asked Questions
        </h1>
        <p className="mt-5 text-blue-100/85 text-lg max-w-lg mx-auto leading-relaxed">
          Everything you need to know about how PeerLink works under the hood.
        </p>
      </div>

      {/* ── FAQ Accordion ──────────────────────────────────────────────────── */}
      <div className="relative z-10 -mt-16 mx-auto max-w-3xl px-4 sm:px-6 pb-24">
        <div className="space-y-3">
          {FAQS.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} index={i} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm mb-4">
            Still have a question? Open an issue on GitHub — we read every one.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="https://github.com/Utkarsh-Awasthi08/PeerLink"
              target="_blank"
              rel="noopener noreferrer"
              id="faq-github-link"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-blue-200 bg-white text-blue-700 font-semibold text-sm hover:bg-blue-50 transition-colors shadow-sm"
            >
              Open an Issue on GitHub
            </a>
            <Link
              href="/#transfer"
              id="faq-cta-share"
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
