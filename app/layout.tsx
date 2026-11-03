import type { Metadata, Viewport } from 'next';
import './globals.css';

// 1. Metadatos para SEO y PWA
export const metadata: Metadata = {
  title: 'Depa · Gestor de compras',
  description: 'Gestor de compras y mudanza para amoblar tu departamento.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Depa',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

// 2. Colores de la barra del navegador según el tema del sistema
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#14130f' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Opcional: evita el zoom excesivo en móviles en inputs
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning es necesario porque el script de abajo
    // modifica la clase de <html> antes de que React hidrate.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Script para evitar el "Flash of Unstyled Content" (FOUC) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('depa.theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}