import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FiZap, FiLock, FiShare2, FiCode, FiArrowRight,
} from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'About PeerLink — The Story Behind the Build',
  description: 'Learn how PeerLink came to be — a browser-native, zero-server file sharing tool born from the frustration of every other option being too slow, too complicated, or too invasive.',
};

const TIMELINE = [
  {
    icon: '😤',
    phase: 'The Problem',
    title: 'Every option was broken',
    body:
      'Trying to send a 2 GB video to a colleague on a different network, the options were grim: email had a 25 MB limit, Dropbox required an account and ate into storage quota, WeTransfer put it behind a pay wall above 2 GB, AirDrop only worked in the same room, and WhatsApp compressed everything. Every tool either uploaded the file to a stranger\'s server, made you create an account first, or quietly destroyed the quality of your work.',
  },
  {
    icon: '💡',
    phase: 'The Insight',
    title: 'Browsers already had the technology',
    body:
      'WebRTC — the same protocol that powers Google Meet, Zoom, and FaceTime — can create a direct, encrypted, peer-to-peer channel between any two browsers in the world. No plugins, no installs. If browsers can already stream live video at 30 fps across continents, why couldn\'t they stream a file directly without a middleman server touching it?',
  },
  {
    icon: '🛠️',
    phase: 'The Build',
    title: 'Engineering a zero-server pipeline',
    body:
      'The challenge was making it feel seamless. WebRTC requires a brief signaling handshake to exchange connection metadata — PeerLink uses a lightweight Spring Boot WebSocket server for that one-time exchange, then the server steps out. Once two peers are connected, every byte travels directly between them over a DTLS 1.3 encrypted data channel. Files are streamed in 256 KB chunks directly to disk using the File System Access API, meaning even a 100 GB transfer uses less than a megabyte of RAM.',
  },
  {
    icon: '🚀',
    phase: 'The Result',
    title: 'PeerLink — share without boundaries',
    body:
      'The result is a tool where you can drag an entire folder onto one browser tab and receive it on another device anywhere in the world, with no account, no file size limit, no quality loss, and no company ever seeing what you\'re sharing. On the same LAN it saturates a gigabit network. Across the internet it is limited only by the weaker of the two connections.',
  },
];

const STATS = [
  { value: '0', label: 'Bytes stored on our servers' },
  { value: '∞', label: 'Maximum file size' },
  { value: '256 KB', label: 'RAM used per chunk' },
  { value: 'DTLS 1.3', label: 'Encryption standard' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#eef2ff] font-sans">

      {/* ── Hero Strip ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#1e3a8a] via-[#1d4ed8] to-[#eef2ff] pt-20 pb-40 px-4 text-center">
        <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-full bg-sky-300/10 blur-3xl" />
        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-3">
          Our Story
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white max-w-2xl mx-auto leading-tight">
          Born from frustration.<br />Built with purpose.
        </h1>
        <p className="mt-5 text-blue-100/85 text-lg max-w-xl mx-auto leading-relaxed">
          PeerLink started as a question: why is sending a file still this hard in {new Date().getFullYear()}?
        </p>
      </div>

      {/* ── Stats Strip ────────────────────────────────────────────────────── */}
      <div className="relative z-10 -mt-16 mx-auto max-w-4xl px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-blue-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100">
          {STATS.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center justify-center p-6 text-center">
              <span className="text-2xl sm:text-3xl font-black text-blue-700 tabular-nums">{value}</span>
              <span className="mt-1 text-xs text-gray-500 font-medium leading-snug">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-20 pb-8">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 via-indigo-300 to-transparent hidden sm:block" />

          <div className="space-y-12">
            {TIMELINE.map((item, i) => (
              <div key={i} className="relative flex gap-6 sm:gap-8">
                {/* Circle on timeline */}
                <div className="flex-shrink-0 hidden sm:flex">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shadow-md shadow-blue-200 z-10">
                    {item.icon}
                  </div>
                </div>

                <div className="flex-1 pt-1">
                  <span className="inline-block mb-2 px-3 py-0.5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold tracking-widest uppercase">
                    {item.phase}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-3 leading-snug">
                    {item.title}
                  </h2>
                  <p className="text-gray-600 text-base leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Values Section ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-blue-500 font-semibold text-xs tracking-widest uppercase mb-3">What We Stand For</p>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Built on three principles</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: FiLock,
              gradient: 'from-blue-500 to-indigo-600',
              title: 'Privacy First',
              body: 'Your files are your business. We designed PeerLink so that it is architecturally impossible for us to see what you\'re sharing — because the data never passes through our infrastructure.',
            },
            {
              icon: FiZap,
              gradient: 'from-indigo-500 to-violet-600',
              title: 'Zero Friction',
              body: 'No sign-up. No app download. No plugins. Open a browser tab, drop your file, share a code. That\'s it. The receiver doesn\'t even need to visit the homepage.',
            },
            {
              icon: FiCode,
              gradient: 'from-sky-500 to-blue-600',
              title: 'Open & Honest',
              body: 'PeerLink is open-source. Every privacy claim we make is verifiable by anyone who reads the code. We don\'t ask you to trust us — we ask you to verify us.',
            },
          ].map(({ icon: Icon, gradient, title, body }) => (
            <div key={title} className="bg-white rounded-2xl p-6 border border-blue-100 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-xl px-4 pb-24 text-center">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-10 shadow-xl shadow-blue-200">
          <FiShare2 className="w-10 h-10 text-white/80 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-3">Ready to try it?</h2>
          <p className="text-blue-100 text-sm mb-6 leading-relaxed">
            No account needed. Just drag, drop, and share.
          </p>
          <Link
            href="/#transfer"
            id="about-cta-share"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-blue-700 font-bold text-sm hover:bg-blue-50 transition-all shadow-sm active:scale-[.98]"
          >
            Start Sharing <FiArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
