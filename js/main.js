/* ================================================================
  MAIN.JS — Julian Green · Electroacoustic Composer
================================================================ */


// ----------------------------------------------------------------
// Navigation: scroll background & active link
// ----------------------------------------------------------------
const header      = document.getElementById('site-header');
const navLinks    = document.querySelectorAll('.nav-link');
const sections    = document.querySelectorAll('section[id]');
const menuToggle  = document.getElementById('menu-toggle');
const navMenu     = document.getElementById('nav-links');

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 50);
  highlightActiveSection();
}, { passive: true });

function highlightActiveSection() {
  const checkpoint = window.scrollY + window.innerHeight * 0.35;

  sections.forEach(section => {
    const top    = section.offsetTop;
    const bottom = top + section.offsetHeight;
    const id     = section.getAttribute('id');
    const link   = document.querySelector(`.nav-link[href="#${id}"]`);

    if (link) {
      link.classList.toggle('active', checkpoint >= top && checkpoint < bottom);
    }
  });
}

highlightActiveSection();


// ----------------------------------------------------------------
// Mobile menu
// ----------------------------------------------------------------
menuToggle.addEventListener('click', () => {
  const isOpen = navMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

navMenu.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});


// ----------------------------------------------------------------
// Works filter
// ----------------------------------------------------------------
const filterTabs = document.querySelectorAll('.filter-tab');
const workItems  = document.querySelectorAll('.work-item');

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const filter = tab.dataset.filter;

    filterTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    workItems.forEach(item => {
      const visible = filter === 'all' || item.dataset.category === filter;
      item.classList.toggle('hidden', !visible);
    });
  });
});


// ----------------------------------------------------------------
// Footer: keep copyright year current
// ----------------------------------------------------------------
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();


// ----------------------------------------------------------------
// Section headings: mirror text into data-text for glitch effect
// ----------------------------------------------------------------
document.querySelectorAll('.section-heading').forEach(el => {
  el.setAttribute('data-text', el.textContent.trim());
});


// ----------------------------------------------------------------
// Scroll reveal — fade + slide up as elements enter the viewport
// ----------------------------------------------------------------
const revealEls = document.querySelectorAll(
  '.event-item, .about-grid, .about-links, .contact-content'
);

revealEls.forEach((el, i) => {
  el.setAttribute('data-reveal', '');
  const delay = i % 4;
  if (delay > 0) el.setAttribute('data-reveal-delay', String(delay));
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
);

revealEls.forEach(el => revealObserver.observe(el));


// ----------------------------------------------------------------
// Glitch flicker — random distortion bursts on overview name & logo
// ----------------------------------------------------------------
const CHANCE   = 0.14;
const INTERVAL = 2600;

function maybeGlitch() {
  document.querySelectorAll('.overview-name, .nav-logo').forEach(el => {
    if (Math.random() > CHANCE) return;

    const dx  = (Math.random() - 0.5) * 9;
    const dy  = (Math.random() - 0.5) * 4;
    const hue = Math.random() * 60 + 260; // purple-to-blue band

    el.style.transform  = `translate(${dx}px, ${dy}px)`;
    el.style.filter     = `hue-rotate(${hue}deg) saturate(5)`;
    el.style.textShadow = `${-dx}px 0 rgba(185,126,248,0.9), ${dx}px 0 rgba(251,191,36,0.9)`;

    setTimeout(() => {
      el.style.transform  = '';
      el.style.filter     = '';
      el.style.textShadow = '';
    }, 55 + Math.random() * 110);
  });
}

setInterval(maybeGlitch, INTERVAL);


// ----------------------------------------------------------------
// Easter egg — type "again" anywhere to trigger the signal transition
// ----------------------------------------------------------------
(function () {
  let buffer  = '';
  const TRIGGER = 'again';

  const FONTS = [
    "'Space Grotesk', sans-serif",
    "'Space Mono', monospace",
    "'Syne', sans-serif",
    'Georgia, serif',
    "'Times New Roman', serif",
    'Courier New, monospace',
    'Impact, sans-serif',
    'Arial, sans-serif',
    'Garamond, serif',
    'Palatino, serif',
    'Futura, sans-serif',
    'cursive',
    'fantasy',
  ];

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    buffer = (buffer + e.key.toLowerCase()).slice(-TRIGGER.length);
    if (buffer === TRIGGER) { startTransition(); buffer = ''; }
  });

  function startTransition() {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'overflow:hidden', 'pointer-events:none',
      'background:transparent', 'transition:background 0.3s',
    ].join(';');
    document.body.appendChild(overlay);

    const LABELS   = ['Again', 'again', 'AGAIN', 'Again', 'again'];
    const WEIGHTS  = ['300', '400', '500', '700', '800'];
    const STYLES   = ['normal', 'normal', 'normal', 'italic'];
    const COLORS   = ['#ffffff', '#ffffff', '#b97ef8', '#e0e0e0', 'rgba(255,255,255,0.5)'];

    let count    = 0;
    const MAX    = 55;
    let delay    = 550;

    // Fade background to black as words accumulate
    let darkness = 0;
    const darken = setInterval(() => {
      darkness = Math.min(0.96, darkness + 0.012);
      overlay.style.background = `rgba(0,0,0,${darkness})`;
      if (darkness >= 0.96) clearInterval(darken);
    }, 120);

    function spawn() {
      if (count >= MAX) {
        setTimeout(() => { window.location.href = '/signal'; }, 600);
        return;
      }

      const word    = document.createElement('span');
      const font    = FONTS[Math.floor(Math.random() * FONTS.length)];
      const size    = 18 + Math.random() * 90;
      const x       = Math.random() * 88;
      const y       = Math.random() * 88;
      const rot     = (Math.random() - 0.5) * 28;
      const opacity = 0.35 + Math.random() * 0.65;
      const label   = LABELS[Math.floor(Math.random() * LABELS.length)];
      const weight  = WEIGHTS[Math.floor(Math.random() * WEIGHTS.length)];
      const style   = STYLES[Math.floor(Math.random() * STYLES.length)];
      const color   = COLORS[Math.floor(Math.random() * COLORS.length)];

      word.textContent = label;
      word.style.cssText = [
        'position:absolute',
        `left:${x}%`,
        `top:${y}%`,
        `font-family:${font}`,
        `font-size:${size}px`,
        `font-weight:${weight}`,
        `font-style:${style}`,
        `color:${color}`,
        'opacity:0',
        `transform:rotate(${rot}deg)`,
        'transition:opacity 0.5s ease',
        'white-space:nowrap',
        'pointer-events:none',
        'user-select:none',
      ].join(';');

      overlay.appendChild(word);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        word.style.opacity = String(opacity);
      }));

      count++;
      delay = Math.max(70, delay * 0.91);
      setTimeout(spawn, delay);
    }

    spawn();
  }
}());
