// ---------- case study pages: reveals, section chip, 3D tilt ----------
const page = document.getElementById('page');

// reveal on scroll
const io = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}, { root: page, threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.r').forEach(el => io.observe(el));
// what is already on screen appears at once (no waiting on the observer, which background tabs throttle)
const revealVisible = () => { const vh = page.clientHeight; for (const el of document.querySelectorAll('.r:not(.in)')) if (el.getBoundingClientRect().top < vh * 0.92) { el.classList.add('in'); io.unobserve(el); } };
revealVisible(); setTimeout(revealVisible, 80);

// sticky chip follows the section in view
const chip = document.getElementById('chip'), chipText = chip.querySelector('span');
const sections = [...document.querySelectorAll('[data-chip]')];
const sio = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) {
    chipText.textContent = en.target.dataset.chip;
    chip.classList.toggle('show', en.target !== sections[0]);
  }
}, { root: page, threshold: 0, rootMargin: '-45% 0px -45% 0px' });
sections.forEach(s => sio.observe(s));

// 3D tilt: panels lean back as they enter from below and lie flat at the centre
const tilts = [...document.querySelectorAll('.tilt')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let ticking = false;
function tilt() {
  ticking = false;
  const vh = page.clientHeight;
  for (const el of tilts) {
    if (!el.classList.contains('in')) continue;           // the reveal transform owns it until it has appeared
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh * 0.75)));
    el.style.transform = `perspective(1400px) rotateX(${(p * 14).toFixed(2)}deg) scale(${(1 - Math.abs(p) * 0.06).toFixed(3)})`;
  }
}
if (!reduce) {
  page.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(tilt); } }, { passive: true });
  addEventListener('resize', tilt);
  // once a panel has revealed, hand its transform to the tilt
  tilts.forEach(el => el.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform') { el.style.transition = 'none'; tilt(); } }));
  setTimeout(tilt, 100);
}
