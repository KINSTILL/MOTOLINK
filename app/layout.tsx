import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "MotoLink — La preuve de livraison opposable",
  description:
    "Solution mobile-first de preuve de livraison sécurisée et opposable pour coursiers, expéditeurs et destinataires.",
  manifest: "/manifest.json",
  applicationName: "MotoLink",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MotoLink",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${inter.className} min-h-dvh bg-background text-foreground antialiased selection:bg-primary selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}

