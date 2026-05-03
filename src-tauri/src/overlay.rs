use crate::app_state::{ClickerState, PickRectPayload};
use crate::engine::mouse::{current_monitor_rects, current_virtual_screen_rect, VirtualScreenRect};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager};

static LAST_ZONE_SHOW: Mutex<Option<Instant>> = Mutex::new(None);
pub static OVERLAY_THREAD_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(true);

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMNCRP_DISABLED};

pub fn init_overlay(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;

    log::info!("[Overlay] Running one-time init...");

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    let _ = window.set_decorations(false);

    #[cfg(target_os = "windows")]
    {
        apply_win32_styles(&window)?;
        let _ = sync_overlay_bounds(&window)?;
    }

    log::info!("[Overlay] Init complete — window configured but hidden");
    Ok(())
}

pub fn show_overlay(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ClickerState>();
    if !state.settings_initialized.load(Ordering::SeqCst) {
        return Ok(());
    }
    {
        let settings = state.settings.lock().unwrap();
        if !settings.show_stop_overlay {
            return Ok(());
        }
    }

    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| "Virtual screen bounds not available".to_string())?;

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        let visible = window.is_visible().unwrap_or(false);
        if !visible {
            show_overlay_window(&window)?;
        }
    }

    *LAST_ZONE_SHOW.lock().unwrap() = Some(Instant::now());

    let settings = state.settings.lock().unwrap();
    let monitors = current_monitor_rects().unwrap_or_else(|| vec![bounds]);
    let custom_stop_zone = VirtualScreenRect::new(
        settings.custom_stop_zone_x,
        settings.custom_stop_zone_y,
        settings.custom_stop_zone_width.max(1),
        settings.custom_stop_zone_height.max(1),
    )
    .offset_from(bounds);
    let monitor_payload: Vec<_> = monitors
        .into_iter()
        .map(|monitor| {
            let offset = monitor.offset_from(bounds);
            serde_json::json!({
                "x": offset.left,
                "y": offset.top,
                "width": offset.width,
                "height": offset.height,
            })
        })
        .collect();
    let _ = window.emit(
        "zone-data",
        serde_json::json!({
            "edgeStopEnabled": settings.edge_stop_enabled,
            "edgeStopTop": settings.edge_stop_top,
            "edgeStopRight": settings.edge_stop_right,
            "edgeStopBottom": settings.edge_stop_bottom,
            "edgeStopLeft": settings.edge_stop_left,
            "cornerStopEnabled": settings.corner_stop_enabled,
            "cornerStopTL": settings.corner_stop_tl,
            "cornerStopTR": settings.corner_stop_tr,
            "cornerStopBL": settings.corner_stop_bl,
            "cornerStopBR": settings.corner_stop_br,
            "customStopZoneEnabled": settings.custom_stop_zone_enabled,
            "customStopZone": {
                "x": custom_stop_zone.left,
                "y": custom_stop_zone.top,
                "width": custom_stop_zone.width,
                "height": custom_stop_zone.height,
            },
            "screenWidth": bounds.width,
            "screenHeight": bounds.height,
            "monitors": monitor_payload,
            "_showDisabledEdges": !settings.edge_stop_enabled,
            "_showDisabledCorners": !settings.corner_stop_enabled,
        }),
    );

    Ok(())
}

// ---- Background timer ----

pub fn check_auto_hide(app: &AppHandle) {
    let mut last = LAST_ZONE_SHOW.lock().unwrap();
    if let Some(instant) = *last {
        if instant.elapsed() >= Duration::from_secs(3) {
            // ↑ auto-hide after timer

            *last = None;
            if let Some(window) = app.get_webview_window("overlay") {
                log::info!("[Overlay] Auto-hide: hiding window");
                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = get_hwnd(&window) {
                        unsafe { ShowWindow(hwnd, 0) };
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn set_pick_mode(window: &tauri::WebviewWindow, enable: bool) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;
    unsafe {
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_ex = if enable {
            (ex as u32) & !0x0000_0020 & !0x0800_0000
        } else {
            (ex as u32) | 0x0000_0020 | 0x0800_0000
        };
        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
        SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        );
    }
    window
        .set_ignore_cursor_events(!enable)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pick_zone(app: AppHandle) -> Result<PickRectPayload, String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;

    #[cfg(target_os = "windows")]
    {
        sync_overlay_bounds(&window)?;
        set_pick_mode(&window, true)?;
        show_overlay_window(&window)?;
    }

    let _ = window.set_focus();
    let _ = window.emit("pick-mode-start", ());

    let (tx, rx) = tokio::sync::oneshot::channel::<PickRectPayload>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_clone = tx.clone();

    let listener_id = app.listen("pick-zone-result", move |event| {
        if let Ok(rect) = serde_json::from_str::<PickRectPayload>(event.payload()) {
            if let Some(t) = tx_clone.lock().unwrap().take() {
                let _ = t.send(rect);
            }
        }
    });

    let result = rx.await.map_err(|e| e.to_string());
    app.unlisten(listener_id);

    #[cfg(target_os = "windows")]
    {
        let _ = set_pick_mode(&window, false);
        if let Ok(hwnd) = get_hwnd(&window) {
            unsafe { ShowWindow(hwnd, 0) };
        }
    }

    let rect = result?;
    if rect.cancelled {
        return Err("Pick cancelled".to_string());
    }
    Ok(rect)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    *LAST_ZONE_SHOW.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = get_hwnd(&window) {
                unsafe { ShowWindow(hwnd, 0) };
            }
        }
        #[cfg(not(target_os = "windows"))]
        let _ = window.hide();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn get_hwnd(window: &tauri::WebviewWindow) -> Result<isize, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle().map_err(|e| e.to_string())?;
    match handle.as_raw() {
        RawWindowHandle::Win32(w) => Ok(w.hwnd.get()),
        _ => Err("Not a Win32 window".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn apply_win32_styles(window: &tauri::WebviewWindow) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        SetWindowLongW(hwnd, GWL_STYLE, ((style as u32) | 0x8000_0000) as i32);

        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_ex =
            ((ex as u32) | 0x0800_0000 | 0x0000_0080 | 0x0000_0020 | 0x0000_0008) & !0x0004_0000;
        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);

        let policy = DWMNCRP_DISABLED;
        DwmSetWindowAttribute(
            hwnd,
            2,
            &policy as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );

        SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        );
    }

    log::info!("[Overlay] Win32 styles applied");
    Ok(())
}

#[cfg(target_os = "windows")]
fn sync_overlay_bounds(window: &tauri::WebviewWindow) -> Result<VirtualScreenRect, String> {
    let bounds = current_virtual_screen_rect()
        .ok_or_else(|| "Virtual screen bounds not available".to_string())?;
    let hwnd = get_hwnd(window)?;

    unsafe {
        SetWindowPos(
            hwnd,
            0,
            bounds.left,
            bounds.top,
            bounds.width,
            bounds.height,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }

    Ok(bounds)
}

#[cfg(target_os = "windows")]
fn show_overlay_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;

    unsafe {
        SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_SHOWWINDOW,
        );
    }

    Ok(())
}
