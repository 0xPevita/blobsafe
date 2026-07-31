import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.wasm"],
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@shelby-protocol/clay-codes")) return "shelby-clay";
          if (id.includes("@shelby-protocol/sdk")) return "shelby-sdk";
          if (id.includes("@shelby-protocol/react")) return "shelby-react";
          if (
            id.includes("@aptos-labs") ||
            id.includes("@wallet-standard") ||
            id.includes("@mysten") ||
            id.includes("@identity-connect")
          ) return "aptos-vendor";
          if (id.includes("@noble") || id.includes("@scure")) return "crypto-vendor";
          if (id.includes("@tanstack/react-query")) return "query-vendor";
          if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) return "react-vendor";
          if (id.includes("framer-motion") || id.includes("lucide-react")) return "ui-vendor";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: [
      "@shelby-protocol/clay-codes",
      "@shelby-protocol/react",
      "@shelby-protocol/sdk",
      "@shelby-protocol/sdk/browser",
    ],
  },
  define: {
    "process.env": {},
    "process.env.SHELBY_ENCODING": JSON.stringify(""),
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
});
