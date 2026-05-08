'use client'

import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react'
import { HAS_SHELBY_API_KEY, SHELBY_API_KEY, SHELBY_NETWORK, SHELBY_NETWORK_NAME } from '@/lib/shelby'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <AptosWalletAdapterProvider
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
      onError={(error) => console.error('[WalletProvider]', error)}
    >
      {children}
    </AptosWalletAdapterProvider>
  )
}
