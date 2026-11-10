//! The game's own window.
//!
//! A packaged copy runs the referee on a background thread and shows the client in a
//! native window through the system web view (WKWebView on macOS, WebView2 on
//! Windows). There is no browser, address bar or URL for the player to deal with.

use crate::agents::Shared;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Fullscreen, WindowBuilder};

enum UserEvent {
    ToggleFullscreen,
    Quit,
}

/// Script injected before the client loads: marks the desktop shell and wires keys
/// that a browser would otherwise have handled.
const INIT: &str = r#"
window.__btsDesktop = { fullscreen: function () { window.ipc.postMessage('fullscreen'); }, quit: function () { window.ipc.postMessage('quit'); } };
window.addEventListener('keydown', function (e) {
  if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) { e.preventDefault(); window.ipc.postMessage('fullscreen'); }
}, true);
"#;

fn save_and_exit(shared: &Option<Shared>) -> ! {
    if let Some(s) = shared {
        if let Ok(st) = s.lock() {
            st.autosave();
        }
    }
    std::process::exit(0);
}

/// Open the window on a running referee. Returns only by exiting the process.
pub fn run(port: u16, shared: Option<Shared>) -> ! {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("Before the Stars")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .with_min_inner_size(LogicalSize::new(1120.0, 680.0))
        .build(&event_loop)
        .expect("could not create the game window");

    // macOS needs an application menu for Quit, copy/paste and full screen to work at all.
    #[cfg(target_os = "macos")]
    let quit_id = {
        use muda::accelerator::{Accelerator, Code, Modifiers};
        use muda::{Menu, MenuItem, PredefinedMenuItem, Submenu};
        let menu = Menu::new();
        let app_menu = Submenu::new("Before the Stars", true);
        let quit = MenuItem::new("Quit Before the Stars", true, Some(Accelerator::new(Some(Modifiers::SUPER), Code::KeyQ)));
        let _ = app_menu.append_items(&[&PredefinedMenuItem::hide(None), &PredefinedMenuItem::hide_others(None), &PredefinedMenuItem::separator(), &quit]);
        let edit = Submenu::new("Edit", true);
        let _ = edit.append_items(&[&PredefinedMenuItem::undo(None), &PredefinedMenuItem::redo(None), &PredefinedMenuItem::separator(), &PredefinedMenuItem::cut(None), &PredefinedMenuItem::copy(None), &PredefinedMenuItem::paste(None), &PredefinedMenuItem::select_all(None)]);
        let view = Submenu::new("View", true);
        let _ = view.append_items(&[&PredefinedMenuItem::fullscreen(None)]);
        let window_menu = Submenu::new("Window", true);
        let _ = window_menu.append_items(&[&PredefinedMenuItem::minimize(None), &PredefinedMenuItem::maximize(None)]);
        let _ = menu.append_items(&[&app_menu, &edit, &view, &window_menu]);
        menu.init_for_nsapp();
        // the menu must outlive this block
        std::mem::forget(menu);
        let id = quit.id().clone();
        let proxy = event_loop.create_proxy();
        muda::MenuEvent::set_event_handler(Some(move |e: muda::MenuEvent| {
            if e.id == id {
                let _ = proxy.send_event(UserEvent::Quit);
            }
        }));
        quit.id().clone()
    };
    #[cfg(target_os = "macos")]
    let _ = quit_id;

    let proxy = event_loop.create_proxy();
    let builder = wry::WebViewBuilder::new()
        .with_url(format!("http://127.0.0.1:{port}/"))
        .with_initialization_script(INIT)
        .with_devtools(cfg!(debug_assertions))
        .with_ipc_handler(move |req| {
            let _ = match req.body().as_str() {
                "fullscreen" => proxy.send_event(UserEvent::ToggleFullscreen),
                "quit" => proxy.send_event(UserEvent::Quit),
                _ => Ok(()),
            };
        });
    #[cfg(not(target_os = "linux"))]
    let _webview = builder.build(&window).expect("could not create the game view");
    #[cfg(target_os = "linux")]
    let _webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(window.gtk_window()).expect("could not create the game view")
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } | Event::UserEvent(UserEvent::Quit) => save_and_exit(&shared),
            Event::UserEvent(UserEvent::ToggleFullscreen) => {
                if window.fullscreen().is_some() {
                    window.set_fullscreen(None);
                } else {
                    window.set_fullscreen(Some(Fullscreen::Borderless(None)));
                }
            }
            _ => {}
        }
    })
}
