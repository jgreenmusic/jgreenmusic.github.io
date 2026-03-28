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
    { id: 'again',     src: 'assets/audio/samples/again.wav',    type: 'sine',     freq: 110, detune: 0   },
    { id: 'limitless', src: 'assets/audio/samples/limitless.wav',type: 'triangle', freq: 165, detune: 7   },
    { id: 'vestige',   src: 'assets/audio/samples/vestige.wav',  type: 'sawtooth', freq: 220, detune: -5  },
    { id: 'synapses',  src: 'assets/audio/samples/synapses.wav', type: 'sine',     freq: 73,  detune: 12  },
    { id: 'noumenics', src: 'assets/audio/samples/noumenics.wav',type: 'triangle', freq: 294, detune: -3  },
  ];

  const NOTIFICATIONS = [
    {
      app:    'Signal',
      icon:   '◈',
      message:'Unknown audio source detected on this page.',
      actions:['Dismiss', 'Allow'],
      sample: 'again',
      loudOn: 'Allow',
    },
    {
      app:    'Memory',
      icon:   '◎',
      message:'Fragment recovered · duration 00:00:03',
      actions:['Ignore', 'Recover'],
      sample: 'limitless',
      loudOn: 'Recover',
    },
    {
      app:    'Process',
      icon:   '⟁',
      message:'Background audio reconstruction running.',
      actions:['Stop', 'Continue'],
      sample: 'vestige',
      loudOn: 'Continue',
    },
    {
      app:    'Unknown',
      icon:   '▣',
      message:'Something is being assembled without your input.',
      actions:['Block', 'Allow'],
      sample: 'synapses',
      loudOn: 'Allow',
    },
    {
      app:    'Cortex',
      icon:   '⬡',
      message:'Pattern recognition complete. 5 layers identified.',
      actions:['Delete', 'Keep'],
      sample: 'noumenics',
      loudOn: 'Keep',
    },
    {
      app:      'Archive',
      icon:     '↓',
      message:  'You just made something. It was assembled from fragments of music by Julian Green. Download it?',
      actions:  ['Discard', 'Download'],
      sample:   null,
      loudOn:   null,
      isReveal: true,
    },
  ];


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
    if (!sampleId) return;

    // Always init + resume inside a user-gesture callback
    initAudio();
    audioCtx.resume().then(() => {
      const sample    = SAMPLES.find(s => s.id === sampleId);
      if (!sample) return;
      const targetVol = loud ? 0.22 : 0.08;

      fetch(sample.src)
        .then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => playBuffer(decoded, targetVol))
        .catch(() => playFallback(sample, targetVol));
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
  }

  function playFallback(sample, vol) {
    const osc       = audioCtx.createOscillator();
    osc.type        = sample.type;
    osc.frequency.value = sample.freq;
    osc.detune.value    = sample.detune;

    // Slow LFO for movement
    const lfo     = audioCtx.createOscillator();
    lfo.frequency.value = 0.12 + Math.random() * 0.2;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 15;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = 280 + Math.random() * 320;
    filter.Q.value         = 4;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start();
    lfo.start();
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

    container.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('xp-visible')));

    card.querySelector('.xp-close').addEventListener('click', () => {
      triggerSample(notif.sample, false);
      dismiss(card);
    });

    card.querySelectorAll('.xp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.textContent.trim();
        if (notif.isReveal) {
          if (action === 'Download') downloadWAV();
          dismiss(card);
          return;
        }
        triggerSample(notif.sample, action === notif.loudOn);
        dismiss(card);
      });
    });
  }

  function dismiss(card) {
    card.classList.remove('xp-visible');
    setTimeout(() => card && card.remove(), 400);
  }


  // ----------------------------------------------------------------
  // Sequencer
  // ----------------------------------------------------------------
  function next() {
    if (notifIndex >= NOTIFICATIONS.length) return;
    showNotification(NOTIFICATIONS[notifIndex]);
    notifIndex++;
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
