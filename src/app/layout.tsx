import type { Metadata, Viewport } from 'next'
import { NextAuthProvider } from '@/providers/AuthProvider'
import { ToastProvider } from '@/providers/ToastProvider'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: '테이블QR - 매장 주문 관리',
  description: 'QR 주문 및 POS 관리 시스템',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '테이블QR',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <NextAuthProvider>
          {children}
          <ToastProvider />
        </NextAuthProvider>
      </body>
    </html>
  )
}
