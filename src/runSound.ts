// Tiny Web Audio synth for run start / stop cues.
// No external file — generates short oscillator tones inline.

let ctx: AudioContext | null = null;
let unlockBound = false;

function bindUnlockOnce(audio: AudioContext) {
  if (unlockBound) return;
  unlockBound = true;
  const handler = () => {
    if (audio.state === "suspended") {
      void audio.resume().catch(() => {});
    }
  };
  // Resume on any user gesture (Chromium requires this for autoplay policy).
  document.addEventListener("pointerdown", handler, { once: true });
  document.addEventListener("keydown", handler, { once: true });
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    bindUnlockOnce(ctx);
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, gain = 0.08) {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume();
  }

  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.value = 0;

  osc.connect(env);
  env.connect(audio.destination);

  const now = audio.currentTime;
  const dur = durationMs / 1000;
  env.gain.linearRampToValueAtTime(gain, now + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playStartSound() {
  // Two-step ascending blip
  tone(660, 80, 0.07);
  setTimeout(() => tone(990, 110, 0.08), 60);
}

export function playStopSound() {
  // Two-step descending blip
  tone(550, 90, 0.07);
  setTimeout(() => tone(330, 140, 0.07), 70);
}
