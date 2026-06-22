use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{webview::Color, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const QUICK_NOTE_LABEL_PREFIX: &str = "quick-note-";
const QUICK_NOTE_CASCADE_SLOTS: usize = 15;
const QUICK_NOTE_OPEN_DEBOUNCE_MS: u64 = 300;
const QUICK_NOTE_MIN_WIDTH: f64 = 280.0;
const QUICK_NOTE_MIN_HEIGHT: f64 = 240.0;
const QUICK_NOTE_MAX_WIDTH: f64 = 1200.0;
const QUICK_NOTE_MAX_HEIGHT: f64 = 1200.0;
const QUICK_NOTE_MAX_POSITION: f64 = 100000.0;
const QUICK_NOTE_DEFAULT_WIDTH: f64 = 340.0;
const QUICK_NOTE_DEFAULT_HEIGHT: f64 = 360.0;

static QUICK_NOTE_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static QUICK_NOTE_LAST_OPEN_MS: AtomicU64 = AtomicU64::new(0);
static QUICK_NOTE_SHOW_IN_TASKBAR: AtomicBool = AtomicBool::new(true);
static QUICK_NOTE_INITIAL_SURFACE: OnceLock<Mutex<Option<QuickNoteInitialSurface>>> = OnceLock::new();

#[derive(Clone, Deserialize)]
pub struct QuickNoteInitialSurface {
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
}

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

fn quick_note_cascade_slot_from_label(label: &str) -> Option<usize> {
    let rest = label.strip_prefix(QUICK_NOTE_LABEL_PREFIX)?;
    let mut parts = rest.split('-');
    let first = parts.next()?;
    if parts.next().is_none() {
        return Some(0);
    }
    let slot = first.parse::<usize>().ok()?;
    (slot < QUICK_NOTE_CASCADE_SLOTS).then_some(slot)
}

fn next_quick_note_cascade_slot(app: &AppHandle) -> usize {
    let mut occupied = [false; QUICK_NOTE_CASCADE_SLOTS];
    for label in app.webview_windows().keys() {
        if let Some(slot) = quick_note_cascade_slot_from_label(label) {
            occupied[slot] = true;
        }
    }

    occupied
        .iter()
        .position(|slot_occupied| !*slot_occupied)
        .unwrap_or(0)
}

fn is_reasonable_quick_note_surface(surface: &QuickNoteInitialSurface) -> bool {
    if !surface.width.is_finite()
        || !surface.height.is_finite()
        || surface.width < QUICK_NOTE_MIN_WIDTH
        || surface.height < QUICK_NOTE_MIN_HEIGHT
        || surface.width > QUICK_NOTE_MAX_WIDTH
        || surface.height > QUICK_NOTE_MAX_HEIGHT
    {
        return false;
    }

    match (surface.x, surface.y) {
        (Some(x), Some(y)) => {
            x.is_finite()
                && y.is_finite()
                && x.abs() <= QUICK_NOTE_MAX_POSITION
                && y.abs() <= QUICK_NOTE_MAX_POSITION
        }
        (None, None) => true,
        _ => false,
    }
}

fn quick_note_initial_surface_slot() -> &'static Mutex<Option<QuickNoteInitialSurface>> {
    QUICK_NOTE_INITIAL_SURFACE.get_or_init(|| Mutex::new(None))
}

fn set_quick_note_initial_surface(surface: Option<QuickNoteInitialSurface>) {
    if let Ok(mut slot) = quick_note_initial_surface_slot().lock() {
        *slot = surface.filter(|value| is_reasonable_quick_note_surface(value));
    }
}

#[cfg(target_os = "windows")]
fn quick_note_initial_surface() -> Option<QuickNoteInitialSurface> {
    quick_note_initial_surface_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
}

fn build_quick_note_window(
    app: &AppHandle,
    label: &str,
    url: String,
    show_in_taskbar: bool,
    initial_surface: Option<&QuickNoteInitialSurface>,
) -> Result<(), String> {
    let initial_surface = initial_surface.filter(|surface| is_reasonable_quick_note_surface(surface));
    let width = initial_surface.map_or(QUICK_NOTE_DEFAULT_WIDTH, |surface| surface.width);
    let height = initial_surface.map_or(QUICK_NOTE_DEFAULT_HEIGHT, |surface| surface.height);
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Serein Quick Note")
        .inner_size(width, height)
        .min_inner_size(QUICK_NOTE_MIN_WIDTH, QUICK_NOTE_MIN_HEIGHT)
        .resizable(true)
        .decorations(false)
        .always_on_top(false)
        .shadow(true)
        .skip_taskbar(!show_in_taskbar)
        .background_color(Color(238, 248, 243, 255))
        .visible(false)
        .focused(false);

    if let Some(surface) = initial_surface {
        if let (Some(x), Some(y)) = (surface.x, surface.y) {
            builder = builder.position(x, y);
        }
    }

    builder
        .build()
        .map(|_| ())
        .map_err(|error| format!("Failed to open quick note window: {error}"))
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

pub fn open_quick_note_window(
    app: &AppHandle,
    show_in_taskbar: bool,
    initial_surface: Option<QuickNoteInitialSurface>,
) -> Result<String, String> {
    let now = current_time_ms();
    let previous = QUICK_NOTE_LAST_OPEN_MS.swap(now, Ordering::Relaxed);
    if previous != 0 && now.saturating_sub(previous) < QUICK_NOTE_OPEN_DEBOUNCE_MS {
        return Ok("quick-note-debounced".to_string());
    }

    let cascade_slot = next_quick_note_cascade_slot(app);
    let sequence = QUICK_NOTE_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let label = format!("{QUICK_NOTE_LABEL_PREFIX}{cascade_slot}-{sequence}");
    let url = format!("quick-note.html?cascade={cascade_slot}");
    build_quick_note_window(app, &label, url, show_in_taskbar, initial_surface.as_ref())?;

    Ok(label)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{open_quick_note_window, reveal_window, QUICK_NOTE_SHOW_IN_TASKBAR};
    use std::{
        mem::zeroed,
        sync::{Mutex, OnceLock, atomic::Ordering, mpsc},
        thread::{self, JoinHandle},
    };
    use tauri::{AppHandle, Manager};
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

    const REVEAL_HOTKEY_ID: i32 = 0x5345;
    const QUICK_NOTE_HOTKEY_ID: i32 = 0x5346;

    #[derive(Clone, Copy)]
    enum HotkeyAction {
        Reveal,
        QuickNote,
    }

    impl HotkeyAction {
        fn id(self) -> i32 {
            match self {
                Self::Reveal => REVEAL_HOTKEY_ID,
                Self::QuickNote => QUICK_NOTE_HOTKEY_ID,
            }
        }

        fn controller(self) -> &'static OnceLock<Mutex<Option<HotkeyController>>> {
            match self {
                Self::Reveal => &REVEAL_HOTKEY_CONTROLLER,
                Self::QuickNote => &QUICK_NOTE_HOTKEY_CONTROLLER,
            }
        }

        fn run(self, app: &AppHandle) -> Result<(), String> {
            match self {
                Self::Reveal => reveal_window(app),
                Self::QuickNote => {
                    let app_for_closure = app.clone();
                    app.run_on_main_thread(move || {
                        focus_visible_main_window(&app_for_closure);
                        let show_in_taskbar = QUICK_NOTE_SHOW_IN_TASKBAR.load(Ordering::Relaxed);
                        if let Err(error) = open_quick_note_window(
                            &app_for_closure,
                            show_in_taskbar,
                            super::quick_note_initial_surface(),
                        ) {
                            eprintln!("failed to open quick note from global shortcut: {error}");
                        }
                    })
                    .map_err(|error| format!("Failed to dispatch quick note shortcut: {error}"))
                }
            }
        }
    }

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

    static REVEAL_HOTKEY_CONTROLLER: OnceLock<Mutex<Option<HotkeyController>>> = OnceLock::new();
    static QUICK_NOTE_HOTKEY_CONTROLLER: OnceLock<Mutex<Option<HotkeyController>>> = OnceLock::new();

    fn focus_visible_main_window(app: &AppHandle) {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        if !window.is_visible().unwrap_or(false) {
            return;
        }

        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    pub fn configure_reveal(app: AppHandle, shortcut: Option<String>) -> Result<(), String> {
        configure(app, shortcut, HotkeyAction::Reveal)
    }

    pub fn configure_quick_note(
        app: AppHandle,
        shortcut: Option<String>,
        show_in_taskbar: bool,
        initial_surface: Option<super::QuickNoteInitialSurface>,
    ) -> Result<(), String> {
        QUICK_NOTE_SHOW_IN_TASKBAR.store(show_in_taskbar, Ordering::Relaxed);
        super::set_quick_note_initial_surface(initial_surface);
        configure(app, shortcut, HotkeyAction::QuickNote)
    }

    fn configure(app: AppHandle, shortcut: Option<String>, action: HotkeyAction) -> Result<(), String> {
        let spec = match shortcut.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => Some(parse_shortcut(value)?),
            None => None,
        };

        let slot = action.controller().get_or_init(|| Mutex::new(None));
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
        let thread = thread::spawn(move || run_hotkey_thread(app, spec, action, result_tx));

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
        action: HotkeyAction,
        result_tx: mpsc::Sender<Result<u32, String>>,
    ) {
        let thread_id = unsafe { GetCurrentThreadId() };
        let hwnd: HWND = std::ptr::null_mut();
        unsafe {
            let mut message: MSG = zeroed();
            let _ = PeekMessageW(&mut message, hwnd, WM_HOTKEY, WM_HOTKEY, PM_NOREMOVE);
        }
        let registered = unsafe {
            RegisterHotKey(hwnd, action.id(), spec.modifiers | MOD_NOREPEAT, spec.key)
        };

        if registered == 0 {
            let _ = result_tx.send(Err(format!("Failed to register global shortcut: {}", spec.display)));
            return;
        }

        let _ = result_tx.send(Ok(thread_id));

        unsafe {
            let mut message: MSG = zeroed();
            while GetMessageW(&mut message, hwnd, 0, 0) > 0 {
                if message.message == WM_HOTKEY && message.wParam == action.id() as usize {
                    let _ = action.run(&app);
                    continue;
                }
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            UnregisterHotKey(hwnd, action.id());
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
    platform::configure_reveal(app, shortcut)
}

#[cfg(not(target_os = "windows"))]
pub fn configure_global_reveal_shortcut(_app: AppHandle, _shortcut: Option<String>) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn configure_global_quick_note_shortcut(
    app: AppHandle,
    shortcut: Option<String>,
    show_in_taskbar: bool,
    initial_surface: Option<QuickNoteInitialSurface>,
) -> Result<(), String> {
    platform::configure_quick_note(app, shortcut, show_in_taskbar, initial_surface)
}

#[cfg(not(target_os = "windows"))]
pub fn configure_global_quick_note_shortcut(
    _app: AppHandle,
    _shortcut: Option<String>,
    show_in_taskbar: bool,
    initial_surface: Option<QuickNoteInitialSurface>,
) -> Result<(), String> {
    QUICK_NOTE_SHOW_IN_TASKBAR.store(show_in_taskbar, Ordering::Relaxed);
    set_quick_note_initial_surface(initial_surface);
    Ok(())
}
