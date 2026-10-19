// shared chrome behaviour: the "?" help bubble and the Contact keycap overlay in the bottom toolbar
const help = document.getElementById('help'), helpBtn = document.getElementById('helpBtn');
if (help && helpBtn) {
  let hide = 0;
  helpBtn.addEventListener('click', () => {
    help.classList.toggle('show');
    clearTimeout(hide);
    if (help.classList.contains('show')) hide = setTimeout(() => help.classList.remove('show'), 3500);
  });
}

// ---------- contact overlay: a row of keycaps, each one also a keyboard shortcut ----------
const EMAIL = 'mallick370@gmail.com';
const KEYS = [
  { k: 'M', id: 'mail',     href: `mailto:${EMAIL}`, label: 'Email', note: 'Roles, projects, or<br>just hi.', side: 'bottom', email: true,
    icon: '<span class="ck-tile"><svg viewBox="0 0 24 24" fill="none"><path d="M3 7.5v9A1.5 1.5 0 0 0 4.5 18H6V10l6 4.2 6-4.2v8h1.5a1.5 1.5 0 0 0 1.5-1.5v-9c0-1.2-1.4-1.9-2.4-1.2L12 11 5.4 6.3C4.4 5.6 3 6.3 3 7.5Z" fill="#e03d34"/></svg></span>' },
  { k: 'L', id: 'linkedin', href: 'https://www.linkedin.com/in/mayukh-mallick-a7460916b/', label: 'LinkedIn', note: 'The work, and what I<br>learned doing it.', side: 'top',
    icon: '<span class="ck-tile"><svg viewBox="0 0 24 24"><path fill="#0a66c2" d="M6.9 8.6H3.6V20h3.3V8.6ZM5.3 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 13c0-3.2-1.7-4.7-4-4.7-1.8 0-2.7 1-3.1 1.7V8.6H10V20h3.3v-5.6c0-1.5.3-2.9 2.1-2.9 1.8 0 1.8 1.7 1.8 3V20h3.3V13Z"/></svg></span>' },
  { k: 'F', id: 'figma',    href: 'https://www.figma.com/community/file/975850110250041216', label: 'Figma community file', note: 'A file I shared with<br>the Figma community.', side: 'bottom',
    icon: '<svg class="fig" viewBox="0 0 24 36"><path fill="#f24e1e" d="M0 6a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6Z"/><path fill="#ff7262" d="M12 0h6a6 6 0 0 1 0 12h-6V0Z"/><path fill="#1abcfe" d="M12 18a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z"/><path fill="#0acf83" d="M0 30a6 6 0 0 1 6-6h6v6a6 6 0 0 1-12 0Z"/><path fill="#a259ff" d="M0 18a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6Z"/></svg>' },
  { k: 'R', id: 'resume',   href: 'https://drive.google.com/file/d/1-JZFGbHOA5dz-EjMepoAYr3hyfAK_iZG/view?usp=sharing', label: 'Resume', note: 'My resume, one<br>click away.', side: 'top',
    icon: '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="#141414" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M5.5 12.5 12 19l6.5-6.5"/></svg>' },
];

const contactBtn = document.getElementById('contactBtn');
if (contactBtn) {
  const arrow = (dir) => `<svg class="ck-pt ${dir}" viewBox="0 0 16 24" fill="none" stroke="#e5413d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v18M3.5 15.5 8 20l4.5-4.5"/></svg>`;
  const ov = document.createElement('div');
  ov.className = 'contact'; ov.id = 'contact'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Contact');
  ov.innerHTML = `
    <button class="contact-x" type="button" aria-label="Close">×</button>
    <div class="contact-in">
      <p class="ck-psst">psst, these work on your keyboard too: ${KEYS.map(k => `<kbd>${k.k}</kbd>`).join(' ')}</p>
      <div class="ck-keys">
        ${KEYS.map(k => `
        <div class="ck-slot ${k.side}">
          <p class="ck-note ck-note-top">${k.side === 'top' ? k.note + arrow('down') : ''}</p>
          <a class="ck-key ck-key-${k.id}" href="${k.href}" ${k.email ? '' : 'target="_blank" rel="noopener"'} data-key="${k.k}" aria-label="${k.label}">
            <span class="ck-cap"><span class="ck-tag">${k.k}</span>${k.icon}</span>
          </a>
          <p class="ck-note ck-note-bottom">${k.side === 'bottom' ? arrow('up') + k.note : ''}</p>
          ${k.email ? `<p class="ck-email"><span>${EMAIL}</span><button type="button" class="ck-copy" aria-label="Copy email"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg></button></p>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(ov);

  let lastFocus = null;
  const open = () => { lastFocus = document.activeElement; ov.classList.add('show'); document.body.classList.add('contact-open'); contactBtn.classList.add('on'); ov.querySelector('.ck-key').focus({ preventScroll: true }); };
  const close = () => { ov.classList.remove('show'); document.body.classList.remove('contact-open'); contactBtn.classList.remove('on'); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); };
  const isOpen = () => ov.classList.contains('show');
  contactBtn.addEventListener('click', () => (isOpen() ? close() : open()));
  ov.querySelector('.contact-x').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target === ov.querySelector('.contact-in') || e.target.classList.contains('ck-keys')) close(); });

  // keyboard: Esc closes, the letters press their keycap and follow it
  const press = (key) => {
    const a = ov.querySelector(`.ck-key[data-key="${key}"]`); if (!a) return;
    a.classList.add('down'); setTimeout(() => a.classList.remove('down'), 140);
    setTimeout(() => a.click(), 90);
  };
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const k = e.key.toUpperCase();
    if (!e.metaKey && !e.ctrlKey && !e.altKey && KEYS.some(x => x.k === k)) { e.preventDefault(); e.stopImmediatePropagation(); press(k); }
  }, true);

  // copy the address
  const copy = ov.querySelector('.ck-copy');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(EMAIL); copy.classList.add('ok'); copy.setAttribute('aria-label', 'Copied'); setTimeout(() => { copy.classList.remove('ok'); copy.setAttribute('aria-label', 'Copy email'); }, 1400); }
    catch { window.prompt('Copy the address', EMAIL); }
  });
}
