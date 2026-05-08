import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { ShelbyClientProvider } from "@shelby-protocol/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import {
  HAS_SHELBY_API_KEY,
  SHELBY_API_KEY,
  SHELBY_NETWORK,
  SHELBY_NETWORK_NAME,
  shelbyClient,
} from "@/lib/shelby";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

export function DappProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShelbyClientProvider client={shelbyClient}>
        <AptosWalletAdapterProvider
          key={SHELBY_NETWORK_NAME}
          autoConnect
          dappConfig={{
            network: SHELBY_NETWORK,
            ...(HAS_SHELBY_API_KEY
              ? {
                  aptosApiKeys: {
                    [SHELBY_NETWORK_NAME]: SHELBY_API_KEY,
                  },
                }
              : {}),
          }}
        >
          {children}
        </AptosWalletAdapterProvider>
      </ShelbyClientProvider>
    </QueryClientProvider>
  );
}
