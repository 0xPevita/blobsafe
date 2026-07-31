"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import toast from "react-hot-toast";
import {
  computeHash,
  encryptData,
  generateFileKey,
  getWalletEncryptionKey,
  packForStorage,
  readFileAsArrayBuffer,
  wrapFileKey,
} from "@/lib/encryption";
import {
  formatFileSize,
  getBlobName,
  getDefaultExpiration,
  getWalletAccountAddress,
  uploadWalletBlobs,
} from "@/lib/shelby";
import { useFileStore } from "@/store/useFileStore";
import { saveStoredReceipt } from "@/lib/receipts";
import type { VaultFile } from "@/types";

const UPLOAD_TIMEOUT_MS = 90_000;
const UPLOAD_TX_OPTIONS = {
  build: {
    options: {
      maxGasAmount: 500_000,
    },
  },
};

export function useUpload() {
  const { account, connected, signAndSubmitTransaction, signMessage } = useWallet();
  const { addFile, setUploadProgress, clearUploadProgress, activeFolder } = useFileStore();
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!connected || !account || !signAndSubmitTransaction) {
        toast("Connect your wallet to upload files", { icon: "🔒" });
        return;
      }

      const address = getWalletAccountAddress(account);
      if (!address) {
        toast.error("Wallet account address is unavailable");
        return;
      }

      setIsUploading(true);

      for (const file of files) {
        const fileId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const blobName = getBlobName(address, createUniqueBlobFileName(file.name, fileId), activeFolder);

        const pendingFile: VaultFile = {
          id: fileId,
          name: file.name,
          encryptedName: blobName,
          size: file.size,
          encryptedSize: 0,
          mimeType: file.type || "application/octet-stream",
          folder: activeFolder,
          uploadedAt: new Date().toISOString(),
          sha256: "",
          status: "encrypting",
          isShared: false,
          sharedWith: [],
        };
        addFile(pendingFile);

        try {
          setUploadProgress({ fileId, fileName: file.name, stage: "encrypting", progress: 10 });
          const arrayBuffer = await readFileAsArrayBuffer(file);

          setUploadProgress({ fileId, fileName: file.name, stage: "encrypting", progress: 30 });
          const masterKey = await getWalletEncryptionKey(address, signMessage);

          setUploadProgress({ fileId, fileName: file.name, stage: "encrypting", progress: 60 });
          const plainBytes = new Uint8Array(arrayBuffer);
          const sha256 = await computeHash(plainBytes);
          const fileKey = await generateFileKey();
          const keyMetadata = await wrapFileKey(fileKey, masterKey);
          const { encrypted, iv } = await encryptData(plainBytes, fileKey);
          const packed = packForStorage(encrypted, iv);
          const expirationMicros = getDefaultExpiration();
          const receipt = {
            id: fileId,
            fileName: file.name,
            blobName,
            account: address,
            originalSize: file.size,
            storedSize: packed.byteLength,
            sha256,
            encryption: "AES-256-GCM" as const,
            expirationMicros,
            uploadedAt: new Date().toISOString(),
            folder: activeFolder,
            encryptionModel: "per-file-key-v1" as const,
            key: keyMetadata,
            receiptStorage: "local" as const,
          };

          setUploadProgress({ fileId, fileName: file.name, stage: "uploading", progress: 80 });
          await withTimeout(
            uploadWalletBlobs({
              signer: {
                account: address,
                publicKey: account?.publicKey,
                signAndSubmitTransaction,
                signMessage,
              },
              blobs: [{ blobName, blobData: packed }],
              expirationMicros,
              options: UPLOAD_TX_OPTIONS,
            }),
            UPLOAD_TIMEOUT_MS,
            "Shelby upload did not finish within 90 seconds."
          );

          saveStoredReceipt(receipt);

          setUploadProgress({ fileId, fileName: file.name, stage: "confirming", progress: 100 });
          useFileStore.getState().updateFile(fileId, {
            encryptedSize: packed.byteLength,
            sha256,
            blobId: blobName,
            status: "confirmed",
          });
          clearUploadProgress(fileId);

          toast.success(`🔐 Encrypted & stored: ${file.name} (${formatFileSize(file.size)})`);
        } catch (err) {
          console.error("[useUpload] Failed:", err);
          useFileStore.getState().updateFile(fileId, { status: "error" });
          clearUploadProgress(fileId);
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      setIsUploading(false);
    },
    [
      account,
      connected,
      signAndSubmitTransaction,
      signMessage,
      activeFolder,
      addFile,
      setUploadProgress,
      clearUploadProgress,
    ]
  );

  return { uploadFiles, isUploading };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

function createUniqueBlobFileName(fileName: string, uploadId: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const suffix = uploadId.split("-").pop()?.slice(0, 8) || uploadId.slice(0, 8);
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return `${fileName}--${suffix}`;
  }

  return `${fileName.slice(0, dotIndex)}--${suffix}${fileName.slice(dotIndex)}`;
}
