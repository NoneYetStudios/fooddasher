/* Food Dasher — procedural Web Audio API SFX & 1980s chiptune synthwave soundtrack. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  const MAX_VOICES = 14;
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let sfxOn = true;
  let musicOn = true;
  let audioBlocked = false;
  let unlockBound = false;

  const activeVoices = [];
  let musicTimer = null;
  let nextNoteT = 0;
  let step = 0;
  let getIntensity = function () { return 1; };

  try {
    if (typeof localStorage !== 'undefined') {
      sfxOn = localStorage.getItem('fd_sfx') !== '0';
      musicOn = localStorage.getItem('fd_music') !== '0';
    }
  } catch (e) { /* ignore storage errors */ }

  function bindUnlock() {
    if (unlockBound || typeof document === 'undefined' || !document.addEventListener) return;
    unlockBound = true;
    const onGesture = function () { resume(); };
    document.addEventListener('pointerdown', onGesture, { once: true, passive: true });
    document.addEventListener('keydown', onGesture, { once: true, passive: true });
  }

  function init() {
    if (ctx) return true;
    if (audioBlocked || typeof root === 'undefined') return false;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = sfxOn ? 0.65 : 0;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.88;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = musicOn ? 0.28 : 0;
      musicBus.connect(master);

      const sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, sr, sr);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      bindUnlock();
      return true;
    } catch (e) {
      ctx = null;
      audioBlocked = true;
      return false;
    }
  }

  function resume() {
    if (!init()) return;
    try {
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) {}
  }

  function pruneVoices(now) {
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].end <= now || activeVoices[i].ended) activeVoices.splice(i, 1);
    }
  }

  function reserveVoice(endT, prio, node) {
    const now = ctx ? ctx.currentTime : 0;
    pruneVoices(now);
    if (activeVoices.length >= MAX_VOICES) {
      let idx = -1;
      for (let i = 0; i < activeVoices.length; i++) {
        if (activeVoices[i].prio <= prio) { idx = i; break; }
      }
      if (idx === -1) return false;
      const victim = activeVoices.splice(idx, 1)[0];
      try { if (victim.node && victim.node.stop) victim.node.stop(); } catch (e) {}
    }
    const entry = { end: endT, prio: prio || 1, node: node, ended: false };
    activeVoices.push(entry);
    if (node && 'onended' in node) node.onended = function () { entry.ended = true; };
    return true;
  }

  function tone(o) {
    if (!ctx || !sfxOn) return false;
    const isMusic = o.dest === musicBus;
    if (isMusic && !musicOn) return false;
    try {
      const t0 = Math.max(ctx.currentTime, o.at || ctx.currentTime);
      const dur = Math.max(0.02, o.dur || 0.12);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(Math.max(24, o.freq || 440), t0);
      if (o.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.endFreq), t0 + dur);
      }
      const vol = o.vol || 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.015, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      if (o.filterFreq) {
        const flt = ctx.createBiquadFilter();
        flt.type = o.filterType || 'lowpass';
        flt.frequency.setValueAtTime(o.filterFreq, t0);
        osc.connect(flt);
        flt.connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(o.dest || sfxBus);

      if (!isMusic && !reserveVoice(t0 + dur + 0.02, o.prio || 1, osc)) return false;
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noise(o) {
    if (!ctx || !sfxOn || !noiseBuf) return false;
    const isMusic = o.dest === musicBus;
    if (isMusic && !musicOn) return false;
    try {
      const t0 = Math.max(ctx.currentTime, o.at || ctx.currentTime);
      const dur = Math.max(0.02, o.dur || 0.12);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const flt = ctx.createBiquadFilter();
      flt.type = o.filterType || 'bandpass';
      flt.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.endFreq) flt.frequency.exponentialRampToValueAtTime(Math.max(60, o.endFreq), t0 + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(o.vol || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(flt);
      flt.connect(gain);
      gain.connect(o.dest || sfxBus);
      if (!isMusic && !reserveVoice(t0 + dur + 0.02, o.prio || 1, src)) return false;
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }

  const sfx = {
    click: function () {
      resume();
      tone({ type: 'square', freq: 680, endFreq: 960, dur: 0.055, vol: 0.12, prio: 1 });
    },
    confirm: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'square', freq: 523.25, dur: 0.07, vol: 0.15, at: t, prio: 2 });
      tone({ type: 'square', freq: 659.25, dur: 0.07, vol: 0.15, at: t + 0.06, prio: 2 });
      tone({ type: 'square', freq: 783.99, dur: 0.12, vol: 0.17, at: t + 0.12, prio: 2 });
    },
    error: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sawtooth', freq: 210, endFreq: 140, dur: 0.12, vol: 0.16, at: t, prio: 2 });
    },
    grab: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'triangle', freq: 440, endFreq: 880, dur: 0.09, vol: 0.22, at: t, prio: 3 });
      tone({ type: 'square', freq: 1046.5, dur: 0.11, vol: 0.16, at: t + 0.07, prio: 3 });
    },
    toss: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sine', freq: 280, endFreq: 660, dur: 0.13, vol: 0.2, at: t, prio: 2 });
      noise({ filterType: 'bandpass', freq: 1400, endFreq: 600, dur: 0.11, vol: 0.1, at: t, prio: 1 });
    },
    bullseye: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      const notes = [587.33, 739.99, 880, 1174.66];
      for (let i = 0; i < notes.length; i++) {
        tone({ type: 'square', freq: notes[i], dur: 0.09, vol: 0.17, at: t + i * 0.055, prio: 4 });
      }
    },
    deliver: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'triangle', freq: 523.25, dur: 0.08, vol: 0.2, at: t, prio: 3 });
      tone({ type: 'square', freq: 783.99, dur: 0.13, vol: 0.15, at: t + 0.07, prio: 3 });
    },
    ruined: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sawtooth', freq: 300, endFreq: 95, dur: 0.28, vol: 0.22, at: t, prio: 4 });
      noise({ filterType: 'lowpass', freq: 900, endFreq: 200, dur: 0.24, vol: 0.18, at: t, prio: 3 });
    },
    reroute: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sawtooth', freq: 440, dur: 0.09, vol: 0.18, at: t, prio: 4 });
      tone({ type: 'sawtooth', freq: 349.23, dur: 0.09, vol: 0.18, at: t + 0.10, prio: 4 });
      tone({ type: 'sawtooth', freq: 440, dur: 0.12, vol: 0.18, at: t + 0.20, prio: 4 });
    },
    pothole: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'triangle', freq: 155, endFreq: 55, dur: 0.16, vol: 0.24, at: t, prio: 3 });
      noise({ filterType: 'lowpass', freq: 650, dur: 0.15, vol: 0.16, at: t, prio: 2 });
    },
    honk: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sawtooth', freq: 520, endFreq: 495, dur: 0.11, vol: 0.16, filterFreq: 1800, at: t, prio: 3 });
      tone({ type: 'sawtooth', freq: 545, endFreq: 510, dur: 0.14, vol: 0.16, filterFreq: 1800, at: t + 0.13, prio: 3 });
    },
    stomp: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sine', freq: 92, endFreq: 28, dur: 0.42, vol: 0.34, at: t, prio: 5 });
      noise({ filterType: 'lowpass', freq: 420, endFreq: 90, dur: 0.38, vol: 0.28, at: t, prio: 4 });
    },
    cash: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'square', freq: 1318.5, dur: 0.06, vol: 0.14, at: t, prio: 3 });
      tone({ type: 'square', freq: 1760, dur: 0.15, vol: 0.16, at: t + 0.06, prio: 3 });
    },
    deactivated: function () {
      resume();
      const t = ctx ? ctx.currentTime : 0;
      const notes = [392, 349.23, 311.13, 261.63];
      for (let i = 0; i < notes.length; i++) {
        tone({ type: 'sawtooth', freq: notes[i], dur: 0.2, vol: 0.18, filterFreq: 1100, at: t + i * 0.17, prio: 5 });
      }
    }
  };

  /* 1980s Synthwave Chiptune Driving Loop */
  const BASS_SEQ = [
    110, 110, 220, 110, 110, 110, 220, 110,
    87.31, 87.31, 174.61, 87.31, 98, 98, 196, 98,
    130.81, 130.81, 261.63, 130.81, 110, 110, 220, 110,
    98, 98, 196, 98, 82.41, 98, 110, 130.81
  ];
  const LEAD_SEQ = [
    440, 0, 523.25, 0, 659.25, 587.33, 523.25, 0,
    349.23, 0, 440, 0, 587.33, 523.25, 493.88, 392,
    523.25, 0, 659.25, 0, 783.99, 659.25, 587.33, 523.25,
    493.88, 392, 440, 523.25, 659.25, 0, 587.33, 0
  ];

  function scheduleMusic() {
    if (!ctx || !musicTimer) return;
    const tempo = 132 + Math.min(24, (getIntensity() - 1) * 6);
    const stepDur = 60 / tempo / 2; // 8th notes
    while (nextNoteT < ctx.currentTime + 0.16) {
      if (sfxOn && musicOn) {
        const idx = step % BASS_SEQ.length;
        const bass = BASS_SEQ[idx];
        const lead = LEAD_SEQ[idx];
        tone({
          dest: musicBus,
          type: 'sawtooth',
          freq: bass,
          dur: stepDur * 0.82,
          vol: 0.16,
          filterFreq: 520,
          at: nextNoteT
        });
        if (lead > 0) {
          tone({
            dest: musicBus,
            type: 'square',
            freq: lead,
            dur: stepDur * 0.65,
            vol: 0.085,
            at: nextNoteT
          });
        }
        if (idx % 4 === 0) {
          tone({
            dest: musicBus,
            type: 'sine',
            freq: 130,
            endFreq: 42,
            dur: 0.09,
            vol: 0.22,
            at: nextNoteT
          });
        } else if (idx % 4 === 2) {
          noise({
            dest: musicBus,
            filterType: 'highpass',
            freq: 2600,
            dur: 0.055,
            vol: 0.08,
            at: nextNoteT
          });
        }
      }
      nextNoteT += stepDur;
      step++;
    }
  }

  function startMusic(intensityFn) {
    if (typeof intensityFn === 'function') getIntensity = intensityFn;
    resume();
    if (!ctx) return;
    if (musicTimer) return;
    nextNoteT = ctx.currentTime + 0.05;
    musicTimer = setInterval(scheduleMusic, 55);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function setSfx(on) {
    sfxOn = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('fd_sfx', sfxOn ? '1' : '0'); } catch (e) {}
    if (master && ctx) master.gain.setValueAtTime(sfxOn ? 0.65 : 0, ctx.currentTime);
  }

  function setMusic(on) {
    musicOn = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('fd_music', musicOn ? '1' : '0'); } catch (e) {}
    if (musicBus && ctx) musicBus.gain.setValueAtTime(musicOn ? 0.28 : 0, ctx.currentTime);
  }

  function toggleMuteAll() {
    const next = !(sfxOn && musicOn);
    setSfx(next);
    setMusic(next);
    return next;
  }

  FD.Audio = {
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    init: init,
    resume: resume,
    setSfx: setSfx,
    setMusic: setMusic,
    toggleMuteAll: toggleMuteAll,
    startMusic: startMusic,
    stopMusic: stopMusic,
    sfx: sfx
  };
})(typeof window !== 'undefined' ? window : globalThis);
