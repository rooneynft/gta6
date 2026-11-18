// Synthesized sound: every effect is built with the Web Audio API, no audio
// files. Engine hum, sirens, gunshots, punches, pickups and a small bass loop
// for the street. Nothing plays until the first user gesture unlocks audio.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;
  let bassTimer = 0;
  let bassStep = 0;
  const BASS = [55, 0, 55, 65.41, 0, 55, 49, 58.27];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 1800;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch {
      // Audio is decoration.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    engine(speed01, driving) {
      if (!ctx || muted) return;
      const target = driving ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 150, ctx.currentTime, 0.08);
    },
    siren(on) {
      if (!ctx || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.1);
    },
    shot() {
      noise(0.12, 0.35, 2600);
      blip(190, 0.08, 'square', 0.18, 70);
    },
    enemyShot() {
      noise(0.1, 0.18, 2000);
    },
    punch() {
      noise(0.08, 0.25, 900);
    },
    crash() {
      noise(0.25, 0.4, 700);
      blip(90, 0.2, 'sawtooth', 0.25, 40);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.22);
      blip(990, 0.12, 'sine', 0.22);
    },
    cash() {
      blip(880, 0.08, 'sine', 0.2);
      blip(1174, 0.08, 'sine', 0.2);
      blip(1568, 0.14, 'sine', 0.2);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110);
      });
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.25, 110);
    },
    update(dt, wanted) {
      if (!ctx || muted) return;
      if (wanted > 0 && sirenOsc) {
        sirenTimer += dt;
        if (sirenTimer > 0.42) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 720, ctx.currentTime, 0.05);
        }
      }
      // A lazy bass loop for the street.
      bassTimer += dt;
      if (bassTimer > 0.24) {
        bassTimer = 0;
        const note = BASS[bassStep % BASS.length];
        bassStep += 1;
        if (note) blip(note, 0.2, 'triangle', 0.07);
      }
    },
  };
}
