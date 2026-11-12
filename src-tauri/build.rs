fn main() {
  // 生成 app 命令的 ACL 权限（allow-xxx / deny-xxx）。
  // 远程页面（便签窗加载服务器地址）默认不允许调用自定义命令，
  // 必须在 capabilities 里显式声明远程 URL 并列出这些权限。
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&[
        "save_server_url",
        "get_server_url",
        "set_sticky_pinned",
        "get_sticky_pinned",
        "set_sticky_collapsed",
        "hide_sticky_window",
        "open_main_window",
      ]),
    ),
  )
  .expect("failed to run tauri-build");
}
