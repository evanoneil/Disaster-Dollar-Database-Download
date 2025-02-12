import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Source_Sans_3 } from 'next/font/google';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Disaster Dollar Database Data Download Delivery Device",
  description: "Download and filter disaster assistance data",
  openGraph: {
    title: "Disaster Dollar Database Data Download Delivery Device",
    description: "Download and filter disaster assistance data",
    type: "website",
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Disaster Dollar Database'
    }]
  },
  twitter: {
    card: 'summary_large_image',
    title: "Disaster Dollar Database Data Download Delivery Device",
    description: "Download and filter disaster assistance data",
    images: ['/og-image.png']
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${sourceSans.className} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
