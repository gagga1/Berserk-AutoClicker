# v2.6.7 - First public release

First version of Berserk Auto Clicker uploaded to GitHub. The app has been developed internally for a while at this point, this is the build we're shipping out publicly.

## Core features

Click rate configurable in clicks per second, minute, hour or day. Toggle and Hold trigger modes. Customizable hotkey including modifier combos and mouse buttons. Adjustable duty cycle and timing variation with four distribution shapes (Gaussian, Uniform, Sine, Walk). Click and time limits. Double click support. Sequence clicking with positional targets and per-point click counts.

## Safety

Edge and corner stop zones with configurable margins. Custom rectangular stop zones drawn directly on screen with the Pick Zone tool (drag-rectangle, multi-monitor with device pixel ratio scaling). Foreground window lock that gates clicks to a specific window title. Window-specific profiles that auto-apply a saved preset when a target window is detected.

## UI

Vertical sidebar layout with icon navigation. Three theme presets (Berserk Red, Eclipse Black, Behelit Gold) plus light mode. Math-style click curve editor in the Simple panel with two draggable control points on the X and Y axes. Settings cards collapse and expand. Window auto-resizes to match the active panel. Run indicator with animated bars in the titlebar. Floating HUD with live CPS and click count. Optional start and stop sound cues. System tray icon with show/quit menu.

## Game presets

One-click presets for Roblox (linear 18 cps, no jitter) and Minecraft (11 cps Hold mode with 55 percent Gaussian jitter for PvP).

## Storage

User presets save the full clicker config under a custom name. Local stats track total clicks, total time and average CPU. Optional autostart with Windows.
