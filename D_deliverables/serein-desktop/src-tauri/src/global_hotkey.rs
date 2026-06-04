use tauri::{AppHandle, Manager};

pub fn reveal_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "Serein window not found.".to_string())?;

    let _ = window.show();
    let _ = window.unminimize();
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus Serein window: {error}"))
}

#[cfg(target_os = "windows")]
mod platform {
    use super::reveal_window;
    use std::{
        mem::zeroed,
        sync::{Mutex, OnceLock, mpsc},
        thread::{self, JoinHandle},
    };
    use tauri::AppHandle;
    use windows_sys::Win32::{
        Foundation::HWND,
        System::Threading::GetCurrentThreadId,
        UI::{
            Input::KeyboardAndMouse::{
                HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN,
                RegisterHotKey, UnregisterHotKey, VK_BACK, VK_DELETE, VK_DOWN, VK_END,
                VK_ESCAPE, VK_F1, VK_HOME, VK_INSERT, VK_LEFT, VK_NEXT, VK_PRIOR, VK_RETURN,
                VK_RIGHT, VK_SPACE, VK_TAB, VK_UP,
            },
            WindowsAndMessaging::{
                DispatchMessageW, GetMessageW, MSG, PM_NOREMOVE, PeekMessageW, PostThreadMessageW,
                TranslateMessage, WM_HOTKEY, WM_QUIT,
            },
        },
    };

    const HOTKEY_ID: i32 = 0x5345;

    struct HotkeyController {
        display: String,
        thread_id: u32,
        thread: JoinHandle<()>,
    }

    #[derive(Clone)]
    struct HotkeySpec {
        display: String,
        modifiers: HOT_KEY_MODIFIERS,
        key: u32,
    }

    static HOTKEY_CONTROLLER: OnceLock<Mutex<Option<HotkeyController>>> = OnceLock::new();

    pub fn configure(app: AppHandle, shortcut: Option<String>) -> Result<(), String> {
        let spec = match shortcut.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => Some(parse_shortcut(value)?),
            None => None,
        };

        let slot = HOTKEY_CONTROLLER.get_or_init(|| Mutex::new(None));
        let mut controller = slot
            .lock()
            .map_err(|_| "Global shortcut state is locked.".to_string())?;

        if let (Some(current), Some(next)) = (controller.as_ref(), spec.as_ref()) {
            if current.display == next.display {
                return Ok(());
            }
        }

        stop_current(&mut controller);

        let Some(spec) = spec else {
            return Ok(());
        };

        let (result_tx, result_rx) = mpsc::channel();
        let display = spec.display.clone();
        let thread = thread::spawn(move || run_hotkey_thread(app, spec, result_tx));

        let thread_id = result_rx
            .recv()
            .map_err(|_| "Global shortcut thread did not start.".to_string())??;

        *controller = Some(HotkeyController {
            display,
            thread_id,
            thread,
        });
        Ok(())
    }

    fn run_hotkey_thread(
        app: AppHandle,
        spec: HotkeySpec,
        result_tx: mpsc::Sender<Result<u32, String>>,
    ) {
        let thread_id = unsafe { GetCurrentThreadId() };
        let hwnd: HWND = std::ptr::null_mut();
        unsafe {
            let mut message: MSG = zeroed();
            let _ = PeekMessageW(&mut message, hwnd, WM_HOTKEY, WM_HOTKEY, PM_NOREMOVE);
        }
        let registered = unsafe {
            RegisterHotKey(hwnd, HOTKEY_ID, spec.modifiers | MOD_NOREPEAT, spec.key)
        };

        if registered == 0 {
            let _ = result_tx.send(Err(format!("Failed to register global shortcut: {}", spec.display)));
            return;
        }

        let _ = result_tx.send(Ok(thread_id));

        unsafe {
            let mut message: MSG = zeroed();
            while GetMessageW(&mut message, hwnd, 0, 0) > 0 {
                if message.message == WM_HOTKEY && message.wParam == HOTKEY_ID as usize {
                    let _ = reveal_window(&app);
                    continue;
                }
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            UnregisterHotKey(hwnd, HOTKEY_ID);
        }
    }

    fn stop_current(controller: &mut Option<HotkeyController>) {
        let Some(current) = controller.take() else {
            return;
        };

        unsafe {
            PostThreadMessageW(current.thread_id, WM_QUIT, 0, 0);
        }
        let _ = current.thread.join();
    }

    fn parse_shortcut(shortcut: &str) -> Result<HotkeySpec, String> {
        let mut modifiers: HOT_KEY_MODIFIERS = 0;
        let mut key: Option<u32> = None;

        for raw_part in shortcut.split('+') {
            let part = raw_part.trim();
            if part.is_empty() {
                continue;
            }

            match part.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => modifiers |= MOD_CONTROL,
                "shift" => modifiers |= MOD_SHIFT,
                "alt" | "option" => modifiers |= MOD_ALT,
                "meta" | "cmd" | "command" | "win" => modifiers |= MOD_WIN,
                _ => {
                    if key.is_some() {
                        return Err(format!("Global shortcut has more than one key: {shortcut}"));
                    }
                    key = Some(vk_from_key(part).ok_or_else(|| {
                        format!("Unsupported global shortcut key: {part}")
                    })?);
                }
            }
        }

        if modifiers == 0 {
            return Err("Global shortcut must include Ctrl, Alt, Shift, or Win.".to_string());
        }

        let Some(key) = key else {
            return Err("Global shortcut is missing a key.".to_string());
        };

        Ok(HotkeySpec {
            display: shortcut.to_string(),
            modifiers,
            key,
        })
    }

    fn vk_from_key(key: &str) -> Option<u32> {
        let upper = key.to_ascii_uppercase();
        if upper.len() == 1 {
            let byte = upper.as_bytes()[0];
            if byte.is_ascii_alphanumeric() {
                return Some(byte as u32);
            }
        }

        if let Some(number) = upper.strip_prefix('F').and_then(|value| value.parse::<u32>().ok()) {
            if (1..=24).contains(&number) {
                return Some(VK_F1 as u32 + number - 1);
            }
        }

        match upper.as_str() {
            "ESC" | "ESCAPE" => Some(VK_ESCAPE as u32),
            "SPACE" => Some(VK_SPACE as u32),
            "TAB" => Some(VK_TAB as u32),
            "ENTER" | "RETURN" => Some(VK_RETURN as u32),
            "BACKSPACE" => Some(VK_BACK as u32),
            "DELETE" | "DEL" => Some(VK_DELETE as u32),
            "INSERT" | "INS" => Some(VK_INSERT as u32),
            "HOME" => Some(VK_HOME as u32),
            "END" => Some(VK_END as u32),
            "PAGEUP" | "PAGE UP" => Some(VK_PRIOR as u32),
            "PAGEDOWN" | "PAGE DOWN" => Some(VK_NEXT as u32),
            "ARROWLEFT" | "LEFT" => Some(VK_LEFT as u32),
            "ARROWRIGHT" | "RIGHT" => Some(VK_RIGHT as u32),
            "ARROWUP" | "UP" => Some(VK_UP as u32),
            "ARROWDOWN" | "DOWN" => Some(VK_DOWN as u32),
            _ => None,
        }
    }
}

#[cfg(target_os = "windows")]
pub fn configure_global_reveal_shortcut(app: AppHandle, shortcut: Option<String>) -> Result<(), String> {
    platform::configure(app, shortcut)
}

#[cfg(not(target_os = "windows"))]
pub fn configure_global_reveal_shortcut(_app: AppHandle, _shortcut: Option<String>) -> Result<(), String> {
    Ok(())
}
