import type { Metadata, Viewport } from "next";
import { Nunito, Playpen_Sans } from "next/font/google";
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import { JapaneseFontLoader } from "@/components/festive/japanese-font-loader";
import { metadataFromOg } from "@/lib/og";
import { getOgSettings } from "@/lib/settings";

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
});

const playpen = Playpen_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playpen",
});

export async function generateMetadata(): Promise<Metadata> {
  return metadataFromOg(await getOgSettings());
}

export const viewport: Viewport = {
  themeColor: "#d6e4f1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${nunito.variable} ${playpen.variable} min-h-screen font-sans antialiased`}
      >
        <JapaneseFontLoader />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
