import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { gaMeasurementId } from "@/lib/ga";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "CrossNews · Eleições Brasil · Debate Presidencial Globo",
  description:
    "Painel jornalístico que cruza checagens de G1 Fato ou Fake, UOL Confere, Terra/Aos Fatos e Folha/Lupa sobre o debate de 2º turno na Rede Globo.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "CrossNews · Eleições Brasil 2026",
    description:
      "Agregação jornalística de checagens do debate de 2º turno na Rede Globo. Não é produto oficial do TSE.",
    locale: "pt_BR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = gaMeasurementId();
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="civic-stripe" />
        {children}
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
