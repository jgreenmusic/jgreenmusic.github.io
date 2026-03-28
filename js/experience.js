/* ================================================================
  EXPERIENCE.JS — Notification Panel Remixer

  Users unknowingly remix Julian Green's music by interacting
  with what appears to be browser/phone notifications.
  Every action layers real-time audio.
  A final notification reveals the composition and offers WAV download.
================================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Config
  // ----------------------------------------------------------------
  const TRIGGER_DELAY         = 20000;  // ms before first notification
  const NOTIFICATION_INTERVAL = 7500;   // ms between notifications
  const CARD_W                = 320;    // approximate card width  (px)
  const CARD_H                = 155;    // approximate card height (px)
  const NAV_OFFSET            = 70;     // clear the fixed nav bar

  // Sample paths — drop real files into assets/audio/samples/ to activate
  const SAMPLES = [
    { id: 'again',     src: 'assets/audio/samples/again.wav',    type: 'sine',     freq: 110, detune: 0   },
    { id: 'limitless', src: 'assets/audio/samples/limitless.wav',type: 'triangle', freq: 165, detune: 7   },
    { id: 'vestige',   src: 'assets/audio/samples/vestige.wav',  type: 'sawtooth', freq: 220, detune: -5  },
    { id: 'synapses',  src: 'assets/audio/samples/synapses.wav', type: 'sine',     freq: 73,  detune: 12  },
    { id: 'noumenics', src: 'assets/audio/samples/noumenics.wav',type: 'triangle', freq: 294, detune: -3  },
  ];

  const NOTIFICATIONS = [
    {
      app:     'Signal',
      icon:    '◈',
      message: 'Unknown audio source detected on this page.',
      actions: ['Dismiss', 'Allow'],
      sample:  'again',
      loudOn:  'Allow',
    },
    {
      app:     'Memory',
      icon:    '◎',
      message: 'Fragment recovered · duration 00:00:03',
      actions: ['Ignore', 'Recover'],
      sample:  'limitless',
      loudOn:  'Recover',
    },
    {
      app:     'Process',
      icon:    '⟁',
      message: 'Background audio reconstruction running.',
      actions: ['Stop', 'Continue'],
      sample:  'vestige',
      loudOn:  'Continue',
    },
    {
      app:     'Unknown',
      icon:    '▣',
      message: 'Something is being assembled without your input.',
      actions: ['Block', 'Allow'],
      sample:  'synapses',
      loudOn:  'Allow',
    },
    {
      app:     'Cortex',
      icon:    '⬡',
      message: 'Pattern recognition complete. 5 layers identified.',
      actions: ['Delete', 'Keep'],
      sample:  'noumenics',
      loudOn:  'Keep',
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
  let audioCtx        = null;
  let masterGain      = null;
  let scriptProcessor = null;
  let recordedChunks  = [];
  let isRecording     = false;
  let notifIndex      = 0;
  let hasStarted      = false;
  let container       = null;
  let usedZones       = [];


  // ----------------------------------------------------------------
  // Audio — manual PCM capture → WAV export
  // ----------------------------------------------------------------
  function initAudio() {
    if (audioCtx) return;
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;

    // ScriptProcessorNode captures stereo PCM for WAV encoding
    scriptProcessor = audioCtx.createScriptProcessor(4096, 2, 2);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      // Copy input → output (pass-through) and record
      const L = new Float32Array(e.inputBuffer.getChannelData(0));
      const R = new Float32Array(e.inputBuffer.getChannelData(1));
      e.outputBuffer.getChannelData(0).set(L);
      e.outputBuffer.getChannelData(1).set(R);
      recordedChunks.push([L, R]);
    };

    masterGain.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
    isRecording = true;
  }

  function resumeAndRun(fn) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(fn);
    } else {
      fn();
    }
  }

  function triggerSample(sampleId, loud) {
    if (!sampleId) return;
    resumeAndRun(() => {
      const sample = SAMPLES.find(s => s.id === sampleId);
      if (!sample) return;
      const targetVol = loud ? 0.4 : 0.15;

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
    gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.4);

    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value         = 0.7;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
  }

  function playFallback(sample, vol) {
    const osc = audioCtx.createOscillator();
    osc.type            = sample.type;
    osc.frequency.value = sample.freq;
    osc.detune.value    = sample.detune;

    const lfo     = audioCtx.createOscillator();
    lfo.frequency.value = 0.15 + Math.random() * 0.25;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = 500 + Math.random() * 500;
    filter.Q.value         = 2.5;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.4);

    const reverb = makeReverb(2);

    osc.connect(filter);
    filter.connect(reverb);
    filter.connect(gain);
    reverb.connect(gain);
    gain.connect(masterGain);

    osc.start();
    lfo.start();
  }

  function makeReverb(secs) {
    const node    = audioCtx.createConvolver();
    const rate    = audioCtx.sampleRate;
    const len     = rate * secs;
    const impulse = audioCtx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    node.buffer = impulse;
    return node;
  }


  // ----------------------------------------------------------------
  // WAV encoder
  // ----------------------------------------------------------------
  function encodeWAV(chunks, sampleRate) {
    const numCh      = 2;
    const totalFrames = chunks.reduce((n, c) => n + c[0].length, 0);
    const byteLen    = 44 + totalFrames * numCh * 2;
    const buffer     = new ArrayBuffer(byteLen);
    const view       = new DataView(buffer);

    function str(offset, s) {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }

    str(0,  'RIFF');
    view.setUint32(4,  byteLen - 8,              true);
    str(8,  'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16,                        true);
    view.setUint16(20, 1,                         true); // PCM
    view.setUint16(22, numCh,                     true);
    view.setUint32(24, sampleRate,                true);
    view.setUint32(28, sampleRate * numCh * 2,    true);
    view.setUint16(32, numCh * 2,                 true);
    view.setUint16(34, 16,                        true);
    str(36, 'data');
    view.setUint32(40, totalFrames * numCh * 2,   true);

    let offset = 44;
    chunks.forEach(([L, R]) => {
      for (let i = 0; i < L.length; i++) {
        view.setInt16(offset, Math.max(-1, Math.min(1, L[i])) * 0x7FFF, true); offset += 2;
        view.setInt16(offset, Math.max(-1, Math.min(1, R[i])) * 0x7FFF, true); offset += 2;
      }
    });

    return buffer;
  }

  function downloadWAV() {
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
  // Positioning — spread cards around the viewport
  // ----------------------------------------------------------------
  const ZONES = [
    { xFn: () => rand(16, 28),  yFn: () => rand(12, 28)  }, // top-left
    { xFn: () => rand(55, 70),  yFn: () => rand(12, 28)  }, // top-right
    { xFn: () => rand(16, 28),  yFn: () => rand(55, 72)  }, // bottom-left
    { xFn: () => rand(55, 70),  yFn: () => rand(55, 72)  }, // bottom-right
    { xFn: () => rand(35, 50),  yFn: () => rand(30, 50)  }, // center
    { xFn: () => rand(16, 28),  yFn: () => rand(35, 50)  }, // mid-left
  ];

  function rand(min, max) { return min + Math.random() * (max - min); }

  function nextZone() {
    if (usedZones.length >= ZONES.length) usedZones = [];
    const available = ZONES.filter((_, i) => !usedZones.includes(i));
    const zoneIndex = ZONES.indexOf(available[Math.floor(Math.random() * available.length)]);
    usedZones.push(zoneIndex);
    const zone = ZONES[zoneIndex];
    // Convert percentages to px, clamped within viewport
    const x = Math.min((zone.xFn() / 100) * window.innerWidth,  window.innerWidth  - CARD_W - 16);
    const y = Math.min((zone.yFn() / 100) * window.innerHeight, window.innerHeight - CARD_H - 16);
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
    const pos  = nextZone();
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

    // Close ✕ — quietly layers audio
    card.querySelector('.xp-close').addEventListener('click', () => {
      triggerSample(notif.sample, false);
      dismiss(card);
    });

    // Action buttons — every action layers audio (loud or quiet)
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
    if (notifIndex < NOTIFICATIONS.length) {
      setTimeout(next, NOTIFICATION_INTERVAL);
    }
  }

  function start() {
    if (hasStarted) return;
    hasStarted = true;
    buildContainer();
    initAudio();
    next();
  }

  // Resume suspended context on any interaction
  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });

  setTimeout(start, TRIGGER_DELAY);

})();
