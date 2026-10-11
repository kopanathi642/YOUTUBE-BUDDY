import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/context/QueryProvider';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'YouTube Buddy — AI Creator Platform',
    template: '%s | YouTube Buddy',
  },
  description:
    'The most advanced AI-powered creator platform. Generate viral shorts, cinematic scenes, automate your entire YouTube workflow, and grow your channel with AI agents.',
  keywords: [
    'YouTube automation',
    'AI creator tools',
    'shorts generator',
    'video AI',
    'content creation',
    'YouTube growth',
    'AI agents',
    'viral shorts',
  ],
  authors: [{ name: 'YouTube Buddy Team' }],
  creator: 'YouTube Buddy',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: 'YouTube Buddy — AI Creator Platform',
    description:
      'The most advanced AI-powered creator platform for YouTube automation and growth.',
    siteName: 'YouTube Buddy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Buddy — AI Creator Platform',
    description: 'The most advanced AI-powered creator platform.',
    creator: '@youtubebuddy',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-bg-primary text-white antialiased" suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'rgba(13, 13, 23, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  borderRadius: '12px',
                  fontSize: '14px',
                },
                success: {
                  iconTheme: {
                    primary: '#a3e635',
                    secondary: '#000000',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#f87171',
                    secondary: '#000000',
                  },
                },
              }}
            />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
