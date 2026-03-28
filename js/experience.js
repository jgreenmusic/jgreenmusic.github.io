/* ================================================================
  EXPERIENCE.JS — Notification Panel Remixer

  Users unknowingly remix Julian Green's music by interacting
  with what appears to be browser/phone notifications.
  Every action — dismiss, allow, block — layers audio.
  A final notification reveals the composition and offers download.
================================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Config
  // ----------------------------------------------------------------
  const TRIGGER_DELAY        = 20000;  // ms before first notification
  const NOTIFICATION_INTERVAL = 7500;  // ms between notifications

  // Sample paths — drop real files into assets/audio/samples/ to replace fallback tones
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
      app:     'Archive',
      icon:    '↓',
      message: 'You just made something. It was assembled from fragments of music by Julian Green. Download it?',
      actions: ['Discard', 'Download'],
      sample:  null,
      loudOn:  null,
      isReveal: true,
    },
  ];


  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  let audioCtx       = null;
  let destNode       = null;
  let masterGain     = null;
  let mediaRecorder  = null;
  let recordedChunks = [];
  let notifIndex     = 0;
  let hasStarted     = false;
  let container      = null;


  // ----------------------------------------------------------------
  // Audio engine
  // ----------------------------------------------------------------
  function initAudio() {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;

    destNode = audioCtx.createMediaStreamDestination();
    masterGain.connect(audioCtx.destination);
    masterGain.connect(destNode);

    mediaRecorder = new MediaRecorder(destNode.stream, { mimeType: getSupportedMimeType() });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start(100);
  }

  function getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function triggerSample(sampleId, loud) {
    if (!audioCtx || !sampleId) return;
    const sample = SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;

    const targetGain = loud ? 0.35 : 0.12;

    fetch(sample.src)
      .then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => playBuffer(decoded, targetGain))
      .catch(() => playFallback(sample, targetGain));
  }

  function playBuffer(decoded, targetGain) {
    const src  = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.loop   = true;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 2.5);

    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value         = 0.8;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
  }

  function playFallback(sample, targetGain) {
    // Oscillator + slow LFO modulation + reverb
    const osc  = audioCtx.createOscillator();
    osc.type   = sample.type;
    osc.frequency.value = sample.freq;
    osc.detune.value    = sample.detune;

    const lfo     = audioCtx.createOscillator();
    lfo.frequency.value = 0.18 + Math.random() * 0.2;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = 500 + Math.random() * 400;
    filter.Q.value         = 3;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 3);

    const reverb = makeReverb(1.8);

    osc.connect(filter);
    filter.connect(reverb);
    filter.connect(gain);
    reverb.connect(gain);
    gain.connect(masterGain);

    osc.start();
    lfo.start();
  }

  function makeReverb(seconds) {
    const convolver = audioCtx.createConvolver();
    const rate      = audioCtx.sampleRate;
    const length    = rate * seconds;
    const impulse   = audioCtx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    convolver.buffer = impulse;
    return convolver;
  }

  function downloadRecording() {
    mediaRecorder.stop();
    mediaRecorder.onstop = () => {
      const ext  = getSupportedMimeType().includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(recordedChunks, { type: getSupportedMimeType() });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `julian-green-remix-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
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
    const card = document.createElement('div');
    card.className = 'xp-card' + (notif.isReveal ? ' xp-reveal' : '');

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

    // Close button — always dismisses, always quietly triggers sample
    card.querySelector('.xp-close').addEventListener('click', () => {
      if (notif.sample) triggerSample(notif.sample, false);
      dismiss(card);
    });

    // Action buttons
    card.querySelectorAll('.xp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.textContent.trim();

        if (notif.isReveal) {
          if (action === 'Download') downloadRecording();
          dismiss(card);
          return;
        }

        const loud = action === notif.loudOn;
        triggerSample(notif.sample, loud);
        dismiss(card);
      });
    });
  }

  function dismiss(card) {
    card.classList.remove('xp-visible');
    setTimeout(() => card && card.remove(), 380);
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

  // Resume audio context on first interaction (browser autoplay policy)
  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }, { once: true });

  // Fire after delay
  setTimeout(start, TRIGGER_DELAY);

})();
