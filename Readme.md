# Berserk Auto Clicker

Autoclicker made by and for Berserk Group. Uploaded the app to GitHub starting with version 2.6.7.

A Windows-first desktop autoclicker focused on accuracy, speed and a clean interface. Built with Tauri 2, Rust and React.

## Features

A short tour of what's in the app today.

**Click rate** is what you'd expect, configurable in clicks per second, minute, hour or day. Rate input mode lets you flip between rate-based (X clicks per second) and delay-based (one click every N milliseconds). The clicker holds steady at higher rates without the drift that's common in other tools.

**Trigger** is fully customizable. Pick any key, mouse button, or modifier combo (Shift+F6, Ctrl+Alt+B, mouse4, etc). Toggle mode keeps the clicker running until you press the hotkey again. Hold mode only clicks while you keep the key down.

**Click curve editor** is a small math-style graph in the Simple panel that visualises your click pattern. Two control points sit on the X and Y axes. The red one moves horizontally to set duty cycle. The gold one moves vertically to set jitter. The curve reshapes live as you drag.

**Variation distributions** decide how the timing jitter is sampled. Gaussian gives a bell curve, ideal when you want clicks to look human. Uniform spreads variation evenly across the range. Sine adds slow oscillation in the click rate. Walk does a random walk where each interval drifts slightly from the previous.

**Game presets** are baked in for common targets. One click and your settings switch over. Roblox gets you 18 cps with no jitter. Minecraft gets you 11 cps in Hold mode with 55 percent Gaussian jitter, which is roughly what serious PvP players use.

**App lock** restricts clicking to a specific window. Type a substring of a window title and the clicker only fires while that window has focus. Alt-tab away and it pauses, switch back and it picks up. Useful when you don't want the clicker to fire over your browser or Discord while you're checking something.

**Window profiles** auto-apply a saved preset when a target window is detected. Open Minecraft and your PvP preset loads. Open Roblox and your auto farm settings come up. Polling runs every 1.5 seconds while the clicker is idle.

**Floating HUD** is a small always-on-top window that shows live CPS and click count during a run. You can drag it anywhere on screen. Auto shows when the clicker engages and hides when it stops.

**Stop zones** prevent runaway clicks. Configure edge and corner exclusion areas and the clicker pauses if your cursor enters them. Custom rectangular zones can be drawn directly on screen with the Pick Zone tool, similar to the Windows snipping flow. Drag a rectangle, release, and the zone is saved in physical pixels with full multi monitor support.

**Sequence clicking** lets you define a list of screen positions. The clicker visits each in order with its own click count and rotates through.

**Themes** ship in three flavors. Berserk Red is the default. Eclipse Black runs darker. Behelit Gold pulls toward warm browns and amber. Light mode is also available.

**Presets** save and reuse the entire clicker config under a custom name. Apply, update, rename and delete from Settings.

**Other niceties.** Run indicator with animated bars in the titlebar. Optional start and stop sound cues. Settings panel sections fold and unfold. Window auto resizes to match the active panel. System tray icon, optional autostart with Windows. Local stats: total clicks, total time, average CPU.

## Installation

Download the installer from the [latest release](https://github.com/gagga1/Berserk-AutoClicker/releases/latest) and run it. The app installs to `%localappdata%\BerserkAutoClicker`. Config and stats live in `%appdata%\BerserkAutoClicker`.

If Windows SmartScreen warns about the unsigned binary, see [docs/windows-release-trust.md](docs/windows-release-trust.md).

## Build from source

Berserk is Windows first. The build path uses the Rust `x86_64-pc-windows-msvc` toolchain plus Node.js.

Requirements:

```
Node.js 20 or newer
Rust via rustup
Microsoft C++ Build Tools (Visual Studio Build Tools)
```

Setup:

```powershell
git clone https://github.com/gagga1/Berserk-AutoClicker.git
cd Berserk-AutoClicker
npm install
rustup default stable-x86_64-pc-windows-msvc
```

Run in development:

```powershell
npm run dev
```

This opens the app window with hot reload, you don't need to recompile manually for frontend changes.

Build a release bundle:

```powershell
npm run build
```

Output lands in `src-tauri\target\release\bundle\nsis\BerserkAutoClicker_<version>_x64-setup.exe`. The raw exe is at `src-tauri\target\release\BerserkAutoClicker.exe`.

Useful checks:

```powershell
npm run lint
npm run frontend:build
cargo test --manifest-path src-tauri/Cargo.toml
```

## License

GPL 3.0. See [LICENSE](LICENSE) for the full text.
