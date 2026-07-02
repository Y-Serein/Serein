import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function readDesktopClipboardText() {
  if (!isTauriRuntime()) return "";

  try {
    return await invoke<string>("desktop_read_clipboard_text");
  } catch {
    return "";
  }
}

export function writeDesktopClipboardText(text: string) {
  if (!text || !isTauriRuntime()) return;
  invoke<void>("desktop_write_clipboard_text", { text }).catch(() => undefined);
}
