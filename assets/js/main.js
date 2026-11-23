/* Luxe Aura — site interactions (no dependencies). 3D hair lives in hair.js. */
(() => {
  const doc = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* nav: solid after scrolling */
  const nav = document.querySelector('[data-nav]');
  const onScroll = () => nav && nav.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* mobile menu */
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  const setMenu = open => {
    doc.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', !open);
  };
  toggle && toggle.addEventListener('click', () => setMenu(!doc.classList.contains('menu-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (toggle) setMenu(false); closeLightbox(); } });

  /* reveal on scroll */
  const reveals = document.querySelectorAll('.reveal, .review-card');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));

  /* statement: words fill with gold as you scroll */
  const fill = document.querySelector('[data-fill]');
  const words = fill ? [...fill.querySelectorAll('.fill-text span')] : [];
  if (words.length) {
    const upd = () => {
      const r = fill.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height * 0.9)));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < n));
    };
    addEventListener('scroll', upd, { passive: true });
    upd();
  }

  /* before / after slider */
  const frame = document.querySelector('[data-ba-frame]');
  if (frame) {
    const range = frame.querySelector('[data-ba-range]');
    const set = v => frame.style.setProperty('--pos', v + '%');
    range.addEventListener('input', () => set(range.value));
    let drag = false;
    const move = e => { const r = frame.getBoundingClientRect(); const v = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)); range.value = v; set(v); };
    frame.addEventListener('pointerdown', e => { drag = true; frame.setPointerCapture(e.pointerId); move(e); });
    frame.addEventListener('pointermove', e => drag && move(e));
    frame.addEventListener('pointerup', () => { drag = false; });
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting || reduce) return;
      o.disconnect();
      const t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 1800); const v = 50 + Math.sin(k * Math.PI * 2) * 32 * (1 - k); range.value = v; set(v); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.5 }).observe(frame);
    const before = frame.querySelector('[data-before]'), after = frame.querySelector('[data-after]');
    const base = before.getAttribute('src').replace(/[^/]+-before\.webp$/, '');
    // warm the cache for the other pairs once the section is near
    new IntersectionObserver(([e], o) => { if (!e.isIntersecting) return; o.disconnect(); document.querySelectorAll('[data-ba]').forEach(t => { ['before', 'after'].forEach(s => { const i = new Image(); i.src = `${base}${t.dataset.ba}-${s}.webp`; }); }); }, { rootMargin: '400px' }).observe(frame);
    document.querySelectorAll('[data-ba]').forEach(tab => tab.addEventListener('click', () => {
      const k = tab.dataset.ba, label = tab.textContent.replace(/^\d+/, '').trim().toLowerCase();
      document.querySelectorAll('[data-ba]').forEach(t => { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab); });
      document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== k; });
      frame.classList.add('swap');
      setTimeout(() => {
        before.src = `${base}${k}-before.webp`; after.src = `${base}${k}-after.webp`;
        before.alt = `Before: ${label}`; after.alt = `After: ${label}`;
        range.value = 50; set(50);
        frame.classList.remove('swap');
      }, 240);
    }));
  }

  /* 3D ring carousel: auto-rotates, drag / swipe to spin */
  const vp = document.querySelector('[data-ring]');
  if (vp) {
    const ring = vp.querySelector('.ring');
    let angle = 0, vel = reduce ? 0 : -0.06, dragging = false, lastX = 0, downX = 0, visible = false;
    const tick = () => {
      if (!dragging) { angle += vel; vel += ((reduce ? 0 : -0.06) - vel) * 0.02; }
      ring.style.transform = `translateZ(calc(var(--r) * -1)) rotateY(${angle}deg)`;
      if (visible) requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) requestAnimationFrame(tick); }).observe(vp);
    vp.addEventListener('pointerdown', e => { dragging = true; lastX = downX = e.clientX; vp.classList.add('grab'); });
    addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; angle += dx * 0.25; vel = dx * 0.25; });
    addEventListener('pointerup', () => { dragging = false; vp.classList.remove('grab'); });
    vp.addEventListener('click', e => { if (Math.abs(e.clientX - downX) > 6) e.preventDefault(); }, true);
  }

  /* accordion: one open at a time */
  document.querySelectorAll('.accordion').forEach(acc => acc.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) acc.querySelectorAll('details[open]').forEach(o => { if (o !== d) o.open = false; });
  })));

  /* blog table of contents highlight */
  const tocLinks = [...document.querySelectorAll('.toc a')];
  if (tocLinks.length) {
    const map = new Map(tocLinks.map(a => [decodeURIComponent(a.hash.slice(1)), a]));
    const tio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { tocLinks.forEach(a => a.classList.remove('is-active')); const a = map.get(e.target.id); if (a) a.classList.add('is-active'); } }), { rootMargin: '-20% 0px -70% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) tio.observe(el); });
  }

  /* lightbox */
  const lb = document.querySelector('[data-lightbox]');
  const lbImg = lb && lb.querySelector('img');
  function closeLightbox() { if (lb && !lb.hidden) { lb.hidden = true; document.body.style.overflow = ''; } }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-lightbox-src]');
    if (t && lb) {
      lbImg.src = t.dataset.lightboxSrc; lbImg.alt = (t.querySelector('img') || {}).alt || '';
      lb.hidden = false; document.body.style.overflow = 'hidden'; lb.querySelector('.lb-close').focus();
    } else if (lb && !lb.hidden && (e.target === lb || e.target.closest('.lb-close'))) closeLightbox();
  });

  /* contact forms -> compose an email to the salon */
  document.querySelectorAll('[data-mail-form]').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault();
    const note = form.querySelector('.form-note');
    const bad = [...form.querySelectorAll('[required]')].find(f => !f.value.trim() || (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value)));
    if (bad) { note.textContent = 'Please complete all required fields.'; bad.focus(); return; }
    const d = new FormData(form);
    const body = `Name: ${d.get('first')} ${d.get('last')}\nEmail: ${d.get('email')}\nSign up for news and updates: ${d.get('news') ? 'Yes' : 'No'}\n\n${d.get('message')}`;
    location.href = `mailto:help@luxeaurahair.com?subject=${encodeURIComponent('Website inquiry from ' + d.get('first'))}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Thank you! Your email app will open to send your message.';
  }));

  /* cookie notice */
  const cookie = document.querySelector('[data-cookie]');
  try {
    if (cookie && !localStorage.getItem('lxa-cookie-ok')) cookie.hidden = false;
    if (cookie) cookie.querySelector('[data-cookie-ok]').addEventListener('click', () => { cookie.hidden = true; localStorage.setItem('lxa-cookie-ok', '1'); });
  } catch (err) { /* storage blocked */ }

  /* page transitions: gold curtain on the way out; instant prefetch on hover */
  const prefetched = new Set();
  const internal = a => a && a.origin === location.origin && !a.hash && a.target !== '_blank' && !a.hasAttribute('download') && /\/$|\.html$/.test(a.pathname);
  document.addEventListener('pointerover', e => {
    const a = e.target.closest('a');
    if (!internal(a) || prefetched.has(a.href)) return;
    prefetched.add(a.href);
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = a.href; document.head.appendChild(l);
  }, { passive: true });
  if (!reduce) document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!internal(a) || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.href === location.href) return;
    e.preventDefault();
    doc.classList.add('is-leaving');
    setTimeout(() => { location.href = a.href; }, 380);
  });
  addEventListener('pageshow', () => doc.classList.remove('is-leaving', 'menu-open'));
})();
