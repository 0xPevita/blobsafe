import type { ShareGrant } from "@/lib/shareGrants";
import { getNetworkScopedStorageKey } from "@/lib/shelby";

const SENT_SHARE_PACKAGES_KEY = "blobsafe-sent-share-packages";

export type SentSharePackage =
  | {
      id: string;
      mode: "single";
      createdAt: string;
      ownerAccount: string;
      blobName: string;
      recipient: string;
      grant: ShareGrant;
      accessCode: string;
    }
  | {
      id: string;
      mode: "team";
      createdAt: string;
      ownerAccount: string;
      blobName: string;
      teamName: string;
      grants: Array<{ recipient: string; grant: ShareGrant; accessCode: string }>;
    };

const storageKeyForOwner = (ownerAccount?: string) =>
  getNetworkScopedStorageKey(SENT_SHARE_PACKAGES_KEY, ownerAccount);

export function readSentSharePackages(ownerAccount?: string): SentSharePackage[] {
  try {
    const stored = window.localStorage.getItem(storageKeyForOwner(ownerAccount));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isSentSharePackage) : [];
  } catch {
    return [];
  }
}

export function readSentSharePackagesForBlob(ownerAccount: string, blobName: string) {
  return readSentSharePackages(ownerAccount).filter((item) => item.blobName === blobName);
}

export function saveSentSharePackage(packagePayload: SentSharePackage) {
  const packages = readSentSharePackages(packagePayload.ownerAccount);
  const next = [
    packagePayload,
    ...packages.filter((item) => item.id !== packagePayload.id),
  ].slice(0, 100);
  window.localStorage.setItem(storageKeyForOwner(packagePayload.ownerAccount), JSON.stringify(next));
}

function isSentSharePackage(value: unknown): value is SentSharePackage {
  const item = value as SentSharePackage | null;
  if (!item || typeof item !== "object") return false;
  if (item.mode !== "single" && item.mode !== "team") return false;
  if (typeof item.id !== "string" || typeof item.ownerAccount !== "string" || typeof item.blobName !== "string") {
    return false;
  }

  if (item.mode === "single") {
    return Boolean(item.grant && typeof item.accessCode === "string" && typeof item.recipient === "string");
  }

  return Array.isArray(item.grants) && typeof item.teamName === "string";
}
