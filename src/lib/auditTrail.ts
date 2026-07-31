import { getNetworkScopedStorageKey, SHELBY_NETWORK_LABEL, truncateAddress } from "@/lib/shelby";

const AUDIT_STORAGE_KEY = "blobsafe-audit-events";
const MAX_AUDIT_EVENTS = 160;

export type AuditEventType =
  | "file_registered"
  | "access_granted"
  | "access_revoked"
  | "file_deleted"
  | "receipt_backup"
  | "receipt_restored";

export type AuditEventSource = "aptos" | "shelby" | "local";

export type AuditEvent = {
  id: string;
  account: string;
  type: AuditEventType;
  source: AuditEventSource;
  createdAt: string;
  blobName?: string;
  fileName?: string;
  txHash?: string;
  recipient?: string;
  message?: string;
};

export function readAuditEvents(account?: string): AuditEvent[] {
  if (!account || typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(getNetworkScopedStorageKey(AUDIT_STORAGE_KEY, account));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((event): event is AuditEvent => isAuditEvent(event, account))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

export function readAuditEventsForBlob(account: string | undefined, blobName: string): AuditEvent[] {
  return readAuditEvents(account).filter((event) => event.blobName === blobName);
}

export function recordAuditEvent(event: Omit<AuditEvent, "id" | "createdAt"> & Partial<Pick<AuditEvent, "id" | "createdAt">>) {
  if (!event.account || typeof window === "undefined") return;

  const nextEvent: AuditEvent = {
    id: event.id || createAuditId(event.type),
    createdAt: event.createdAt || new Date().toISOString(),
    account: event.account,
    type: event.type,
    source: event.source,
    blobName: event.blobName,
    fileName: event.fileName,
    txHash: event.txHash,
    recipient: event.recipient,
    message: event.message,
  };

  const events = readAuditEvents(event.account).filter((stored) => stored.id !== nextEvent.id);
  const next = [nextEvent, ...events].slice(0, MAX_AUDIT_EVENTS);
  window.localStorage.setItem(getNetworkScopedStorageKey(AUDIT_STORAGE_KEY, event.account), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("blobsafe:audit-updated"));
}

export function getAuditEventTitle(type: AuditEventType) {
  switch (type) {
    case "file_registered":
      return "File registered";
    case "access_granted":
      return "Access granted";
    case "access_revoked":
      return "Access revoked";
    case "file_deleted":
      return "File deleted";
    case "receipt_backup":
      return "Recovery point saved";
    case "receipt_restored":
      return "Receipts restored";
  }
}

export function getAuditEventCopy(event: AuditEvent) {
  if (event.message) return event.message;
  switch (event.type) {
    case "file_registered":
      return `Ownership metadata committed on ${SHELBY_NETWORK_LABEL}.`;
    case "access_granted":
      return event.recipient
        ? `Recipient ${truncateAddress(event.recipient)} can request the wrapped file key.`
        : "A recipient grant was written on-chain.";
    case "access_revoked":
      return event.recipient
        ? `Recipient ${truncateAddress(event.recipient)} was removed from the access registry.`
        : "A recipient grant was revoked on-chain.";
    case "file_deleted":
      return "Blob metadata was removed from the owner account.";
    case "receipt_backup":
      return "Wallet-encrypted receipts were saved for device recovery.";
    case "receipt_restored":
      return "Wallet-encrypted receipts were restored into this browser scope.";
  }
}

function isAuditEvent(value: unknown, account: string): value is AuditEvent {
  const event = value as Partial<AuditEvent> | null;
  return Boolean(
    event &&
    typeof event.id === "string" &&
    typeof event.account === "string" &&
    event.account.toLowerCase() === account.toLowerCase() &&
    typeof event.type === "string" &&
    typeof event.source === "string" &&
    typeof event.createdAt === "string"
  );
}

function createAuditId(type: AuditEventType) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
