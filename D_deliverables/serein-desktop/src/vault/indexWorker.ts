import type { VaultIndexResponse } from "../app/types";
import { buildVaultIndex } from "./index";

type BuildVaultIndexRequest = {
  id: number;
  root: string;
  response: VaultIndexResponse;
};

type BuildVaultIndexResponse = {
  id: number;
  index?: ReturnType<typeof buildVaultIndex>;
  error?: string;
};

self.onmessage = (event: MessageEvent<BuildVaultIndexRequest>) => {
  const { id, root, response } = event.data;

  try {
    const index = buildVaultIndex(root, response);
    self.postMessage({ id, index } satisfies BuildVaultIndexResponse);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies BuildVaultIndexResponse);
  }
};
