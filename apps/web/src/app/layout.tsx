import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { ClientProviders } from "@/components/ClientProviders";

import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HiveForYou — Empty Upload",
  description:
    "Upload what you have. Hive will organize the documents and build a clear picture of your case.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh flex flex-col">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
