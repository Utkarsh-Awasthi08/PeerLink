import "./globals.css"
// import "../styles/custom.css"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from "react-hot-toast";
const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PeerLink - Fast, Secure & Private P2P File Sharing',
  description: 'Send and receive files of any size directly between browsers with zero server storage and end-to-end encryption using WebRTC.',
  keywords: ['P2P file sharing', 'WebRTC file transfer', 'peer to peer file share', 'secure file transfer', 'zero server file share', 'PeerLink'],
  authors: [{ name: 'PeerLink' }],
  verification: {
    google: '7cN5fnog38zTCwjJEYB1D0BvjDm421rfRXBrt-BnEcs',
  },
  openGraph: {
    title: 'PeerLink - Fast, Secure & Private P2P File Sharing',
    description: 'Direct browser-to-browser encrypted file sharing with zero file size limits.',
    type: 'website',
    siteName: 'PeerLink',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PeerLink - Fast, Secure & Private P2P File Sharing',
    description: 'Direct browser-to-browser encrypted file sharing with zero file size limits.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="min-h-screen bg-gray-50">
          {children}
          <Toaster position="top-center" reverseOrder={false} />
        </main>
      </body>
    </html>
  )
}