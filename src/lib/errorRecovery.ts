export type ErrorContext = "upload" | "download" | "delete" | "share" | "preview" | "runtime";

export type RecoveryHint = {
  title: string;
  message: string;
  action: string;
};

export function explainError(error: unknown, context: ErrorContext = "upload"): RecoveryHint {
  const raw = stringifyError(error);
  const message = raw.toLowerCase();

  if (matches(message, ["user rejected", "rejected", "denied", "cancel", "declined"])) {
    return {
      title: "Wallet request was not approved",
      message: "BlobSafe could not continue because the connected wallet did not sign the request.",
      action: "Open the wallet prompt again and approve it when you are ready.",
    };
  }

  if (matches(message, ["eself_grant", "self-grant", "self grant"])) {
    return {
      title: "Recipient is the owner wallet",
      message: "The connected owner already controls this file, so the access contract rejected a self-grant.",
      action: "Enter a different recipient wallet address, then create the grant again.",
    };
  }

  if (matches(message, ["out of gas", "max_gas", "insufficient_balance", "fee_payer", "gas"])) {
    return {
      title: "Transaction needs more gas",
      message: "The wallet simulation could not reserve enough gas for the Aptos transaction.",
      action: "Add test APT to this wallet, keep the default gas limit, then retry.",
    };
  }

  if (matches(message, ["401", "unauthorized", "api key", "bearer", "authorization"])) {
    return {
      title: "Shelby API key was rejected",
      message: "The active network endpoint requires a valid API key before BlobSafe can write data.",
      action: "Check the key in .env.local for the selected network and restart the dev server.",
    };
  }

  if (matches(message, ["maximum allowed length", "blob name exceeded", "name exceeded"])) {
    return {
      title: "Blob path is too long",
      message: "Shelby rejected the generated blob name because the folder path or file name exceeds the limit.",
      action: "Shorten the folder name or file name, then seal the file again.",
    };
  }

  if (matches(message, ["multipart", "internal server error", "status: 500", "500"])) {
    return {
      title: "Shelby upload did not finish",
      message: "The storage endpoint returned an internal error while accepting the file bytes.",
      action: "Retry once. If it repeats, switch network, shorten the blob path, or try a smaller file.",
    };
  }

  if (matches(message, ["expected magic word", "webassembly.compile", "wasm"])) {
    return {
      title: "Browser storage codec failed",
      message: "The browser loaded an invalid Shelby WebAssembly asset while preparing the file.",
      action: "Hard refresh the page. If the error remains, restart the dev server.",
    };
  }

  if (matches(message, ["could not find view function abi", "module_version", "runtime_status"])) {
    return {
      title: "Access contract does not match BlobSafe",
      message: "The configured contract address is not exposing the access-control module expected by this build.",
      action: "Use the deployed BlobSafe access contract for the selected network, then reload.",
    };
  }

  if (matches(message, ["needs init", "not initialized", "resource not found", "global storage item"])) {
    return {
      title: "Access registry needs initialization",
      message: "The contract is deployed, but one or more registry resources are missing.",
      action: "Initialize the file registry, access index, and recipient groups before using this network.",
    };
  }

  if (matches(message, ["integrity check failed", "hash mismatch", "sha"])) {
    return {
      title: "Integrity check failed",
      message: "The downloaded bytes do not match the SHA-256 hash stored in the BlobSafe receipt.",
      action: "Do not trust this copy. Refresh the file list and re-upload the original file if needed.",
    };
  }

  if (matches(message, ["wrong wallet", "decryption", "decrypt", "wallet that sealed", "local per-file key"])) {
    return {
      title: "This wallet cannot open the file",
      message: "The file is encrypted and the current browser or wallet does not have the required key receipt.",
      action: "Connect the owner wallet, restore receipts from Recovery, or import a valid access grant.",
    };
  }

  if (matches(message, ["404", "not found", "failed to download blob"])) {
    return {
      title: "Blob was not found on this network",
      message: "The selected path is not available for the connected account and Shelby network.",
      action: "Refresh the file list, confirm the active network, and check that the file was not deleted.",
    };
  }

  if (matches(message, ["timeout", "taking longer", "still settle"])) {
    return {
      title: "Transaction is still settling",
      message: "The request took longer than the app timeout, but the network may still commit it.",
      action: "Refresh Files before retrying so you do not create a duplicate upload.",
    };
  }

  return fallbackHint(raw, context);
}

export function formatRecoveryMessage(error: unknown, context: ErrorContext = "upload") {
  const hint = explainError(error, context);
  return `${hint.title}. ${hint.message} ${hint.action}`;
}

function fallbackHint(raw: string, context: ErrorContext): RecoveryHint {
  const task = context === "download"
    ? "download"
    : context === "delete"
      ? "delete"
      : context === "share"
        ? "access update"
        : context === "preview"
          ? "preview"
          : context === "runtime"
            ? "runtime check"
            : "upload";

  return {
    title: `${capitalize(task)} did not complete`,
    message: raw || "BlobSafe could not complete the request.",
    action: "Review the wallet prompt, network selection, and Shelby endpoint, then retry.",
  };
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function matches(message: string, terms: string[]) {
  return terms.some((term) => message.includes(term));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
