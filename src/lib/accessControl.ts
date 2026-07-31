import type { InputTransactionData } from "@aptos-labs/wallet-adapter-react";
import type { StoredReceipt } from "@/lib/receipts";
import { normalizeAddress, SHELBY_NETWORK_NAME, shelbyClient } from "@/lib/shelby";

const rawContractAddress = SHELBY_NETWORK_NAME === "testnet"
  ? (
      import.meta.env.VITE_BLOBSAFE_TESTNET_CONTRACT_ADDRESS ||
      import.meta.env.VITE_BLOBSAFE_CONTRACT_ADDRESS ||
      ""
    )
  : (
      import.meta.env.VITE_BLOBSAFE_SHELBYNET_CONTRACT_ADDRESS ||
      import.meta.env.VITE_BLOBSAFE_CONTRACT_ADDRESS ||
      ""
    );

export const BLOBSAFE_ACCESS_CONTRACT_ADDRESS = normalizeContractAddress(rawContractAddress);
export const IS_ACCESS_CONTROL_CONFIGURED = Boolean(BLOBSAFE_ACCESS_CONTRACT_ADDRESS);
export const BLOBSAFE_ACCESS_MODULE = BLOBSAFE_ACCESS_CONTRACT_ADDRESS
  ? `${BLOBSAFE_ACCESS_CONTRACT_ADDRESS}::access_control`
  : "";
export const BLOBSAFE_ACCESS_STATUS = IS_ACCESS_CONTROL_CONFIGURED
  ? "configured"
  : "not configured";

const ACCESS_TX_OPTIONS: InputTransactionData["options"] = {
  gasUnitPrice: 100,
  maxGasAmount: 20_000,
};

type MoveFunctionId = `${string}::${string}::${string}`;
type SignAndSubmitTransaction = (transaction: InputTransactionData) => Promise<{ hash?: string }>;
export type GrantExpiryPreset = "3m" | "15m" | "1h" | "2h" | "6h" | "12h" | "24h" | "7d" | "30d";

export type AccessRuntimeStatus =
  | {
      status: "unconfigured";
      label: "needs setup";
      details: string;
      contractAddress: "";
      moduleAddress: "";
      registry: false;
      accessIndex: false;
      teamRegistry: false;
      grantExpiry: false;
      version: null;
    }
  | {
      status: "ready";
      label: "verified";
      details: string;
      contractAddress: string;
      moduleAddress: string;
      registry: true;
      accessIndex: true;
      teamRegistry: true;
      grantExpiry: boolean;
      version: number;
    }
  | {
      status: "incomplete";
      label: "needs init";
      details: string;
      contractAddress: string;
      moduleAddress: string;
      registry: boolean;
      accessIndex: boolean;
      teamRegistry: boolean;
      grantExpiry: boolean;
      version: number;
    }
  | {
      status: "invalid";
      label: "check address";
      details: string;
      contractAddress: string;
      moduleAddress: string;
      registry: false;
      accessIndex: false;
      teamRegistry: false;
      grantExpiry: false;
      version: null;
    };

export type AccessControlReceipt = {
  status: "registered" | "failed" | "unconfigured";
  moduleAddress?: string;
  txHash?: string;
  error?: string;
  registeredAt?: string;
};

export type OnChainGrantView = {
  exists: boolean;
  active: boolean;
  encryptedKey: string;
  grantedAtSecs: number;
  revokedAtSecs: number;
  expiresAtSecs: number;
  expired: boolean;
};

export type OnChainFileView = {
  exists: boolean;
  owner: string;
  blobName: string;
  fileName: string;
  sha256: string;
  size: number;
  expirationMicros: number;
  deleted: boolean;
};

export type OnChainTeamView = {
  exists: boolean;
  owner: string;
  id: string;
  name: string;
  active: boolean;
  createdAtSecs: number;
  updatedAtSecs: number;
  members: Array<{
    address: string;
    label: string;
    role: string;
  }>;
};

export function requireAccessControlConfigured() {
  if (!BLOBSAFE_ACCESS_MODULE) {
    throw new Error("Access registry needs setup for this network. Set the deployed BlobSafe contract address in .env.local.");
  }
}

export async function validateAccessControlRuntime(): Promise<AccessRuntimeStatus> {
  if (!BLOBSAFE_ACCESS_CONTRACT_ADDRESS || !BLOBSAFE_ACCESS_MODULE) {
    return {
      status: "unconfigured",
      label: "needs setup",
      details: "Set the deployed BlobSafe contract address for the active network.",
      contractAddress: "",
      moduleAddress: "",
      registry: false,
      accessIndex: false,
      teamRegistry: false,
      grantExpiry: false,
      version: null,
    };
  }

  try {
    const versionResult = await shelbyClient.coordination.aptos.view<[string | number]>({
      payload: {
        function: accessFunction("module_version"),
        functionArguments: [],
      },
    });
    const version = Number(versionResult[0] ?? 0);

    const statusResult = await shelbyClient.coordination.aptos.view<[boolean, boolean, boolean]>({
      payload: {
        function: accessFunction("runtime_status"),
        functionArguments: [],
      },
    });

    const registry = Boolean(statusResult[0]);
    const accessIndex = Boolean(statusResult[1]);
    const teamRegistry = Boolean(statusResult[2]);
    const grantExpiry = await getGrantExpiryRuntimeStatus();
    const missing = [
      registry ? "" : "file registry",
      accessIndex ? "" : "access index",
      teamRegistry ? "" : "recipient groups",
    ].filter(Boolean);

    if (registry && accessIndex && teamRegistry) {
      return {
        status: "ready",
        label: "verified",
        details: `BlobSafe access registry v${version} is live on this network.`,
        contractAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
        moduleAddress: BLOBSAFE_ACCESS_MODULE,
        registry: true,
        accessIndex: true,
        teamRegistry: true,
        grantExpiry,
        version,
      };
    }

    return {
      status: "incomplete",
      label: "needs init",
      details: `Initialize ${missing.join(", ")} before using on-chain access control.`,
      contractAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
      moduleAddress: BLOBSAFE_ACCESS_MODULE,
      registry,
      accessIndex,
      teamRegistry,
      grantExpiry,
      version,
    };
  } catch (error) {
    return {
      status: "invalid",
      label: "check address",
      details: error instanceof Error
        ? `Could not verify BlobSafe access module. ${error.message}`
        : "Could not verify BlobSafe access module on the active network.",
      contractAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
      moduleAddress: BLOBSAFE_ACCESS_MODULE,
      registry: false,
      accessIndex: false,
      teamRegistry: false,
      grantExpiry: false,
      version: null,
    };
  }
}

export async function registerFileOnChain({
  signAndSubmitTransaction,
  receipt,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  receipt: StoredReceipt;
}) {
  requireAccessControlConfigured();

  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction("register_file"),
      functionArguments: [
        receipt.blobName,
        receipt.fileName,
        receipt.sha256,
        receipt.originalSize,
        receipt.expirationMicros,
      ],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

export async function grantAccessOnChain({
  signAndSubmitTransaction,
  blobName,
  recipient,
  encryptedKey,
  expiresAtSecs = 0,
  expiryPreset,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  blobName: string;
  recipient: string;
  encryptedKey: string;
  expiresAtSecs?: number;
  expiryPreset?: GrantExpiryPreset;
}) {
  requireAccessControlConfigured();

  const normalizedRecipient = normalizeAddress(recipient).trim();
  if (!/^0x[a-fA-F0-9]+$/.test(normalizedRecipient)) {
    throw new Error("Recipient must be a valid Aptos address.");
  }

    const grantTx = await signAndSubmitTransaction({
      data: {
      function: accessFunction(expiryPreset ? `grant_access_timed_${expiryPreset}` : "grant_access"),
      functionArguments: [blobName, normalizedRecipient, encryptedKey],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (grantTx.hash) {
    await waitForOnChainTransaction(grantTx.hash);
  }

  return grantTx.hash;
}

export async function setGrantExpiryPresetOnChain({
  signAndSubmitTransaction,
  blobName,
  recipient,
  preset,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  blobName: string;
  recipient: string;
  preset: GrantExpiryPreset;
}) {
  requireAccessControlConfigured();

  const normalizedRecipient = normalizeAddress(recipient).trim();
  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction(`set_grant_expiry_${preset}`),
      functionArguments: [blobName, normalizedRecipient],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

async function getGrantExpiryRuntimeStatus(): Promise<boolean> {
  try {
    const result = await shelbyClient.coordination.aptos.view<[boolean]>({
      payload: {
        function: accessFunction("grant_expiry_ledger_status"),
        functionArguments: [],
      },
    });
    if (Boolean(result[0])) return true;
  } catch {
    // Older deployments expose only the legacy expiry index.
  }

  try {
    const result = await shelbyClient.coordination.aptos.view<[boolean]>({
      payload: {
        function: accessFunction("grant_expiry_status"),
        functionArguments: [],
      },
    });
    return Boolean(result[0]);
  } catch {
    return false;
  }
}

export async function revokeAccessOnChain({
  signAndSubmitTransaction,
  blobName,
  recipient,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  blobName: string;
  recipient: string;
}) {
  requireAccessControlConfigured();

  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction("revoke_access"),
      functionArguments: [blobName, normalizeAddress(recipient).trim()],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

export async function markBlobDeletedOnChain({
  signAndSubmitTransaction,
  blobName,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  blobName: string;
}) {
  requireAccessControlConfigured();

  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction("mark_deleted"),
      functionArguments: [blobName],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

export async function upsertTeamOnChain({
  signAndSubmitTransaction,
  teamId,
  name,
  memberAddresses,
  memberLabels,
  memberRoles,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  teamId: string;
  name: string;
  memberAddresses: string[];
  memberLabels: string[];
  memberRoles: string[];
}) {
  requireAccessControlConfigured();

  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction("upsert_team"),
      functionArguments: [
        teamId,
        name,
        memberAddresses.map((address) => normalizeAddress(address).trim()),
        memberLabels,
        memberRoles,
      ],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

export async function deleteTeamOnChain({
  signAndSubmitTransaction,
  teamId,
}: {
  signAndSubmitTransaction: SignAndSubmitTransaction;
  teamId: string;
}) {
  requireAccessControlConfigured();

  const tx = await signAndSubmitTransaction({
    data: {
      function: accessFunction("delete_team"),
      functionArguments: [teamId],
    },
    options: ACCESS_TX_OPTIONS,
  });

  if (tx.hash) {
    await waitForOnChainTransaction(tx.hash);
  }

  return tx.hash;
}

export async function getOnChainGrant(blobName: string, recipient: string): Promise<OnChainGrantView> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[boolean, boolean, string, string | number, string | number]>({
    payload: {
      function: accessFunction("get_grant"),
      functionArguments: [blobName, normalizeAddress(recipient).trim()],
    },
  });
  const [expiresAtSecs, expired] = await getOnChainGrantExpiry(blobName, recipient);

  return {
    exists: Boolean(result[0]),
    active: Boolean(result[1]),
    encryptedKey: String(result[2] ?? ""),
    grantedAtSecs: Number(result[3] ?? 0),
    revokedAtSecs: Number(result[4] ?? 0),
    expiresAtSecs,
    expired,
  };
}

export async function getOnChainGrantExpiry(blobName: string, recipient: string): Promise<[number, boolean]> {
  requireAccessControlConfigured();

  try {
    const ledgerResult = await shelbyClient.coordination.aptos.view<[boolean, string | number, boolean]>({
      payload: {
        function: accessFunction("get_grant_expiry_v2"),
        functionArguments: [blobName, normalizeAddress(recipient).trim()],
      },
    });
    if (Boolean(ledgerResult[0])) {
      return [Number(ledgerResult[1] ?? 0), Boolean(ledgerResult[2])];
    }
  } catch {
    // Older deployments do not expose the flat expiry ledger yet.
  }

  try {
    const result = await shelbyClient.coordination.aptos.view<[boolean, string | number, boolean]>({
      payload: {
        function: accessFunction("get_grant_expiry"),
        functionArguments: [blobName, normalizeAddress(recipient).trim()],
      },
    });
    return [Boolean(result[0]) ? Number(result[1] ?? 0) : 0, Boolean(result[2])];
  } catch {
    return [0, false];
  }
}

export async function getOnChainOwnerTeamIds(owner: string): Promise<string[]> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[string[]]>({
    payload: {
      function: accessFunction("get_owner_team_ids"),
      functionArguments: [normalizeAddress(owner).trim()],
    },
  });

  return Array.isArray(result[0]) ? result[0].map((id) => String(id)) : [];
}

export async function getOnChainTeam(teamId: string): Promise<OnChainTeamView> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[
    boolean,
    string,
    string,
    string,
    boolean,
    string | number,
    string | number,
    string[],
    string[],
    string[],
  ]>({
    payload: {
      function: accessFunction("get_team"),
      functionArguments: [teamId],
    },
  });

  const addresses = Array.isArray(result[7]) ? result[7] : [];
  const labels = Array.isArray(result[8]) ? result[8] : [];
  const roles = Array.isArray(result[9]) ? result[9] : [];

  return {
    exists: Boolean(result[0]),
    owner: String(result[1] ?? ""),
    id: String(result[2] ?? ""),
    name: String(result[3] ?? ""),
    active: Boolean(result[4]),
    createdAtSecs: Number(result[5] ?? 0),
    updatedAtSecs: Number(result[6] ?? 0),
    members: addresses.map((address, index) => ({
      address: String(address),
      label: String(labels[index] ?? ""),
      role: String(roles[index] ?? "viewer"),
    })),
  };
}

export async function getOnChainTeamsForOwner(owner: string): Promise<OnChainTeamView[]> {
  const ids = await getOnChainOwnerTeamIds(owner);
  const teams = await Promise.all(ids.map((id) => getOnChainTeam(id)));
  return teams.filter((team) => team.exists && team.active);
}

export async function getOnChainFile(blobName: string): Promise<OnChainFileView> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[
    boolean,
    string,
    string,
    string,
    string,
    string | number,
    string | number,
    boolean,
  ]>({
    payload: {
      function: accessFunction("get_file"),
      functionArguments: [blobName],
    },
  });

  return {
    exists: Boolean(result[0]),
    owner: String(result[1] ?? ""),
    blobName: String(result[2] ?? ""),
    fileName: String(result[3] ?? ""),
    sha256: String(result[4] ?? ""),
    size: Number(result[5] ?? 0),
    expirationMicros: Number(result[6] ?? 0),
    deleted: Boolean(result[7]),
  };
}

export async function getOnChainRecipients(blobName: string): Promise<string[]> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[string[]]>({
    payload: {
      function: accessFunction("get_recipients"),
      functionArguments: [blobName],
    },
  });

  return Array.isArray(result[0]) ? result[0].map((address) => String(address)) : [];
}

export async function hasOnChainAccess(blobName: string, user: string): Promise<boolean> {
  requireAccessControlConfigured();

  const result = await shelbyClient.coordination.aptos.view<[boolean]>({
    payload: {
      function: accessFunction("has_access"),
      functionArguments: [blobName, normalizeAddress(user).trim()],
    },
  });

  return Boolean(result[0]);
}

export function buildGrantCiphertextPayload(wrappedFileKey: unknown): string {
  return JSON.stringify(wrappedFileKey);
}

export async function waitForOnChainTransaction(txHash: string) {
  await shelbyClient.coordination.aptos.waitForTransaction({
    transactionHash: txHash,
    options: { waitForIndexer: true },
  });
}

function normalizeContractAddress(value: string): string {
  const normalized = normalizeAddress(value).trim();
  if (
    !normalized ||
    normalized.includes("your_contract_address") ||
    normalized.includes("0xyour")
  ) {
    return "";
  }
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function accessFunction(name: string): MoveFunctionId {
  return `${BLOBSAFE_ACCESS_MODULE}::${name}` as MoveFunctionId;
}
