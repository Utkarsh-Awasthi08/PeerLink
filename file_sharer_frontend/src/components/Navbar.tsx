'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { label: 'Transfer', href: '/#transfer' },
  { label: 'About',    href: '/about' },
  { label: 'FAQ',      href: '/faq' },
  { label: 'Privacy',  href: '/privacy' },
];

// Inline version of the icon.svg so we don't need an <img> tag
function PeerLinkIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M227.135 186.417C214.37 173.651 197.057 166.48 179.006 166.48C160.954 166.48 143.642 173.651 130.876 186.417C118.11 199.182 110.94 216.495 110.94 234.547C110.94 252.598 118.11 269.911 130.876 282.677L181.161 332.961C193.926 345.727 211.239 352.898 229.291 352.898C247.342 352.898 264.655 345.727 277.421 332.961"
        stroke="url(#nb0)" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M284.865 325.583C297.63 338.349 314.943 345.52 332.994 345.52C351.046 345.52 368.358 338.349 381.124 325.583C393.89 312.818 401.06 295.505 401.06 277.453C401.06 259.402 393.89 242.089 381.124 229.323L330.839 179.039C318.074 166.273 300.761 159.102 282.709 159.102C264.658 159.102 247.345 166.273 234.579 179.039"
        stroke="url(#nb1)" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M198.818 313.182L313.182 198.818"
        stroke="url(#nb2)" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="nb0" x1="110.94" y1="259.689" x2="277.421" y2="259.689" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="nb1" x1="401.06" y1="252.311" x2="234.579" y2="252.311" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="nb2" x1="198.818" y1="256" x2="313.182" y2="256" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/#transfer') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0f1f5c]/90 backdrop-blur-md shadow-lg shadow-blue-950/30'
          : 'bg-[#1e3a8a]/95 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* ── Brand ─────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 group select-none" id="nav-brand">
            <div className="flex-shrink-0 p-1.5 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
              <PeerLinkIcon size={22} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-white font-black text-lg tracking-tight">PeerLink</span>
              <span className="text-blue-300/80 text-[10px] font-medium tracking-wide hidden sm:block">
                Share without boundaries
              </span>
            </div>
          </Link>

          {/* ── Desktop Nav Links ──────────────────────── */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                id={`nav-${label.toLowerCase()}`}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  isActive(href)
                    ? 'bg-white/15 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* ── Desktop CTA ───────────────────────────── */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/#transfer"
              id="nav-cta-share"
              className="px-5 py-2 rounded-xl bg-white text-blue-700 text-sm font-bold hover:bg-blue-50 active:scale-[.97] transition-all shadow-sm shadow-blue-900/30"
            >
              Share Files →
            </Link>
          </div>

          {/* ── Mobile Hamburger ──────────────────────── */}
          <button
            id="nav-mobile-menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle mobile menu"
            aria-expanded={menuOpen}
            className="md:hidden p-2 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu ─────────────────────────────── */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-[#152a6e] border-t border-white/10 px-4 pb-4 pt-2 space-y-1">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              id={`nav-mobile-${label.toLowerCase()}`}
              className={`block px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                isActive(href)
                  ? 'bg-white/15 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/#transfer"
            id="nav-mobile-cta"
            className="block mt-2 text-center px-4 py-3 rounded-xl bg-white text-blue-700 font-bold text-sm hover:bg-blue-50 transition-colors"
          >
            Share Files →
          </Link>
        </div>
      </div>
    </header>
  );
}
