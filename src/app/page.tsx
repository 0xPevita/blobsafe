"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { FileUpload } from "@/components/FileUpload";
import { FileList } from "@/components/FileList";
import { StatsBar } from "@/components/StatsBar";
import { HardDrive, Upload, FolderOpen, Terminal, ExternalLink } from "lucide-react";
import { truncateAddress } from "@/lib/shelby";

type Tab = "upload" | "files";

export default function Home() {
  const { connected, account } = useWallet();
  const [tab, setTab] = useState<Tab>("upload");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="min-h-screen bg-obsidian-950 bg-grid bg-grid-size">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-obsidian-700 bg-obsidian-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-acid/10 border border-acid/30 flex items-center justify-center glow-acid">
              <HardDrive size={16} className="text-acid" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-frost tracking-tight">BlobSafe</span>
              <span className="text-[10px] font-mono text-frost-muted bg-obsidian-700 px-1.5 py-0.5 rounded border border-obsidian-600">
                TESTNET
              </span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <a
              href="https://docs.shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 text-xs font-mono text-frost-muted hover:text-frost transition-colors"
            >
              <Terminal size={12} />
              Shelby Docs
              <ExternalLink size={10} />
            </a>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-acid/10 border border-acid/20 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-acid animate-pulse" />
            <span className="text-xs font-mono text-acid tracking-wider">BUILT ON SHELBY PROTOCOL</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-frost leading-tight mb-3">
            Decentralized storage,<br />
            <span className="text-acid glow-acid-text">end-to-end encrypted.</span>
          </h1>
          <p className="text-frost-muted font-body max-w-xl leading-relaxed">
            Your files are encrypted client-side before they ever leave your device.
            Access control is enforced on-chain via Aptos smart contracts — no servers, no middlemen.
          </p>
        </div>

        {/* Stats */}
        <div className="animate-fade-up delay-100">
          <StatsBar />
        </div>

        {/* Main card */}
        <div className="animate-fade-up delay-200">
          <div className="rounded-2xl border border-obsidian-700 bg-obsidian-900 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-obsidian-700">
              <button
                onClick={() => setTab("upload")}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-mono transition-all border-b-2 ${
                  tab === "upload"
                    ? "text-acid border-acid bg-acid/5"
                    : "text-frost-muted border-transparent hover:text-frost hover:bg-obsidian-800"
                }`}
              >
                <Upload size={14} />
                Upload
              </button>
              <button
                onClick={() => setTab("files")}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-mono transition-all border-b-2 ${
                  tab === "files"
                    ? "text-acid border-acid bg-acid/5"
                    : "text-frost-muted border-transparent hover:text-frost hover:bg-obsidian-800"
                }`}
              >
                <FolderOpen size={14} />
                My Files
              </button>

              {/* Connected indicator */}
              {connected && account && (
                <div className="ml-auto flex items-center gap-2 px-6 py-4 border-b-2 border-transparent">
                  <div className="w-1.5 h-1.5 rounded-full bg-acid" />
                  <span className="text-xs font-mono text-frost-muted">
                    {truncateAddress(account.address.toString())}
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-6">
              {tab === "upload" && (
                <FileUpload
                  onUploadComplete={() => {
                    setRefreshTrigger((k) => k + 1);
                    setTimeout(() => setTab("files"), 1000);
                  }}
                />
              )}
              {tab === "files" && <FileList key={refreshTrigger} />}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="animate-fade-up delay-300 flex flex-col md:flex-row items-center justify-between gap-4 px-2 pb-4">
          <p className="text-xs font-mono text-frost-muted/50 text-center md:text-left">
            BlobSafe is open-source and runs on Shelby testnet.
            All data stored on decentralized infrastructure.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/0xPevita/blobsafe"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-mono text-frost-muted hover:text-frost transition-colors"
            >
              <ExternalLink size={11} />
              GitHub
            </a>
            <a
              href="https://explorer.shelby.xyz/testnet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-mono text-frost-muted hover:text-frost transition-colors"
            >
              <ExternalLink size={11} />
              Shelby Explorer
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
