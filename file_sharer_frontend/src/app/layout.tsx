import "./globals.css"
// import "../styles/custom.css"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from "react-hot-toast";
const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PeerLink - P2P File Sharing',
  description: 'Securely share files peer-to-peer',
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