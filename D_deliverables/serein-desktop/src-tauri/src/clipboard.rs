pub fn read_text() -> Result<String, String> {
    platform_read_text()
}

pub fn write_text(text: &str) -> Result<(), String> {
    platform_write_text(text)
}

#[cfg(target_os = "windows")]
const CF_UNICODETEXT: u32 = 13;

#[cfg(target_os = "windows")]
fn platform_read_text() -> Result<String, String> {
    use windows_sys::Win32::{
        Foundation::GetLastError,
        System::{
            DataExchange::{CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard},
            Memory::{GlobalLock, GlobalUnlock},
        },
    };

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err(format!("failed to open clipboard: {}", GetLastError()));
        }
        let _guard = ClipboardGuard;

        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return Ok(String::new());
        }

        let handle = GetClipboardData(CF_UNICODETEXT);
        if handle.is_null() {
            return Err(format!("failed to read clipboard data: {}", GetLastError()));
        }

        let locked = GlobalLock(handle) as *const u16;
        if locked.is_null() {
            return Err(format!("failed to lock clipboard data: {}", GetLastError()));
        }

        let mut len = 0usize;
        while *locked.add(len) != 0 {
            len += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(locked, len));
        GlobalUnlock(handle);
        Ok(text)
    }
}

#[cfg(target_os = "windows")]
fn platform_write_text(text: &str) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::{GetLastError, GlobalFree},
        System::{
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
        },
    };

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = wide.len() * std::mem::size_of::<u16>();

    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, byte_len);
        if memory.is_null() {
            return Err(format!("failed to allocate clipboard memory: {}", GetLastError()));
        }

        let locked = GlobalLock(memory) as *mut u8;
        if locked.is_null() {
            GlobalFree(memory);
            return Err(format!("failed to lock clipboard memory: {}", GetLastError()));
        }

        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, locked, byte_len);
        GlobalUnlock(memory);

        if OpenClipboard(std::ptr::null_mut()) == 0 {
            GlobalFree(memory);
            return Err(format!("failed to open clipboard: {}", GetLastError()));
        }
        let _guard = ClipboardGuard;

        if EmptyClipboard() == 0 {
            GlobalFree(memory);
            return Err(format!("failed to empty clipboard: {}", GetLastError()));
        }

        if SetClipboardData(CF_UNICODETEXT, memory).is_null() {
            GlobalFree(memory);
            return Err(format!("failed to set clipboard data: {}", GetLastError()));
        }
    }

    Ok(())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn platform_read_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        return read_command("pbpaste", &[]);
    }

    #[cfg(target_os = "linux")]
    {
        let candidates: &[(&str, &[&str])] = &[
            ("wl-paste", &["--no-newline"]),
            ("xclip", &["-selection", "clipboard", "-out"]),
            ("xsel", &["--clipboard", "--output"]),
        ];
        let mut errors = Vec::new();
        for (program, args) in candidates {
            match read_command(program, args) {
                Ok(text) => return Ok(text),
                Err(error) => errors.push(error),
            }
        }
        Err(format!("no desktop clipboard reader is available: {}", errors.join("; ")))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn platform_write_text(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return write_command("pbcopy", &[], text);
    }

    #[cfg(target_os = "linux")]
    {
        let candidates: &[(&str, &[&str])] = &[
            ("wl-copy", &[]),
            ("xclip", &["-selection", "clipboard"]),
            ("xsel", &["--clipboard", "--input"]),
        ];
        let mut errors = Vec::new();
        for (program, args) in candidates {
            match write_command(program, args, text) {
                Ok(()) => return Ok(()),
                Err(error) => errors.push(error),
            }
        }
        Err(format!("no desktop clipboard writer is available: {}", errors.join("; ")))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn read_command(program: &str, args: &[&str]) -> Result<String, String> {
    use std::process::{Command, Stdio};

    let output = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|error| format!("{program}: {error}"))?;
    if !output.status.success() {
        return Err(format!("{program}: exited with {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn write_command(program: &str, args: &[&str], text: &str) -> Result<(), String> {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };

    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("{program}: {error}"))?;
    let Some(mut stdin) = child.stdin.take() else {
        return Err(format!("{program}: stdin is not available"));
    };
    stdin
        .write_all(text.as_bytes())
        .map_err(|error| format!("{program}: {error}"))?;
    drop(stdin);

    let status = child.wait().map_err(|error| format!("{program}: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{program}: exited with {status}"))
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_read_text() -> Result<String, String> {
    Err("desktop clipboard is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_write_text(_text: &str) -> Result<(), String> {
    Err("desktop clipboard is not supported on this platform".to_string())
}
