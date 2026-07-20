import { invoke } from "@tauri-apps/api/core";

export function hasDesktopClipboardRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function readDesktopClipboardText() {
  if (!hasDesktopClipboardRuntime()) return "";

  try {
    return await invoke<string>("desktop_read_clipboard_text");
  } catch {
    return "";
  }
}

export async function writeDesktopClipboardText(text: string) {
  if (!text || !hasDesktopClipboardRuntime()) return false;

  try {
    await invoke<void>("desktop_write_clipboard_text", { text });
    return true;
  } catch {
    return false;
  }
}
