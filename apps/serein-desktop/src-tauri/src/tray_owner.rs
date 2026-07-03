#[cfg(target_os = "windows")]
mod platform {
    use std::sync::OnceLock;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError},
        System::Threading::CreateMutexW,
    };

    const TRAY_OWNER_MUTEX_NAME: &str = "Local\\Serein.Desktop.TrayOwner.v1";

    static IS_TRAY_OWNER: OnceLock<bool> = OnceLock::new();

    pub fn acquire_tray_owner() -> bool {
        *IS_TRAY_OWNER.get_or_init(|| {
            let name: Vec<u16> = TRAY_OWNER_MUTEX_NAME.encode_utf16().chain([0]).collect();
            let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };

            if handle.is_null() {
                return true;
            }

            let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
            if already_exists {
                unsafe {
                    CloseHandle(handle);
                }
                return false;
            }

            // Keep the owner mutex handle open for the process lifetime.
            true
        })
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn acquire_tray_owner() -> bool {
        true
    }
}

pub fn acquire_tray_owner() -> bool {
    platform::acquire_tray_owner()
}
