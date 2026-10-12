import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  applicationName: "Fast Wallet",
  title: {
    default: "Fast Wallet — Secure Digital Wallet",
    template: "%s · Fast Wallet",
  },
  description:
    "Fast Wallet is a secure digital wallet: deposit by card with webhook-verified crediting, withdraw to BEP20/TRC20, and track every movement in an exact, auditable ledger.",
  keywords: ["Fast Wallet", "fastwallet", "digital wallet", "secure wallet", "USDT wallet"],
  openGraph: {
    siteName: "Fast Wallet",
    title: "Fast Wallet — Secure Digital Wallet",
    description:
      "Deposit with verified payment confirmation, withdraw with administrative controls, and trust an exact, auditable ledger.",
    type: "website",
    images: ["/og-fastwallet.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fast Wallet — Secure Digital Wallet",
    description: "Verified deposits, precise balances, and an auditable ledger.",
    images: ["/og-fastwallet.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body className="bg-ink-950 font-sans text-zinc-100 antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
