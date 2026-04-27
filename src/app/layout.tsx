import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPT-image2 Image Studio",
  description: "Generate and edit images through your own GPT-image2 compatible API.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
