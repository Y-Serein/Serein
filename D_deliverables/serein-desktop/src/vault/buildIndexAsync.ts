import type { VaultIndexResponse } from "../app/types";
import { buildVaultIndex } from "./index";
import type { VaultIndex } from "./index";

type BuildVaultIndexWorkerRequest = {
  id: number;
  root: string;
  response: VaultIndexResponse;
};

type BuildVaultIndexWorkerResponse = {
  id: number;
  index?: VaultIndex;
  error?: string;
};

let worker: Worker | null = null;
let nextRequestId = 1;

function createVaultIndexWorker() {
  if (typeof Worker === "undefined") return null;

  try {
    return new Worker(new URL("./indexWorker.ts", import.meta.url), {
      type: "module",
      name: "serein-vault-index",
    });
  } catch (error) {
    console.warn("Failed to create vault index worker", error);
    return null;
  }
}

export function buildVaultIndexAsync(root: string, response: VaultIndexResponse): Promise<VaultIndex> {
  const activeWorker = worker ?? createVaultIndexWorker();
  if (!activeWorker) return Promise.resolve(buildVaultIndex(root, response));
  const resolvedWorker = activeWorker;
  worker = resolvedWorker;

  return new Promise<VaultIndex>((resolve, reject) => {
    const id = nextRequestId;
    nextRequestId += 1;

    function cleanup() {
      resolvedWorker.removeEventListener("message", handleMessage);
      resolvedWorker.removeEventListener("error", handleError);
    }
    function handleMessage(event: MessageEvent<BuildVaultIndexWorkerResponse>) {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      if (!event.data.index) {
        reject(new Error("Vault index worker returned no index."));
        return;
      }
      resolve(event.data.index);
    }
    function handleError(event: ErrorEvent) {
      cleanup();
      reject(new Error(event.message || "Vault index worker failed."));
    }

    resolvedWorker.addEventListener("message", handleMessage);
    resolvedWorker.addEventListener("error", handleError);
    resolvedWorker.postMessage({ id, root, response } satisfies BuildVaultIndexWorkerRequest);
  });
}
