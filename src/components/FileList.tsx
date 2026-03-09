"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAccountBlobs } from "@shelby-protocol/react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { Network } from "@aptos-labs/ts-sdk";
import {
  Download, RefreshCw, Loader2, FolderOpen,
  Lock, Globe, ExternalLink, Clock
} from "lucide-react";
import { formatBytes, formatBlobName, formatDate, getFileType } from "@/lib/shelby";

export function FileList() {
  const { connected, account } = useWallet();
  const [refreshKey, setRefreshKey] = useState(0);

  const shelbyClient = new ShelbyClient({
    network: Network.SHELBYNET,
    apiKey: process.env.NEXT_PUBLIC_APTOS_API_KEY,
  });

  const { data: blobs, isLoading, refetch } = useAccountBlobs({
    client: shelbyClient,
    account: account?.address?.toString() || "",
    enabled: !!connected && !!account,
  });

  if (!connected) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-frost-muted">
          <Loader2 size={18} className="animate-spin" />
          <span className="font-mono text-sm">Fetching blobs...</span>
        </div>
      </div>
    );
  }

  const encryptedBlobs = blobs?.filter((b) => b.blobName?.includes("encrypted/")) || [];
  const publicBlobs = blobs?.filter((b) => b.blobName?.includes("public/")) || [];
  const allBlobs = blobs || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-semibold text-frost">Your Files</h2>
          <span className="px-2 py-0.5 rounded-md bg-obsidian-700 text-xs font-mono text-frost-muted border border-obsidian-600">
            {allBlobs.length} blob{allBlobs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => { refetch(); setRefreshKey((k) => k + 1); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-obsidian-600 bg-obsidian-800 text-frost-muted hover:text-frost hover:border-acid/30 transition-all text-xs font-mono"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {allBlobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={36} className="text-obsidian-600 mb-3" />
          <p className="font-display font-semibold text-frost-muted mb-1">No files yet</p>
          <p className="text-sm text-frost-muted/60 font-body">Upload your first file to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {encryptedBlobs.length > 0 && (
            <BlobSection
              title="Encrypted"
              icon={<Lock size={13} className="text-acid" />}
              blobs={encryptedBlobs}
              badge="E2E"
              badgeColor="text-acid"
            />
          )}
          {publicBlobs.length > 0 && (
            <BlobSection
              title="Public"
              icon={<Globe size={13} className="text-info" />}
              blobs={publicBlobs}
              badge="PUBLIC"
              badgeColor="text-info"
            />
          )}
        </div>
      )}
    </div>
  );
}

function BlobSection({
  title, icon, blobs, badge, badgeColor,
}: {
  title: string;
  icon: React.ReactNode;
  blobs: any[];
  badge: string;
  badgeColor: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        {icon}
        <span className="text-xs font-mono text-frost-muted uppercase tracking-widest">{title}</span>
        <span className="text-xs font-mono text-frost-muted/50">({blobs.length})</span>
      </div>

      <div className="rounded-xl border border-obsidian-600 overflow-hidden bg-obsidian-900">
        {blobs.map((blob, idx) => (
          <BlobRow key={idx} blob={blob} badge={badge} badgeColor={badgeColor} isLast={idx === blobs.length - 1} />
        ))}
      </div>
    </div>
  );
}

function BlobRow({ blob, badge, badgeColor, isLast }: { blob: any; badge: string; badgeColor: string; isLast: boolean }) {
  const name = formatBlobName(blob.blobName || "");
  const fileType = getFileType(name);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-obsidian-800 transition-colors group ${!isLast ? "border-b border-obsidian-700" : ""}`}>
      {/* Type badge */}
      <div className="w-9 h-9 rounded-lg bg-obsidian-800 border border-obsidian-600 flex items-center justify-center flex-shrink-0 group-hover:border-obsidian-500">
        <span className="text-[9px] font-mono font-bold text-frost-muted tracking-wider">{fileType}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-frost truncate">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-mono ${badgeColor} opacity-70`}>{badge}</span>
          {blob.size && (
            <>
              <span className="text-frost-muted/30">·</span>
              <span className="text-xs text-frost-muted">{formatBytes(blob.size)}</span>
            </>
          )}
          {blob.expirationMicros && (
            <>
              <span className="text-frost-muted/30">·</span>
              <span className="flex items-center gap-1 text-xs text-frost-muted">
                <Clock size={10} />
                {formatDate(blob.expirationMicros)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={`https://explorer.shelby.xyz/testnet/blob/${blob.blobName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-obsidian-700 text-frost-muted hover:text-frost transition-colors"
          title="View on explorer"
        >
          <ExternalLink size={13} />
        </a>
        <a
          href={`https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${blob.blobName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-obsidian-700 text-frost-muted hover:text-frost transition-colors"
          title="Download"
        >
          <Download size={13} />
        </a>
      </div>
    </div>
  );
}
