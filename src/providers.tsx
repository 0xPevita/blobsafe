import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import {
  SHELBY_NETWORK_LABEL,
  SHELBY_NETWORK_NAME,
  SHELBY_NETWORK_OPTIONS,
  setPreferredShelbyNetwork,
  type ShelbyNetworkName,
} from "@/lib/shelbyNetwork";

type ShelbyNetworkContextValue = {
  networkName: ShelbyNetworkName;
  networkLabel: string;
  pendingNetworkName: ShelbyNetworkName | null;
  setNetworkName: (network: ShelbyNetworkName) => void;
};

const ShelbyNetworkContext = createContext<ShelbyNetworkContextValue | null>(null);

export function useShelbyNetwork() {
  const value = useContext(ShelbyNetworkContext);
  if (!value) {
    throw new Error("useShelbyNetwork must be used inside Providers.");
  }
  return value;
}

export function Providers({ children }: PropsWithChildren) {
  const [networkName] = useState<ShelbyNetworkName>(SHELBY_NETWORK_NAME);
  const [pendingNetworkName, setPendingNetworkName] = useState<ShelbyNetworkName | null>(null);
  const contextValue = useMemo<ShelbyNetworkContextValue>(() => ({
    networkName,
    networkLabel: SHELBY_NETWORK_LABEL,
    pendingNetworkName,
    setNetworkName: (nextNetwork) => {
      if (nextNetwork === SHELBY_NETWORK_NAME || pendingNetworkName) return;
      setPendingNetworkName(nextNetwork);
      setPreferredShelbyNetwork(nextNetwork);
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => window.location.reload(), prefersReducedMotion ? 80 : 520);
    },
  }), [networkName, pendingNetworkName]);

  return (
    <ShelbyNetworkContext.Provider value={contextValue}>
      {children}
      {pendingNetworkName && <NetworkSwitchOverlay targetNetwork={pendingNetworkName} />}
    </ShelbyNetworkContext.Provider>
  );
}

function NetworkSwitchOverlay({ targetNetwork }: { targetNetwork: ShelbyNetworkName }) {
  const targetLabel =
    SHELBY_NETWORK_OPTIONS.find((option) => option.name === targetNetwork)?.label ?? "Shelby network";

  return (
    <div className="network-switch-overlay" role="status" aria-live="polite">
      <div className="network-switch-card">
        <span className="network-switch-card-orbit" aria-hidden="true" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--acid)]">
            Switching network
          </p>
          <p className="mt-1 font-display text-base font-semibold text-frost">
            {targetLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
