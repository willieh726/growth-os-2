import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Growth OS", description: "AI Growth OS for contractors" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
