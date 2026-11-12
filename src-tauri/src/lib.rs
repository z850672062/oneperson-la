use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::Url;

#[derive(Serialize, Deserialize, Default)]
struct AppConfig {
    server_url: Option<String>,
}

/// 配置文件路径：app_data_dir/config.json
fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let mut p = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    p.push("config.json");
    p
}

fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let p = config_path(app);
    if p.exists() {
        if let Ok(s) = fs::read_to_string(&p) {
            if let Ok(c) = serde_json::from_str::<AppConfig>(&s) {
                return c;
            }
        }
    }
    AppConfig { server_url: None }
}

fn save_config(app: &tauri::AppHandle, cfg: &AppConfig) -> Result<(), String> {
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

/// 读取已保存的服务器地址（用于设置页回填）
#[tauri::command]
fn get_server_url(app: tauri::AppHandle) -> Option<String> {
    load_config(&app).server_url
}

/// 保存服务器地址并跳转到该地址
#[tauri::command]
fn save_server_url(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let mut url = url.trim().to_string();
    if url.is_empty() {
        return Err("地址不能为空".into());
    }
    // 去除末尾斜杠
    while url.ends_with('/') {
        url.pop();
    }
    let parsed = Url::parse(&url).map_err(|_| "地址格式不正确，请以 http:// 或 https:// 开头".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("仅支持 http 或 https 协议".into());
    }

    let cfg = AppConfig {
        server_url: Some(url.clone()),
    };
    save_config(&app, &cfg)?;

    if let Some(win) = app.get_webview_window("main") {
        let _ = win.navigate(parsed);
    }
    Ok(url)
}

/// 打开设置页（修改服务器地址）
fn open_setup_page(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.navigate(setup_page_url());
    }
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

  // 已保存过地址时回填，方便修改
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("setup", |_app, _request| {
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(SETUP_HTML.as_bytes().to_vec())
                .unwrap()
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

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

            // 读取已保存的服务器地址，决定首屏加载内容
            let cfg = load_config(app.handle());
            let initial_url = match cfg.server_url {
                Some(u) => WebviewUrl::External(Url::parse(&u).unwrap()),
                None => WebviewUrl::CustomProtocol(Url::parse("setup://localhost/").unwrap()),
            };

            tauri::WebviewWindowBuilder::new(app, "main", initial_url)
                .title("一人法务")
                .inner_size(1440.0, 900.0)
                .resizable(true)
                .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_server_url, get_server_url])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
