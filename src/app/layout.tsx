import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BlobSafe — Decentralized Encrypted Storage",
  description:
    "Privacy-first file storage built on the Shelby Protocol. Client-side encryption, on-chain access control, and S3-compatible interface.",
  keywords: ["decentralized storage", "web3", "aptos", "shelby", "encrypted", "blockchain"],
  openGraph: {
    title: "BlobSafe",
    description: "Decentralized encrypted file storage on Shelby Protocol",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
