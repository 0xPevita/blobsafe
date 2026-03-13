"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Upload, X, File, Lock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatBytes, getDefaultExpiration, getFileType } from "@/lib/shelby";
import { deriveKey, encryptData, packEncrypted, computeHash } from "@/lib/encryption";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { Network } from "@aptos-labs/ts-sdk";

interface UploadFile {
  file: File;
  id: string;
  status: "pending" | "encrypting" | "uploading" | "done" | "error";
  progress: number;
  hash?: string;
  error?: string;
}

interface FileUploadProps {
  onUploadComplete?: () => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadFiles: UploadFile[] = fileArray.map((f) => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleUploadAll = async () => {
    if (!connected || !account || !signAndSubmitTransaction) return;

    const shelbyClient = new ShelbyClient({
      network: Network.SHELBYNET,
      apiKey: process.env.NEXT_PUBLIC_APTOS_API_KEY,
    });

    let encKey: CryptoKey | null = null;
    if (encrypt) {
      encKey = await deriveKey(account.address.toString());
    }

    for (const uploadFile of files) {
      if (uploadFile.status !== "pending") continue;

      try {
        // Step 1: Read file
        const arrayBuffer = await uploadFile.file.arrayBuffer();
        let blobData = new Uint8Array(arrayBuffer);

        // Step 2: Encrypt
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: "encrypting", progress: 20 } : f
          )
        );

        const fileHash = await computeHash(blobData);

        if (encrypt && encKey) {
          const { encrypted, iv } = await encryptData(blobData, encKey);
          blobData = packEncrypted(encrypted, iv) as Uint8Array<ArrayBuffer>; // fix: cast to Uint8Array<ArrayBuffer>
        }

        // Step 3: Upload
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: "uploading", progress: 50 } : f
          )
        );

        const blobName = encrypt
          ? `blobsafe/encrypted/${uploadFile.file.name}`
          : `blobsafe/public/${uploadFile.file.name}`;

        await shelbyClient.upload({
          signer: account as any,
          blobData,
          blobName,
          expirationMicros: getDefaultExpiration(),
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: "done", progress: 100, hash: fileHash }
              : f
          )
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: "error", error: err?.message || "Upload failed" }
              : f
          )
        );
      }
    }

    onUploadComplete?.();
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const isUploading = files.some((f) => f.status === "uploading" || f.status === "encrypting");

  if (!connected) {
    return (
      <div className="rounded-xl border border-dashed border-obsidian-600 p-12 text-center">
        <Lock size={32} className="mx-auto mb-3 text-frost-muted" />
        <p className="text-frost-muted font-body">Connect your wallet to upload files</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encryption toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-obsidian-800 border border-obsidian-600">
        <div className="flex items-center gap-2">
          <Lock size={14} className={encrypt ? "text-acid" : "text-frost-muted"} />
          <span className="text-sm font-mono text-frost-dim">AES-256-GCM encryption</span>
        </div>
        <button
          onClick={() => setEncrypt(!encrypt)}
          className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
            encrypt ? "bg-acid" : "bg-obsidian-500"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-obsidian-950 transition-transform duration-200 ${
              encrypt ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-acid bg-acid/5 drop-zone-active"
            : "border-obsidian-600 bg-obsidian-900 hover:border-acid/30 hover:bg-obsidian-800"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <Upload size={28} className={`mx-auto mb-3 transition-colors ${isDragging ? "text-acid" : "text-frost-muted"}`} />
        <p className="font-display font-semibold text-frost mb-1">
          {isDragging ? "Drop files here" : "Drag & drop files"}
        </p>
        <p className="text-sm text-frost-muted font-body">or click to browse • any file type</p>
        {encrypt && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-acid/10 border border-acid/20">
            <Lock size={10} className="text-acid" />
            <span className="text-xs font-mono text-acid">E2E ENCRYPTED</span>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-obsidian-800 border border-obsidian-600 animate-fade-up"
            >
              {/* File type badge */}
              <div className="w-10 h-10 rounded-lg bg-obsidian-700 border border-obsidian-600 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-mono font-bold text-frost-muted tracking-wider">
                  {getFileType(f.file.name)}
                </span>
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-frost truncate">{f.file.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-frost-muted">{formatBytes(f.file.size)}</span>
                  {f.hash && (
                    <span className="text-xs font-mono text-frost-muted truncate max-w-[120px]">
                      #{f.hash.slice(0, 8)}
                    </span>
                  )}
                </div>
                {(f.status === "uploading" || f.status === "encrypting") && (
                  <div className="mt-1.5 h-1 bg-obsidian-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-acid rounded-full transition-all duration-500"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.error && <p className="text-xs text-danger mt-0.5">{f.error}</p>}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {f.status === "pending" && (
                  <button onClick={() => removeFile(f.id)} className="text-frost-muted hover:text-danger transition-colors">
                    <X size={14} />
                  </button>
                )}
                {(f.status === "encrypting" || f.status === "uploading") && (
                  <div className="flex items-center gap-1.5">
                    <Loader2 size={14} className="text-acid animate-spin" />
                    <span className="text-xs font-mono text-acid">
                      {f.status === "encrypting" ? "ENCRYPTING" : "UPLOADING"}
                    </span>
                  </div>
                )}
                {f.status === "done" && <CheckCircle2 size={16} className="text-acid" />}
                {f.status === "error" && <AlertCircle size={16} className="text-danger" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {pendingCount > 0 && (
        <button
          onClick={handleUploadAll}
          disabled={isUploading}
          className="w-full py-3 rounded-lg bg-acid text-obsidian-950 font-display font-bold text-sm hover:bg-acid-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 glow-acid flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload size={16} />
              Upload {pendingCount} file{pendingCount > 1 ? "s" : ""}
              {encrypt ? " (Encrypted)" : ""}
            </>
          )}
        </button>
      )}
    </div>
  );
}
