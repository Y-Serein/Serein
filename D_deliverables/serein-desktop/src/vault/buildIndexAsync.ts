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
        console.warn("Vault index worker failed; falling back to main thread", event.data.error);
        worker = null;
        resolvedWorker.terminate();
        resolve(buildVaultIndex(root, response));
        return;
      }
      if (!event.data.index) {
        console.warn("Vault index worker returned no index; falling back to main thread");
        worker = null;
        resolvedWorker.terminate();
        resolve(buildVaultIndex(root, response));
        return;
      }
      resolve(event.data.index);
    }
    function handleError(event: ErrorEvent) {
      cleanup();
      console.warn("Vault index worker errored; falling back to main thread", event.message || event);
      worker = null;
      resolvedWorker.terminate();
      resolve(buildVaultIndex(root, response));
    }

    resolvedWorker.addEventListener("message", handleMessage);
    resolvedWorker.addEventListener("error", handleError);
    try {
      resolvedWorker.postMessage({ id, root, response } satisfies BuildVaultIndexWorkerRequest);
    } catch (error) {
      cleanup();
      console.warn("Vault index worker postMessage failed; falling back to main thread", error);
      worker = null;
      resolvedWorker.terminate();
      resolve(buildVaultIndex(root, response));
    }
  });
}
