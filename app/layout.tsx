import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/components/i18n";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Prerak · प्रेरक",
  description: "Find government schemes for women and girls in Uttar Pradesh, in Hindi or English.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#d6336c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body className="min-h-dvh">
        <LangProvider>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 md:pb-10">{children}</main>
        </LangProvider>
      </body>
    </html>
  );
}
