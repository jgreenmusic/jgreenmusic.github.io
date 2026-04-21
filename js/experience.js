/* ================================================================
  EXPERIENCE.JS — Notification Panel Remixer
================================================================ */

(function () {
  'use strict';

  const TRIGGER_DELAY         = 20000;
  const NOTIFICATION_INTERVAL = 7500;
  const CARD_W                = 320;
  const CARD_H                = 155;
  const NAV_OFFSET            = 70;

  const SAMPLES = [
    { id: 'again',     src: 'assets/audio/samples/again.mp3',    type: 'sine',     freq: 110, detune: 0   },
    { id: 'limitless', src: 'assets/audio/samples/limitless.mp3',type: 'triangle', freq: 165, detune: 7   },
    { id: 'vestige',   src: 'assets/audio/samples/vestige.mp3',  type: 'sawtooth', freq: 220, detune: -5  },
    { id: 'synapses',  src: 'assets/audio/samples/synapses.mp3', type: 'sine',     freq: 73,  detune: 12  },
    { id: 'noumenics', src: 'assets/audio/samples/noumenics.mp3',type: 'triangle', freq: 294, detune: -3  },
  ];

  const NOTIFICATIONS = [
    {
      app:    'Signal',
      icon:   '◈',
      message:'Something that should not be here has located this page.',
      actions:['Deny', 'Allow'],
      loudOn: 'Allow',
    },
    {
      app:    'Memory',
      icon:   '◎',
      message:'A fragment has surfaced. It does not belong to this session.',
      actions:['Ignore', 'Recover'],
      loudOn: 'Recover',
      glitch: true,
    },
    {
      app:    'Process',
      icon:   '⟁',
      message:'An unregistered process is listening. It has been listening since before you arrived.',
      actions:['Stop', 'Continue'],
      loudOn: 'Continue',
    },
    {
      app:    'Unknown',
      icon:   '▣',
      message:'You are being assembled. This is not a malfunction.',
      actions:['Block', 'Allow'],
      loudOn: 'Allow',
      glitch: true,
    },
    {
      app:    'Cortex',
      icon:   '⬡',
      message:'It knows your name. It has always known your name.',
      actions:['Delete', 'Keep'],
      loudOn: 'Keep',
      glitch: true,
    },
    {
      app:      'Archive',
      icon:     '↓',
      message:  'The assembly is complete. You participated. Download what was made from you?',
      actions:  ['Discard', 'Download'],
      sample:   null,
      loudOn:   null,
      isReveal: true,
    },
  ];

  // Shuffle sample IDs and assign one to each non-reveal notification
  (function assignSamples() {
    const ids = SAMPLES.map(s => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    let s = 0;
    NOTIFICATIONS.forEach(n => { if (!n.isReveal) n.sample = ids[s++]; });
  }());


  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  let audioCtx       = null;
  let masterGain     = null;
  let recorder       = null;
  let recordedChunks = [];
  let isRecording    = false;
  let notifIndex     = 0;
  let hasStarted     = false;
  let container      = null;
  let usedZones      = [];
  let activeSources     = [];   // tracks every OscillatorNode + AudioBufferSourceNode
  let isStopped         = false; // set true on fadeout — blocks all new audio creation
  let liveCards         = 0;    // how many notification cards are currently on screen
  let interactedCount   = 0;    // how many sample notifications the user has acted on
  let revealShown       = false; // has the Archive card been shown yet


  // ----------------------------------------------------------------
  // Audio — AudioContext created on first user gesture
  // ----------------------------------------------------------------
  function initAudio() {
    if (audioCtx) return;

    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;

    // Compressor prevents clipping as layers stack up
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value      = 10;
    compressor.ratio.value     = 6;
    compressor.attack.value    = 0.003;
    compressor.release.value   = 0.25;

    // Main playback path: masterGain → compressor → destination
    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);

    // Parallel recording tap using ScriptProcessorNode (mono, 1 channel)
    recorder = audioCtx.createScriptProcessor(4096, 1, 1);
    recorder.onaudioprocess = (e) => {
      if (!isRecording) return;
      try {
        recordedChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        // Pass silence to output — this channel is just for capture
        e.outputBuffer.getChannelData(0).fill(0);
      } catch (_) {}
    };

    // Tap the master gain into the recorder; output to a tiny gain to keep graph alive
    const tap = audioCtx.createGain();
    tap.gain.value = 0.001; // near-silent, just keeps the node active
    masterGain.connect(recorder);
    recorder.connect(tap);
    tap.connect(audioCtx.destination);

    isRecording = true;
  }

  function triggerSample(sampleId, loud) {
    if (!sampleId || isStopped) return;

    // Always init + resume inside a user-gesture callback
    initAudio();
    audioCtx.resume().then(() => {
      if (isStopped) return;
      const sample    = SAMPLES.find(s => s.id === sampleId);
      if (!sample) return;
      const targetVol = loud ? 0.22 : 0.08;

      fetch(sample.src)
        .then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => { if (!isStopped) playBuffer(decoded, targetVol); })
        .catch(() => { if (!isStopped) playFallback(sample, targetVol); });
    });
  }

  function playBuffer(decoded, vol) {
    const src  = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.loop   = true;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.5);

    src.connect(gain);
    gain.connect(masterGain);
    src.start();
    activeSources.push(src);
  }

  function makeDistortionCurve(amount) {
    const n      = 512;
    const curve  = new Float32Array(n);
    const deg    = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x    = (i * 2) / n - 1;
      curve[i]   = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function playFallback(sample, vol) {
    const now = audioCtx.currentTime;

    const osc       = audioCtx.createOscillator();
    osc.type        = sample.type;
    osc.frequency.value = sample.freq;
    osc.detune.value    = sample.detune;

    // Pitch glitch — random stutter jumps scheduled ahead
    for (let i = 0; i < 8; i++) {
      const t      = now + 1 + i * (0.4 + Math.random() * 1.2);
      const jitter = (Math.random() - 0.5) * sample.freq * 1.8;
      osc.frequency.setValueAtTime(sample.freq + jitter, t);
      osc.frequency.linearRampToValueAtTime(sample.freq, t + 0.08 + Math.random() * 0.15);
    }

    // Slow LFO for movement
    const lfo     = audioCtx.createOscillator();
    lfo.frequency.value = 0.08 + Math.random() * 0.35;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 28 + Math.random() * 40;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Fast tremolo LFO — stutter amplitude
    const tremLfo     = audioCtx.createOscillator();
    tremLfo.frequency.value = 6 + Math.random() * 14;
    const tremGain    = audioCtx.createGain();
    tremGain.gain.value = 0.35;
    tremLfo.connect(tremGain);

    // Bandpass filter for gritty resonance
    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 220 + Math.random() * 600;
    filter.Q.value         = 6 + Math.random() * 8;

    // WaveShaper distortion
    const shaper   = audioCtx.createWaveShaper();
    shaper.curve   = makeDistortionCurve(80 + Math.random() * 120);
    shaper.oversample = '4x';

    // Post-distortion lowpass to tame harsh highs
    const shelf = audioCtx.createBiquadFilter();
    shelf.type            = 'lowpass';
    shelf.frequency.value = 1800 + Math.random() * 800;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.5);
    tremGain.connect(gain.gain); // tremolo modulates gain directly

    osc.connect(filter);
    filter.connect(shaper);
    shaper.connect(shelf);
    shelf.connect(gain);
    gain.connect(masterGain);

    osc.start();
    lfo.start();
    tremLfo.start();
    activeSources.push(osc, lfo, tremLfo);
  }


  // ----------------------------------------------------------------
  // WAV encoder (mono, 16-bit PCM)
  // ----------------------------------------------------------------
  function encodeWAV(chunks, sampleRate) {
    const total  = chunks.reduce((n, c) => n + c.length, 0);
    const buffer = new ArrayBuffer(44 + total * 2);
    const view   = new DataView(buffer);

    function str(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }

    str(0,  'RIFF');
    view.setUint32(4,  36 + total * 2,  true);
    str(8,  'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16,              true);
    view.setUint16(20, 1,               true); // PCM
    view.setUint16(22, 1,               true); // mono
    view.setUint32(24, sampleRate,      true);
    view.setUint32(28, sampleRate * 2,  true);
    view.setUint16(32, 2,               true);
    view.setUint16(34, 16,              true);
    str(36, 'data');
    view.setUint32(40, total * 2,       true);

    let off = 44;
    chunks.forEach(chunk => {
      for (let i = 0; i < chunk.length; i++) {
        view.setInt16(off, Math.max(-1, Math.min(1, chunk[i])) * 0x7FFF, true);
        off += 2;
      }
    });

    return buffer;
  }

  function downloadWAV() {
    if (!audioCtx || recordedChunks.length === 0) return;
    isRecording = false;
    const wav  = encodeWAV(recordedChunks, audioCtx.sampleRate);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `julian-green-remix-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  function stopAllAudio() {
    isStopped   = true;
    isRecording = false;
    activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
    activeSources = [];
    if (audioCtx) {
      audioCtx.close();
      audioCtx   = null;
      masterGain = null;
    }
  }

  function fadeOutAndStop() {
    console.log('[XP] fadeOutAndStop called — audioCtx:', audioCtx ? audioCtx.state : 'null');
    if (isStopped) return;
    if (!audioCtx || !masterGain) { stopAllAudio(); return; }

    isStopped   = true;
    isRecording = false;

    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 2.5);

    const sources = activeSources.splice(0);
    setTimeout(() => {
      sources.forEach(s => { try { s.stop(); } catch (_) {} });
      if (audioCtx) { audioCtx.close(); audioCtx = null; masterGain = null; }
    }, 2700);
  }


  // ----------------------------------------------------------------
  // Positioning
  // ----------------------------------------------------------------
  const ZONES = [
    { x: [8,  22], y: [10, 25] },   // top-left
    { x: [55, 70], y: [10, 25] },   // top-right
    { x: [8,  22], y: [55, 72] },   // bottom-left
    { x: [55, 70], y: [55, 72] },   // bottom-right
    { x: [35, 50], y: [30, 50] },   // center
    { x: [8,  22], y: [35, 48] },   // mid-left
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function nextPos() {
    if (usedZones.length >= ZONES.length) usedZones = [];
    const available = ZONES.map((z, i) => i).filter(i => !usedZones.includes(i));
    const pick      = available[Math.floor(Math.random() * available.length)];
    usedZones.push(pick);
    const z = ZONES[pick];
    const x = Math.min((rand(z.x[0], z.x[1]) / 100) * window.innerWidth,  window.innerWidth  - CARD_W - 12);
    const y = Math.min((rand(z.y[0], z.y[1]) / 100) * window.innerHeight, window.innerHeight - CARD_H - 12);
    return { x: Math.max(12, x), y: Math.max(NAV_OFFSET + 8, y) };
  }


  // ----------------------------------------------------------------
  // Notification UI
  // ----------------------------------------------------------------
  function buildContainer() {
    container    = document.createElement('div');
    container.id = 'xp-container';
    document.body.appendChild(container);
  }

  function showNotification(notif) {
    const pos  = nextPos();
    const card = document.createElement('div');
    card.className = 'xp-card' + (notif.isReveal ? ' xp-reveal' : '');
    card.style.left = pos.x + 'px';
    card.style.top  = pos.y + 'px';

    card.innerHTML = `
      <div class="xp-card-inner">
        <div class="xp-header">
          <span class="xp-icon">${notif.icon}</span>
          <span class="xp-app">${notif.app}</span>
          <span class="xp-time">now</span>
          <button class="xp-close" aria-label="Close">✕</button>
        </div>
        <p class="xp-message">${notif.message}</p>
        <div class="xp-actions">
          ${notif.actions.map(a => `<button class="xp-btn">${a}</button>`).join('')}
        </div>
      </div>
    `;

    if (notif.isReveal) revealShown = true;
    liveCards++;
    container.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('xp-visible')));

    let dismissed = false;
    let autoDismissTimer;

    function maybeShowReveal() {
      // All 5 sample cards interacted with and Archive not yet shown → show it now
      const sampleCount = NOTIFICATIONS.filter(n => !n.isReveal).length;
      if (!revealShown && interactedCount >= sampleCount) {
        const reveal = NOTIFICATIONS.find(n => n.isReveal);
        if (reveal) showNotification(reveal);
      }
    }

    function closeCard() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(autoDismissTimer);
      liveCards--;
      dismiss(card);
    }

    card.querySelector('.xp-close').addEventListener('click', (e) => {
      e.stopPropagation();
      if (notif.isReveal) {
        fadeOutAndStop();
        closeAllCards();
      } else {
        closeCard();
      }
    });

    card.querySelectorAll('.xp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.textContent.trim();
        if (notif.isReveal) {
          if (action === 'Download') downloadWAV();
          fadeOutAndStop();
          closeAllCards();
          return;
        }
        if (notif.glitch) triggerScreenGlitch();
        triggerSample(notif.sample, action === notif.loudOn);
        interactedCount++;
        maybeShowReveal();
        closeCard();
      });
    });

    autoDismissTimer = setTimeout(() => closeCard(), notif.isReveal ? 15000 : 8000);
  }

  function closeAllCards() {
    if (container) container.querySelectorAll('.xp-card').forEach(c => dismiss(c));
  }

  function dismiss(card) {
    card.style.transition = 'opacity 280ms ease, transform 280ms ease';
    card.classList.remove('xp-visible');
    setTimeout(() => card && card.remove(), 300);
  }


  // ----------------------------------------------------------------
  // Screen glitch — visual flash + noise burst on selected cards
  // ----------------------------------------------------------------
  let glitchStylesInjected = false;

  function injectGlitchCSS() {
    if (glitchStylesInjected) return;
    glitchStylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      #xp-glitch-overlay {
        position: fixed; inset: 0; pointer-events: none; z-index: 99998;
        opacity: 0; mix-blend-mode: screen;
      }
      #xp-glitch-overlay.xp-go {
        animation: xp-overlay-flash 0.48s steps(1) forwards;
      }
      @keyframes xp-overlay-flash {
        0%   { opacity:0; }
        6%   { opacity:1; background:rgba(240,60,60,0.12); transform:translate(4px,-2px); }
        13%  { opacity:0; transform:none; }
        20%  { opacity:0.8; background:rgba(185,126,248,0.18); transform:translate(-5px,1px) scaleY(1.002); }
        27%  { opacity:0; transform:none; }
        35%  { opacity:1; background:rgba(240,60,60,0.22); transform:translate(6px,0) skewX(-1.5deg); }
        43%  { opacity:0.4; transform:skewX(1deg); }
        55%  { opacity:0; transform:none; }
        68%  { opacity:0.3; background:rgba(185,126,248,0.1); }
        80%  { opacity:0; }
        100% { opacity:0; }
      }
      body.xp-body-glitch {
        animation: xp-body-corrupt 0.48s steps(2) forwards;
      }
      @keyframes xp-body-corrupt {
        0%   { filter:none; }
        14%  { filter:hue-rotate(80deg) contrast(1.5) saturate(2.5); }
        28%  { filter:hue-rotate(-20deg) contrast(1.2) brightness(1.1); }
        45%  { filter:saturate(4) brightness(1.3) hue-rotate(160deg); }
        62%  { filter:hue-rotate(200deg) contrast(1.6); }
        78%  { filter:hue-rotate(0deg) contrast(1.1); }
        100% { filter:none; }
      }
    `;
    document.head.appendChild(s);
  }

  function playGlitchNoise() {
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const duration = 0.32;
      const samples  = Math.ceil(ctx.sampleRate * duration);
      const buf      = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data     = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

      const src    = ctx.createBufferSource();
      src.buffer   = buf;

      const bp     = ctx.createBiquadFilter();
      bp.type      = 'bandpass';
      bp.frequency.value = 2800 + Math.random() * 3500;
      bp.Q.value   = 0.7;

      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(180);

      const gain   = ctx.createGain();
      const now    = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(bp);
      bp.connect(shaper);
      shaper.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      src.onended = () => ctx.close();
    } catch (_) {}
  }

  function triggerScreenGlitch() {
    injectGlitchCSS();

    const overlay = document.createElement('div');
    overlay.id    = 'xp-glitch-overlay';
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('xp-go');
      document.body.classList.add('xp-body-glitch');
    });

    setTimeout(() => {
      document.body.classList.remove('xp-body-glitch');
      overlay.remove();
    }, 520);

    playGlitchNoise();
  }


  // ----------------------------------------------------------------
  // Sequencer
  // ----------------------------------------------------------------
  function next() {
    if (notifIndex >= NOTIFICATIONS.length) return;
    const notif = NOTIFICATIONS[notifIndex];
    notifIndex++;
    if (!(notif.isReveal && revealShown)) {
      showNotification(notif);
    }
    if (notifIndex < NOTIFICATIONS.length) setTimeout(next, NOTIFICATION_INTERVAL);
  }

  function start() {
    if (hasStarted) return;
    hasStarted = true;
    buildContainer();
    // Do NOT init audio here — wait for first button click (user gesture required)
    next();
  }

  setTimeout(start, TRIGGER_DELAY);

})();
