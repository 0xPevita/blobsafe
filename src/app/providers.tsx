"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import type { PropsWithChildren } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        autoConnect
        dappConfig={{
          network: Network.SHELBYNET,
          aptosApiKeys: {
            shelbynet: process.env.NEXT_PUBLIC_APTOS_API_KEY,
          },
        }}
      >
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}
