// Procedural WebAudio sound only: no audio files, no network. An engine hum whose
// pitch follows the car, a two-tone police siren, and short blips for punches, cash and
// mission-complete jingles. Everything is created lazily on the first user gesture;
// if audio is unavailable the game stays silent and keeps working.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const t = ctx.currentTime + when;
      gain.gain.setValueAtTime(vol || 0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Sound is garnish; never let it break the game.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    /** Continuous sounds, called every frame while playing. */
    update(dt, speed01, sirenOn) {
      if (!ctx || muted) return;
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        if (sirenOsc) sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }
      if (engineGain) {
        engineGain.gain.value = speed01 > 0.02 ? 0.028 + speed01 * 0.03 : 0;
        if (engineOsc) engineOsc.frequency.value = 52 + speed01 * 165;
      }
      if (sirenGain) sirenGain.gain.value = sirenOn ? 0.022 : 0;
    },
    punch() { blip(140, 0.09, 'sine', 0.12); },
    cash() { blip(880, 0.08, 'square', 0.05); blip(1320, 0.12, 'square', 0.05, 0.07); },
    hit() { blip(90, 0.16, 'sawtooth', 0.1); },
    jingle() {
      blip(523, 0.12, 'square', 0.06);
      blip(659, 0.12, 'square', 0.06, 0.11);
      blip(784, 0.2, 'square', 0.07, 0.22);
    },
    busted() {
      blip(392, 0.25, 'square', 0.07);
      blip(311, 0.25, 'square', 0.07, 0.22);
      blip(233, 0.5, 'square', 0.07, 0.44);
    },
  };
}
