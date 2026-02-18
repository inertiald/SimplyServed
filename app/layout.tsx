import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimplyServed – AI Concierge",
  description:
    "AI-powered local service coordination. Order food, book services, and manage everyday tasks through a single intelligent assistant.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
