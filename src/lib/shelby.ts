import { Network } from "@aptos-labs/ts-sdk";

// Shelby network config
export const SHELBY_NETWORK = Network.SHELBYNET;

// Default expiration: 30 days from now (in microseconds)
export const getDefaultExpiration = () =>
  (Date.now() * 1000) + (30 * 24 * 60 * 60 * 1000 * 1000);

// Format bytes to human-readable
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Format blob name for display (strip account prefix)
export const formatBlobName = (blobName: string): string => {
  const parts = blobName.split("/");
  return parts[parts.length - 1] || blobName;
};

// Get file extension icon label
export const getFileType = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "PDF",
    png: "IMG", jpg: "IMG", jpeg: "IMG", gif: "IMG", webp: "IMG", svg: "IMG",
    mp4: "VID", mov: "VID", avi: "VID", mkv: "VID",
    mp3: "AUD", wav: "AUD", flac: "AUD",
    zip: "ZIP", tar: "ZIP", gz: "ZIP", rar: "ZIP",
    js: "CODE", ts: "CODE", py: "CODE", rs: "CODE", go: "CODE", sol: "CODE",
    json: "JSON", yaml: "YAML", toml: "TOML",
    md: "DOC", txt: "DOC", doc: "DOC", docx: "DOC",
    csv: "DATA", parquet: "DATA", xlsx: "DATA",
  };
  return map[ext] || "FILE";
};

// Truncate address for display
export const truncateAddress = (addr: string): string => {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

// Format date from microseconds
export const formatDate = (micros: number): string => {
  return new Date(micros / 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};
