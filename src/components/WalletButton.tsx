"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState } from "react";
import { Wallet, ChevronDown, LogOut, Copy, CheckCheck } from "lucide-react";
import { truncateAddress } from "@/lib/shelby";

export function WalletButton() {
  const { connect, disconnect, connected, account, wallet } = useWallet();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCopy = async () => {
    if (!account) return;
    await navigator.clipboard.writeText(account.address.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (connected && account) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-obsidian-600 bg-obsidian-800 hover:border-acid/30 hover:bg-obsidian-700 transition-all duration-200 font-mono text-sm text-frost-dim"
        >
          <div className="w-2 h-2 rounded-full bg-acid animate-pulse-slow" />
          <span className="text-frost">{truncateAddress(account.address.toString())}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-obsidian-600 bg-obsidian-800 shadow-xl shadow-black/50 overflow-hidden z-50 animate-fade-in">
            <div className="px-3 py-2 border-b border-obsidian-600">
              <p className="text-xs text-frost-muted font-mono mb-1">CONNECTED WALLET</p>
              <p className="text-xs text-frost font-mono">{wallet?.name || "Wallet"}</p>
            </div>
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-frost-dim hover:text-frost hover:bg-obsidian-700 transition-colors"
            >
              {copied ? <CheckCheck size={14} className="text-acid" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy address"}
            </button>
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger/80 hover:text-danger hover:bg-obsidian-700 transition-colors"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        )}

        {open && (
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => connect("Petra" as any)}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-acid text-obsidian-950 font-display font-semibold text-sm hover:bg-acid-dim transition-all duration-200 glow-acid"
    >
      <Wallet size={15} />
      Connect Wallet
    </button>
  );
}
