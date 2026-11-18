// Procedural sound: three radio stations sequenced live with WebAudio
// oscillators (no audio files), plus small synthesized effects for shots,
// pickups, sirens and mission jingles. Everything is guarded so a browser
// without audio, or a headless one, never throws.

import { RADIO_STATIONS } from './config.js';

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio() {
  const audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    station: 0, muted: false, step: 0, nextNoteTime: 0,
    started: false, sirenOn: false,
  };

  function ensureContext() {
    if (audio.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = 0.16;
      audio.musicGain.connect(audio.master);
      audio.sfxGain = audio.ctx.createGain();
      audio.sfxGain.gain.value = 0.5;
      audio.sfxGain.connect(audio.master);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any real user gesture; browsers block audio before one. */
  audio.unlock = function unlock() {
    if (!ensureContext()) return;
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    if (!audio.started) {
      audio.started = true;
      audio.nextNoteTime = audio.ctx.currentTime + 0.1;
      setInterval(() => scheduleMusic(audio), 40);
    }
  };

  audio.setStation = function setStation(index) {
    audio.station = ((index % RADIO_STATIONS.length) + RADIO_STATIONS.length)
      % RADIO_STATIONS.length;
    audio.step = 0;
    return RADIO_STATIONS[audio.station];
  };

  audio.cycleStation = function cycleStation() {
    return audio.setStation(audio.station + 1);
  };

  audio.stationName = function stationName() {
    return RADIO_STATIONS[audio.station].name;
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    return audio.muted;
  };

  audio.tone = function tone(freq, dur, type, vol, when) {
    if (!audio.ctx || audio.muted) return;
    try {
      const t = when || audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio is best-effort */ }
  };

  audio.shot = function shot() { audio.tone(920, 0.09, 'square', 0.22); audio.tone(140, 0.12, 'sawtooth', 0.18); };
  audio.pickup = function pickup() { audio.tone(660, 0.1, 'sine', 0.25); audio.tone(990, 0.16, 'sine', 0.25, audio.ctx ? audio.ctx.currentTime + 0.08 : 0); };
  audio.crash = function crash() { audio.tone(90, 0.25, 'sawtooth', 0.3); };
  audio.horn = function horn() { audio.tone(370, 0.18, 'square', 0.12); };
  audio.cash = function cash() { audio.tone(880, 0.08, 'sine', 0.22); audio.tone(1320, 0.14, 'sine', 0.22, audio.ctx ? audio.ctx.currentTime + 0.07 : 0); };
  audio.missionDone = function missionDone() {
    if (!audio.ctx) return;
    const t0 = audio.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.22, 'triangle', 0.25, t0 + i * 0.11));
  };
  audio.missionFail = function missionFail() {
    if (!audio.ctx) return;
    const t0 = audio.ctx.currentTime;
    [392, 330, 262].forEach((f, i) => audio.tone(f, 0.25, 'triangle', 0.22, t0 + i * 0.14));
  };
  audio.siren = function siren(on) { audio.sirenOn = on; };

  return audio;
}

/** The radio sequencer: one 8th-note step per tick, per station's recipe. */
function scheduleMusic(audio) {
  if (!audio.ctx || audio.muted || audio.ctx.state !== 'running') return;
  const station = RADIO_STATIONS[audio.station];
  const stepDur = 60 / station.bpm / 2;
  while (audio.nextNoteTime < audio.ctx.currentTime + 0.15) {
    const t = audio.nextNoteTime;
    const step = audio.step;
    playStep(audio, station, step, t, stepDur);
    audio.step += 1;
    audio.nextNoteTime += stepDur;
  }
  if (audio.sirenOn && audio.step % 16 === 0) {
    audio.tone(720, 0.5, 'sine', 0.05);
    audio.tone(960, 0.5, 'sine', 0.05, audio.ctx.currentTime + 0.25);
  }
}

function note(audio, midi, t, dur, type, vol) {
  try {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* best effort */ }
}

function playStep(audio, station, step, t, stepDur) {
  const scale = station.scale;
  const root = station.root;
  const bar = Math.floor(step / 8) % 4;
  const roots = [0, 0, -4, -2];
  const bassRoot = root + roots[bar];
  if (station.genre === 'Synthwave') {
    if (step % 2 === 0) note(audio, bassRoot - 12, t, stepDur * 1.8, 'sawtooth', 0.16);
    const arp = [0, 1, 2, 1, 3, 2, 4, 3];
    const degree = scale[arp[step % 8] % scale.length];
    note(audio, root + 12 + degree, t, stepDur * 0.9, 'square', 0.05);
    if (step % 8 === 0) note(audio, root + 12, t, stepDur * 6, 'sine', 0.05);
    if (step % 4 === 2) note(audio, root + 24, t, stepDur * 0.5, 'triangle', 0.04);
  } else if (station.genre === 'Guitar Rock') {
    if (step % 4 === 0) note(audio, bassRoot - 12, t, stepDur * 3, 'square', 0.18);
    if (step % 2 === 1) note(audio, bassRoot + 7, t, stepDur, 'square', 0.07);
    const riff = [0, 0, 3, 0, 5, 3, 0, 2];
    if (step % 8 === riff[step % 8]) note(audio, bassRoot + 12, t, stepDur, 'sawtooth', 0.06);
    if (step % 8 === 4) note(audio, bassRoot + 19, t, stepDur * 2, 'sawtooth', 0.06);
  } else {
    if (step % 8 === 0) note(audio, bassRoot, t, stepDur * 7, 'sine', 0.12);
    if (step % 8 === 0) note(audio, bassRoot + 7, t, stepDur * 7, 'sine', 0.08);
    if (step % 8 === 4) note(audio, bassRoot + 5, t, stepDur * 3, 'sine', 0.08);
    const pluck = [0, 2, 4, 2, 1, 3, 4, 3];
    const degree = scale[pluck[step % 8] % scale.length];
    if (step % 2 === 0) note(audio, root + 12 + degree, t, stepDur * 1.4, 'triangle', 0.07);
  }
}
