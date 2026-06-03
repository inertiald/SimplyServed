import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Toaster } from "@/components/Toaster";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "SimplyServed — Hyper-local services & neighborhood vibe",
  description:
    "Discover trusted neighborhood services, share what's happening on your block, and clip live offers from local businesses. Built for the next billion local interactions.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  return (
    <html lang="en" className="dark">
      <body className="font-display antialiased">
        <Header user={user} />
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
