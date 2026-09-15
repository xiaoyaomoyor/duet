//! 对奏 Duet 桌面版（Tauri 2）
//!
//! 桌面版存在的理由（§5 T14、§18 K10）：
//!   1. **绕开 CORS**：`fetch_remote` 由 Rust 侧发起请求，同源策略不再干涉。
//!      用户可以直接粘 Suno / Midjourney 的图片链接，不必先下载再上传——
//!      这是纯 Web 版做不到、也无法用任何前端技巧绕过的能力。
//!   2. **真正的文件系统**：`.duet` 工程文件可以原地打开与保存，
//!      而不是每次都落到"下载"目录。
//!   3. **文件关联**：双击 `.duet` 直接进应用。
//!
//! 本文件只做"平台能力"，不含任何业务逻辑：业务仍然全在 `src/` 的 Web 代码里。
//! 新增一个命令 = 在这里加一个 `#[tauri::command]` + 在 `platformAdapter.ts` 里接线。
//!
//! ⚠️ 未构建验证：开发机上没有 Rust 工具链（`cargo` / `rustc` / MSVC link 均缺失），
//! 因此本文件**没有被编译过**。接线与参数以 Tauri 2 的公开 API 为准；
//! 首次在装有 Rust 的机器上构建时请预留排查时间。

use std::time::Duration;

use tauri::Manager;

/// 抓取一个外部 URL，返回原始字节。
///
/// 为什么返回 `Vec<u8>` 而不是 `String`：媒体（图片/音频/模型）都是二进制；
/// 工程文件导入走的是 `dialog` + `fs` 插件那条路径，不经过这里。
///
/// # 参数
/// - `url`：只允许 http/https。其他协议（`file:`、`javascript:`、`data:`）一律拒绝——
///   否则渲染进程里出现一个注入点就能读取本机任意文件。
/// - `maxBytes`：体积上限。这是**防护**而不是优化：
///   用户误粘一个 4GB 的直链时，不能把内存吃满。
#[tauri::command]
async fn fetch_remote(url: String, max_bytes: Option<u64>) -> Result<Vec<u8>, String> {
    let parsed = url::Url::parse(&url).map_err(|error| format!("链接格式不正确：{error}"))?;

    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("只允许 http/https 链接，收到的是 {other}:")),
    }

    let limit = max_bytes.unwrap_or(64 * 1024 * 1024);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("Duet/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|error| format!("请求失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }

    // 先看响应头：能在下载之前就拒掉超大文件
    if let Some(length) = response.content_length() {
        if length > limit {
            return Err(format!("文件体积 {}MB 超过上限", length / 1024 / 1024));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取响应失败：{error}"))?;

    if bytes.len() as u64 > limit {
        return Err(format!("文件体积 {}MB 超过上限", bytes.len() / 1024 / 1024));
    }

    Ok(bytes.to_vec())
}

/// 应用版本（供"关于"面板校验前端与壳是否一致）
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 单实例插件必须是**第一个**注册的：第二个实例要在窗口创建之前就被拦下。
    //
    // 这里用 `#[cfg]` 两次 let 绑定而不是 `let mut builder` 再重新赋值：
    // `Builder::plugin()` 的返回类型会随插件泛型变化，
    // 对同一个可变变量重新赋值会因类型不匹配而编译失败。
    #[cfg(desktop)]
    let builder = tauri::Builder::default().plugin(tauri_plugin_single_instance::init(
        |app, argv, _cwd| {
            use tauri::Emitter;

            // 双击 .duet 文件关联进来时，路径会出现在命令行参数里。
            // 交给前端去打开（前端未就绪时这一步静默失败，用户仍可手动导入）。
            if let Some(path) = argv.iter().skip(1).find(|arg| arg.ends_with(".duet")) {
                let _ = app.emit("duet://open-file", path.clone());
            }

            // 把已有窗口提到前台，让用户明白"应用其实已经开着了"
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        },
    ));

    #[cfg(not(desktop))]
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![fetch_remote, app_version])
        .run(tauri::generate_context!())
        .expect("启动对奏桌面版失败");
}
