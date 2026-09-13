import './globals.css';

export const metadata = {
  metadataBase: new URL('https://tradewh.work'),
  title: 'TRADEWH - Biểu Đồ & Tín Hiệu Giao Dịch',
  description: 'Nền tảng biểu đồ trực tuyến và tín hiệu giao dịch thời gian thực cho Vàng, Crypto & Forex.',
  keywords: ['TRADEWH', 'biểu đồ vàng', 'XAUUSD', 'tín hiệu giao dịch', 'phân tích kỹ thuật', 'crypto', 'forex'],
  openGraph: {
    title: 'TRADEWH - Biểu Đồ & Tín Hiệu Giao Dịch',
    description: 'Nền tảng biểu đồ trực tuyến và tín hiệu giao dịch thời gian thực cho Vàng, Crypto & Forex.',
    url: 'https://tradewh.work',
    siteName: 'TRADEWH',
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'TRADEWH - Biểu Đồ & Tín Hiệu Giao Dịch',
    description: 'Nền tảng biểu đồ trực tuyến và tín hiệu giao dịch thời gian thực cho Vàng, Crypto & Forex.',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  other: {
    cryptomus: '88a0f467',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="cryptomus" content="88a0f467" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
