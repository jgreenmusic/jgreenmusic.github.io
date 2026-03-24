/* ================================================================
  MAIN.JS — Electroacoustic Composer Website
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
  // Frosted glass effect on header after first scroll
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

// Run once on load to handle direct-link arrivals
highlightActiveSection();


// ----------------------------------------------------------------
// Mobile menu
// ----------------------------------------------------------------
menuToggle.addEventListener('click', () => {
  const isOpen = navMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

// Close menu when any nav link is tapped
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

    // Update tab state
    filterTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    // Show / hide works
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
// GLITCH EFFECTS — ready to activate
//
// These are off by default. When you're ready to lean into the
// glitch aesthetic, uncomment the block below.
//
// How to use:
//   1. Add class="glitch-flicker" to any element you want to flicker.
//   2. Uncomment this block.
//   3. Tune CHANCE (0–1) and INTERVAL (ms) to taste.
// ----------------------------------------------------------------
/*
const CHANCE   = 0.12;   // probability of glitch per interval
const INTERVAL = 2200;   // ms between glitch attempts

function maybeGlitch() {
  document.querySelectorAll('.glitch-flicker').forEach(el => {
    if (Math.random() > CHANCE) return;

    const dx = (Math.random() - 0.5) * 6;
    const dy = (Math.random() - 0.5) * 4;
    const hue = Math.random() * 360;

    el.style.transform  = `translate(${dx}px, ${dy}px)`;
    el.style.filter     = `hue-rotate(${hue}deg) saturate(3)`;
    el.style.textShadow = `${dx * -1}px 0 #ff0090, ${dx}px 0 #00ff9f`;

    setTimeout(() => {
      el.style.transform  = '';
      el.style.filter     = '';
      el.style.textShadow = '';
    }, 60 + Math.random() * 120);
  });
}

setInterval(maybeGlitch, INTERVAL);
*/
