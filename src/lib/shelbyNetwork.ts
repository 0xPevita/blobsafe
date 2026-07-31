export type ShelbyNetworkName = "shelbynet" | "testnet";

const NETWORK_STORAGE_KEY = "blobsafe-shelby-network";

export const SHELBY_NETWORK_OPTIONS: Array<{
  name: ShelbyNetworkName;
  label: string;
  shortLabel: string;
}> = [
  { name: "shelbynet", label: "ShelbyNet", shortLabel: "Net" },
  { name: "testnet", label: "Shelby Testnet", shortLabel: "Test" },
];

export const SHELBY_NETWORK_CONFIG: Record<ShelbyNetworkName, {
  label: string;
  rpcUrl: string;
  fullnodeUrl: string;
  indexerUrl: string;
  explorerUrl: string;
}> = {
  shelbynet: {
    label: "ShelbyNet",
    rpcUrl: "https://api.shelbynet.shelby.xyz/shelby",
    fullnodeUrl: "https://api.shelbynet.shelby.xyz/v1",
    indexerUrl: "https://api.shelbynet.shelby.xyz/v1/graphql",
    explorerUrl: "https://explorer.shelby.xyz/shelbynet",
  },
  testnet: {
    label: "Shelby Testnet",
    rpcUrl: "https://api.testnet.shelby.xyz/shelby",
    fullnodeUrl: "https://api.testnet.aptoslabs.com/v1",
    indexerUrl: "https://api.testnet.shelby.xyz/v1/graphql",
    explorerUrl: "https://explorer.shelby.xyz/testnet",
  },
};

export const isShelbyNetworkName = (value: unknown): value is ShelbyNetworkName =>
  value === "shelbynet" || value === "testnet";

const getEnvNetworkName = (): ShelbyNetworkName => {
  const value = import.meta.env.VITE_SHELBY_NETWORK;
  return isShelbyNetworkName(value) ? value : "shelbynet";
};

export const getStoredNetworkName = (): ShelbyNetworkName => {
  if (typeof window === "undefined") return getEnvNetworkName();
  const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
  return isShelbyNetworkName(stored) ? stored : getEnvNetworkName();
};

export const SHELBY_NETWORK_NAME = getStoredNetworkName();
export const SHELBY_NETWORK_LABEL = SHELBY_NETWORK_CONFIG[SHELBY_NETWORK_NAME].label;
export const SHELBY_RPC_URL = SHELBY_NETWORK_CONFIG[SHELBY_NETWORK_NAME].rpcUrl;
export const SHELBY_FULLNODE_URL = SHELBY_NETWORK_CONFIG[SHELBY_NETWORK_NAME].fullnodeUrl;
export const SHELBY_INDEXER_URL = SHELBY_NETWORK_CONFIG[SHELBY_NETWORK_NAME].indexerUrl;
export const SHELBY_EXPLORER_URL = SHELBY_NETWORK_CONFIG[SHELBY_NETWORK_NAME].explorerUrl;

export const setPreferredShelbyNetwork = (network: ShelbyNetworkName) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
};

export const getNetworkScopedStorageKey = (baseKey: string, account?: string) => {
  const normalized = account?.trim().toLowerCase();
  return normalized
    ? `${baseKey}:${SHELBY_NETWORK_NAME}:${normalized}`
    : `${baseKey}:${SHELBY_NETWORK_NAME}`;
};
