use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

const MAIN_LABEL: &str = "main";
const STICKY_LABEL: &str = "sticky";
const STICKY_W: f64 = 360.0;
const STICKY_H: f64 = 520.0;
const STICKY_COLLAPSED_H: f64 = 40.0;

#[derive(Serialize, Deserialize, Clone, Default)]
struct StickyCfg {
    x: Option<i32>,
    y: Option<i32>,
    w: Option<f64>,
    h: Option<f64>,
    pinned: Option<bool>,
}

#[derive(Serialize, Deserialize, Default)]
struct AppConfig {
    server_url: Option<String>,
    #[serde(default)]
    sticky: StickyCfg,
}

/// 配置文件路径：app_data_dir/config.json
fn config_path(app: &AppHandle) -> PathBuf {
    let mut p = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    p.push("config.json");
    p
}

fn load_config(app: &AppHandle) -> AppConfig {
    let p = config_path(app);
    if p.exists() {
        if let Ok(s) = fs::read_to_string(&p) {
            if let Ok(c) = serde_json::from_str::<AppConfig>(&s) {
                return c;
            }
        }
    }
    AppConfig::default()
}

fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let p = config_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&p, s).map_err(|e| e.to_string())
}

/// 当前平台下 setup 协议页面的实际访问地址
fn setup_page_url() -> Url {
    #[cfg(windows)]
    {
        Url::parse("http://setup.localhost/").unwrap()
    }
    #[cfg(not(windows))]
    {
        Url::parse("setup://localhost/").unwrap()
    }
}

fn server_page_url(server: &str, path: &str) -> Option<Url> {
    let base = server.trim_end_matches('/');
    Url::parse(&format!("{base}{path}")).ok()
}

/// 读取已保存的服务器地址（用于设置页回填）
#[tauri::command]
fn get_server_url(app: AppHandle) -> Option<String> {
    load_config(&app).server_url
}

/// 保存服务器地址并跳转到该地址
#[tauri::command]
fn save_server_url(app: AppHandle, url: String) -> Result<String, String> {
    let mut url = url.trim().to_string();
    if url.is_empty() {
        return Err("地址不能为空".into());
    }
    while url.ends_with('/') {
        url.pop();
    }
    let parsed =
        Url::parse(&url).map_err(|_| "地址格式不正确，请以 http:// 或 https:// 开头".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("仅支持 http 或 https 协议".into());
    }

    let mut cfg = load_config(&app);
    cfg.server_url = Some(url.clone());
    save_config(&app, &cfg)?;

    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.navigate(parsed);
    }
    if let Some(sticky_url) = server_page_url(&url, "/sticky") {
        match app.get_webview_window(STICKY_LABEL) {
            Some(win) => {
                let _ = win.navigate(sticky_url);
                let _ = win.show();
            }
            None => {
                let _ = create_sticky_window(&app, &sticky_url);
            }
        }
    }
    Ok(url)
}

/// 打开设置页（修改服务器地址）
fn open_setup_page(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.show();
        let _ = win.navigate(setup_page_url());
    }
}

fn toggle_pin(app: &AppHandle) {
    let cfg = load_config(app);
    let next = !cfg.sticky.pinned.unwrap_or(true);
    if let Some(win) = app.get_webview_window(STICKY_LABEL) {
        let _ = win.set_always_on_top(next);
    }
    let mut cfg2 = cfg;
    cfg2.sticky.pinned = Some(next);
    let _ = save_config(app, &cfg2);
}

/// 设置便签窗置顶
#[tauri::command]
fn set_sticky_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(STICKY_LABEL) {
        win.set_always_on_top(pinned).map_err(|e| e.to_string())?;
    }
    let mut cfg = load_config(&app);
    cfg.sticky.pinned = Some(pinned);
    let _ = save_config(&app, &cfg);
    Ok(())
}

/// 收起 / 展开便签窗（只改变窗口高度，不改记忆中的高度）
#[tauri::command]
fn set_sticky_collapsed(app: AppHandle, collapsed: bool) -> Result<(), String> {
    let win = app
        .get_webview_window(STICKY_LABEL)
        .ok_or_else(|| "便签窗口不存在".to_string())?;
    let cfg = load_config(&app);
    let w = cfg.sticky.w.unwrap_or(STICKY_W);
    let h = if collapsed {
        STICKY_COLLAPSED_H
    } else {
        cfg.sticky.h.unwrap_or(STICKY_H)
    };
    win.set_size(tauri::LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 隐藏便签窗（不退出程序）
#[tauri::command]
fn hide_sticky_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window(STICKY_LABEL) {
        let _ = win.hide();
    }
}

/// 显示并聚焦主窗口
#[tauri::command]
fn open_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn show_sticky(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(STICKY_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn toggle_sticky(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(STICKY_LABEL) {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => show_sticky(app),
        }
    }
}

/// 保存便签窗位置与尺寸
fn save_sticky_geometry(app: &AppHandle) {
    let Some(win) = app.get_webview_window(STICKY_LABEL) else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let mut cfg = load_config(app);
    if let Ok(p) = win.outer_position() {
        let lp = p.to_logical::<f64>(scale);
        cfg.sticky.x = Some(lp.x.round() as i32);
        cfg.sticky.y = Some(lp.y.round() as i32);
    }
    if let Ok(size) = win.inner_size() {
        let ls = size.to_logical::<f64>(scale);
        cfg.sticky.w = Some(ls.width);
        // 收起态高度不覆盖记忆值
        if ls.height > 100.0 {
            cfg.sticky.h = Some(ls.height);
        }
    }
    let _ = save_config(app, &cfg);
}

/// 事件回调里做轻量防抖，避免拖动时高频写文件
fn schedule_save_geometry(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(350));
        save_sticky_geometry(&handle);
    });
}

/// 创建独立桌面便签窗口
fn create_sticky_window(app: &AppHandle, url: &Url) -> tauri::Result<()> {
    if app.get_webview_window(STICKY_LABEL).is_some() {
        show_sticky(app);
        return Ok(());
    }

    let cfg = load_config(app);
    let s = cfg.sticky;
    let w = s.w.unwrap_or(STICKY_W);
    let h = s.h.unwrap_or(STICKY_H);
    let pinned = s.pinned.unwrap_or(true);

    let mut builder = WebviewWindowBuilder::new(app, STICKY_LABEL, WebviewUrl::External(url.clone()))
        .title("便签")
        .inner_size(w, h)
        .min_inner_size(280.0, STICKY_COLLAPSED_H)
        .decorations(false)
        .resizable(true)
        .always_on_top(pinned)
        .skip_taskbar(true)
        .visible(false);

    if let (Some(x), Some(y)) = (s.x, s.y) {
        builder = builder.position(x as f64, y as f64);
    } else if let Ok(Some(monitor)) = app.primary_monitor() {
        // 首次出现默认贴右上角，与预览图一致
        let scale = monitor.scale_factor();
        let size = monitor.size().to_logical::<f64>(scale);
        let x = (size.width - w - 40.0).max(0.0);
        builder = builder.position(x, 60.0);
    }

    let win = builder.build()?;
    win.show()?;
    Ok(())
}

/// 首次启动配置页 HTML（内嵌在 exe 中，不依赖网络）
const SETUP_HTML: &str = r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>服务器配置 · 一人法务</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #1f3a4d 0%, #2c5364 100%);
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    color: #fff;
  }
  .card {
    background: rgba(255,255,255,0.97); color: #222; border-radius: 14px;
    padding: 40px; width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  h1 { font-size: 22px; margin-bottom: 8px; color: #1f3a4d; }
  p.sub { color: #666; font-size: 13px; margin-bottom: 24px; line-height: 1.6; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #444; }
  input {
    width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 8px;
    font-size: 14px; outline: none; transition: border .2s;
  }
  input:focus { border-color: #1f3a4d; }
  button {
    width: 100%; margin-top: 18px; padding: 13px; background: #1f3a4d; color: #fff;
    border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: background .2s;
  }
  button:hover { background: #2c5364; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .err { color: #c0392b; font-size: 12px; margin-top: 10px; min-height: 16px; }
  .hint { color: #888; font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="card">
    <h1>欢迎使用一人法务</h1>
    <p class="sub">请输入服务器地址，保存后将直接打开工作台。<br>以后可通过菜单「设置 → 修改服务器地址」随时更换。</p>
    <label for="url">服务器地址</label>
    <input id="url" type="text" placeholder="例如 http://example.com:8080" autocomplete="off" autofocus>
    <div class="hint">支持 http / https，末尾斜杠可省略</div>
    <div class="err" id="err"></div>
    <button id="save">保存并进入</button>
  </div>
<script>
  var tauri = window.__TAURI__ || {};
  var invoke = tauri.core ? tauri.core.invoke : tauri.invoke;
  var input = document.getElementById('url');
  var err = document.getElementById('err');
  var btn = document.getElementById('save');

  if (invoke) {
    invoke('get_server_url').then(function (u) {
      if (u) input.value = u;
      input.focus();
      input.select();
    }).catch(function () {});
  }

  function submit() {
    var url = input.value.trim();
    err.textContent = '';
    if (!url) { err.textContent = '请输入服务器地址'; return; }
    if (!invoke) {
      err.textContent = '当前环境不支持调用，请在桌面应用内打开';
      return;
    }
    btn.disabled = true; btn.textContent = '正在连接...';
    invoke('save_server_url', { url: url }).catch(function (e) {
      err.textContent = (e && (e.message || e.error)) || String(e);
      btn.disabled = false; btn.textContent = '保存并进入';
    });
  }

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submit();
  });
</script>
</body>
</html>
"#;

/// 托盘：显示/隐藏便签、打开主窗口、退出
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show_sticky", "显示便签", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide_sticky", "隐藏便签", true, None::<&str>)?;
    let pin_item = MenuItem::with_id(app, "toggle_pin", "切换置顶", true, None::<&str>)?;
    let main_item = MenuItem::with_id(app, "open_main", "打开主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &hide_item,
            &pin_item,
            &main_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("一人法务")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_sticky" => show_sticky(app),
            "hide_sticky" => {
                if let Some(win) = app.get_webview_window(STICKY_LABEL) {
                    let _ = win.hide();
                }
            }
            "toggle_pin" => toggle_pin(app),
            "open_main" => {
                if let Some(win) = app.get_webview_window(MAIN_LABEL) {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_sticky(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--sticky-only"]),
        ))
        .register_uri_scheme_protocol("setup", |_app, _request| {
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(SETUP_HTML.as_bytes().to_vec())
                .unwrap()
        })
        .on_window_event(|window, event| {
            match window.label() {
                STICKY_LABEL => match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        schedule_save_geometry(window.app_handle());
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {}
                },
                MAIN_LABEL => {
                    // 主窗口关闭时只隐藏，方便从托盘或便签窗重新打开
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 开机自启（幂等）
            let _ = app.autolaunch().enable();

            let cfg = load_config(app.handle());

            // 菜单：设置 → 修改服务器地址
            let settings_item =
                MenuItem::with_id(app, "change_server", "修改服务器地址", true, None::<&str>)?;
            let settings_menu = Submenu::with_items(app, "设置", true, &[&settings_item])?;
            let menu = Menu::with_items(app, &[&settings_menu])?;
            app.set_menu(menu)?;

            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id.as_ref() == "change_server" {
                    open_setup_page(&app_handle);
                }
            });

            build_tray(app.handle())?;

            // 开机自启时只显示便签窗，不弹出主窗口
            let sticky_only = std::env::args().any(|arg| arg == "--sticky-only");

            if !sticky_only {
                let initial_url = match &cfg.server_url {
                    Some(u) => WebviewUrl::External(Url::parse(u).unwrap()),
                    None => WebviewUrl::CustomProtocol(Url::parse("setup://localhost/").unwrap()),
                };

                WebviewWindowBuilder::new(app, MAIN_LABEL, initial_url)
                    .title("一人法务")
                    .inner_size(1440.0, 900.0)
                    .resizable(true)
                    .build()?;
            }

            // 已配置服务器时同时打开便签窗
            if let Some(server) = cfg.server_url.as_deref() {
                if let Some(sticky_url) = server_page_url(server, "/sticky") {
                    let _ = create_sticky_window(app.handle(), &sticky_url);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_server_url,
            get_server_url,
            set_sticky_pinned,
            set_sticky_collapsed,
            hide_sticky_window,
            open_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
