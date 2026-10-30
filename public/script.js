(() => {
  const VIDEO_URL = 'assets/hero-scrub.mp4';
  const VIDEO_BYTES = 3117727;
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const M = window.Motion;
  const motionOK = !!(M && M.animate && M.inView && M.stagger);
  if (motionOK && !RM.matches) document.documentElement.classList.add('motion-on');

  const hero = document.querySelector('.hero');
  const stage = document.querySelector('.stage');
  const video = document.getElementById('hero');
  const posterLayer = document.querySelector('.poster');
  const ring = document.querySelector('.ring');
  const cue = document.querySelector('.cue');
  const nav = document.querySelector('.nav');

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  /* split hero headlines once */
  function splitWords(el) {
    const r = rng(11 + el.textContent.length);
    const words = [];
    [...el.childNodes].forEach(n => {
      const em = n.nodeType === 1 && n.tagName === 'EM';
      n.textContent.split(/(\s+)/).forEach(t => {
        if (!t) return;
        words.push(/^\s+$/.test(t) ? { space: true } : { t, em });
      });
    });
    const total = words.filter(w => !w.space).length;
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    let wi = 0;
    words.forEach(w => {
      if (w.space) { vis.appendChild(document.createTextNode(' ')); return; }
      const ws = document.createElement(w.em ? 'em' : 'span');
      ws.className = 'w';
      ws.textContent = w.t;
      ws.style.setProperty('--th', (wi / Math.max(1, total) * 0.5 + r() * 0.04).toFixed(3));
      wi++;
      vis.appendChild(ws);
    });
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = el.textContent;
    el.textContent = '';
    el.append(sr, vis);
  }
  document.querySelectorAll('[data-split]').forEach(el => {
    if (el.dataset.split === 'blur') {
      const html = el.innerHTML;
      const label = el.textContent;
      el.innerHTML = '<span class="sr-only"></span><span class="stack" aria-hidden="true"><span class="soft">' + html + '</span><span class="sharp">' + html + '</span></span>';
      el.firstChild.textContent = label;
    } else splitWords(el);
  });

  const bands = [...document.querySelectorAll('.band')].map(el => ({
    el, a: +el.dataset.a, b: +el.dataset.b, ramp: el.dataset.ramp ? +el.dataset.ramp : 0, op: -1, k: -1
  }));
  const last = bands.length - 1;
  let loadK = 0;
  let cueOn = null, cueReady = false;

  function updateCaptions(p) {
    const c = cueReady && p < 0.04;
    if (c !== cueOn) { cueOn = c; cue.classList.toggle('show', c); }
    bands.forEach((bd, i) => {
      const { a, b } = bd;
      const f = Math.min(0.02, (b - a) / 3);
      const op = i === 0 ? 1 - smoothstep(p, b - f, b)
        : i === last ? smoothstep(p, a, a + f)
        : smoothstep(p, a, a + f) * (1 - smoothstep(p, b - f, b));
      let k = clamp((p - a) / (bd.ramp || Math.min(0.025, (b - a) * 0.35)), 0, 1);
      if (i === 0) k = Math.max(k, loadK);
      if (Math.abs(op - bd.op) > 0.004 || ((op === 0 || op === 1) && op !== bd.op)) {
        bd.op = op;
        bd.el.style.opacity = op.toFixed(3);
        bd.el.style.visibility = op === 0 ? 'hidden' : 'visible';
        bd.el.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
      }
      if (Math.abs(k - bd.k) > 0.008 || ((k === 0 || k === 1) && k !== bd.k)) {
        bd.k = k;
        bd.el.style.setProperty('--k', k.toFixed(3));
      }
    });
  }

  function heroProgress() {
    const range = hero.offsetHeight - innerHeight;
    if (range <= 0) return 0;
    return clamp(-hero.getBoundingClientRect().top / range, 0, 1);
  }

  /* gated, deadlock-safe seeks */
  let seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video.duration) return;
    t = clamp(t, 0, video.duration - 0.04);
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', () => {
    seekBusy = false;
    pendingTime = null;
    failVideo();
  });

  /* lerp loop that rests */
  let target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true;
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    requestSeek(shown * video.duration);
    updateCaptions(shown);
  }
  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver(es => { heroOnScreen = es[0].isIntersecting; if (heroOnScreen && scrubOn) onScroll(); }).observe(hero);

  /* first band opens settled: one-time load ramp */
  function runLoadRamp() {
    const t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / 1400, 0, 1);
      loadK = 1 - Math.pow(1 - t, 3);
      updateCaptions(shown);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* video as a streamed blob behind an honest ring */
  let heroInit = false, started = false, failed = false;
  function initHeroOnce() {
    if (heroInit) return;
    heroInit = true;
    posterLayer.style.backgroundImage = "url('assets/hero-poster.jpg')";
    const img = new Image();
    img.onload = startBlobFetch;
    img.onerror = startBlobFetch;
    img.src = 'assets/hero-poster.jpg';
    setTimeout(startBlobFetch, 4000);
    runLoadRamp();
  }
  function startBlobFetch() {
    if (started) return;
    started = true;
    loadHeroBlob().catch(failVideo);
  }
  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('video');
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      requestSeek(heroProgress() * video.duration);
      stage.classList.add('video-ready');
      ring.classList.add('done');
      cueReady = true;
      updateCaptions(shown);
    }, { once: true });
  }
  function failVideo() {
    if (failed) return;
    failed = true;
    ring.classList.add('done');
    cueReady = true;
    updateCaptions(shown);
    stage.classList.add('video-failed');
  }

  /* live static-hero gate */
  let scrubOn = false;
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; });
    unpinFinalStates();
    shown = target = heroProgress();
    updateCaptions(shown);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() {
    if (GATES.some(q => matchMedia(q).matches)) disableScrub();
    else enableScrub();
  }
  const MQLS = GATES.map(q => matchMedia(q));
  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));

  /* nav state, delta-gated */
  let navSolid = null;
  function updateNav() {
    const s = scrollY > 40;
    if (s !== navSolid) { navSolid = s; nav.classList.toggle('solid', s); }
  }
  addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* nav links: mark the section under the middle of the screen */
  const navLinks = [...nav.querySelectorAll('ul a')];
  const spy = new IntersectionObserver(es => es.forEach(e => {
    const a = navLinks.find(l => l.hash === '#' + e.target.id);
    e.isIntersecting ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current');
  }), { rootMargin: '-45% 0px -54% 0px' });
  navLinks.forEach(a => spy.observe(document.querySelector(a.hash)));

  /* self-drawing grain lines and growth rings */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('drawn');
    io.unobserve(e.target);
  }), { threshold: 0.3 });
  document.querySelectorAll('.grain-line, .time').forEach(el => io.observe(el));

  /* Motion: section entrances, menu, buttons, parallax */
  const spring = { type: 'spring', bounce: 0, visualDuration: 0.8 };
  if (motionOK) {
    const seen = new WeakSet();
    M.inView('.rv', el => {
      if (seen.has(el) || document.body.classList.contains('rm')) return;
      seen.add(el);
      const items = el.querySelectorAll(':scope .r');
      if (items.length) M.animate(items, { opacity: [0, 1], y: [22, 0] }, { ...spring, delay: M.stagger(0.09) });
    }, { amount: 0.15 });
    M.inView('.menu', el => {
      if (seen.has(el) || document.body.classList.contains('rm')) return;
      seen.add(el);
      M.animate(el.querySelectorAll('li'), { opacity: [0, 1], x: [-16, 0] }, { type: 'spring', bounce: 0.15, visualDuration: 0.6, delay: M.stagger(0.06, { startDelay: 0.15 }) });
    }, { amount: 0.25 });
    if (M.hover && M.press) {
      M.hover('.btn', el => {
        if (RM.matches) return;
        M.animate(el, { y: -2 }, { type: 'spring', bounce: 0.3, visualDuration: 0.3 });
        return () => M.animate(el, { y: 0 }, { type: 'spring', bounce: 0.3, visualDuration: 0.3 });
      });
      M.press('.btn', el => {
        if (RM.matches) return;
        M.animate(el, { scale: 0.96 }, { type: 'spring', bounce: 0.2, visualDuration: 0.15 });
        return () => M.animate(el, { scale: 1 }, { type: 'spring', bounce: 0.45, visualDuration: 0.35 });
      });
    }
    if (M.scroll && !RM.matches) {
      const placeImg = document.querySelector('.place-img img');
      M.scroll(M.animate(placeImg, { y: ['-8%', '0%'] }, { ease: 'linear' }), { target: document.querySelector('.place'), offset: ['start end', 'end start'] });
    }
  }

  /* the hold: brew a coffee, drop by drop */
  const brew = document.querySelector('.brew');
  const holdBtn = document.querySelector('.hold');
  const doneLine = document.querySelector('.done-line');
  const cupEl = document.querySelector('.hold .cup');
  const DONE_TEXT = 'Pronto. Aqui levou alguns segundos. No balcão, a gente não apressa.';
  let h = 0, holding = false, holdRaf = null, holdLast = 0, holdDone = false, lastH = -1;
  function writeH() {
    if (Math.abs(h - lastH) > 0.004 || ((h === 0 || h === 1) && h !== lastH)) { lastH = h; brew.style.setProperty('--h', h.toFixed(3)); }
  }
  function finishBrew(animated) {
    holdDone = true;
    holding = false;
    brew.classList.remove('holding');
    brew.classList.add('done');
    doneLine.textContent = DONE_TEXT;
    if (animated && motionOK) {
      M.animate(doneLine, { opacity: [0, 1], y: [12, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.6 });
      M.animate(cupEl, { scale: [1, 1.05, 1] }, { duration: 0.6, ease: 'easeOut' });
    }
  }
  function holdTick(now) {
    const dt = Math.min(100, now - (holdLast || now));
    holdLast = now;
    if (holding) h = Math.min(1, h + dt / 2600);
    if (h >= 1 && !holdDone) finishBrew(true);
    writeH();
    if (holding && !holdDone) holdRaf = requestAnimationFrame(holdTick);
    else { holdRaf = null; holdLast = 0; }
  }
  function press() {
    if (holdDone) return;
    holding = true;
    brew.classList.add('holding');
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdTick);
  }
  function release() { holding = false; brew.classList.remove('holding'); }
  holdBtn.addEventListener('pointerdown', e => { e.preventDefault(); holdBtn.setPointerCapture(e.pointerId); press(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => holdBtn.addEventListener(t, release));
  holdBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  holdBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(); });
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());

  /* reduced motion, live in both directions */
  let holdPinned = false;
  function pinToFinalStates() {
    document.body.classList.add('rm');
    document.querySelectorAll('.grain-line, .time').forEach(l => l.classList.add('drawn'));
    if (!holdDone) { holdPinned = true; finishBrew(false); }
    if (holdRaf !== null) { cancelAnimationFrame(holdRaf); holdRaf = null; }
    h = 1; writeH();
  }
  function unpinFinalStates() {
    document.body.classList.remove('rm');
    if (holdPinned) {
      holdPinned = false; holdDone = false; h = 0; writeH();
      brew.classList.remove('done');
      doneLine.textContent = '';
    }
  }
  RM.addEventListener('change', e => { if (e.matches) pinToFinalStates(); else applyHeroMode(); });
  if (RM.matches) pinToFinalStates();
  applyHeroMode();

  /* loyalty card: the stamps land one by one */
  if (motionOK) {
    let stamped = false;
    M.inView('.loyal', el => {
      if (stamped || document.body.classList.contains('rm')) return;
      stamped = true;
      M.animate(el.querySelectorAll('.stamps li.on'), { opacity: [0, 1], scale: [1.6, 1] }, { type: 'spring', bounce: 0.35, visualDuration: 0.35, delay: M.stagger(0.12, { startDelay: 0.4 }) });
    }, { amount: 0.5 });
  }

  /* the full menu: browse, order and follow it live (the same page a table QR code opens) */
  const modal = document.getElementById('menu-modal');
  const sheet = modal.querySelector('.mm-sheet');
  const mmBody = modal.querySelector('.mm-body');
  const mmTabsBar = modal.querySelector('.mm-tabs');
  const mmTabs = [...mmTabsBar.querySelectorAll('a')];
  const mmInk = modal.querySelector('.mm-ink');
  const mmTable = modal.querySelector('.mm-table');
  const mmOffline = modal.querySelector('.mm-offline');
  const cats = [...modal.querySelectorAll('.mm-cat')];
  const cartView = modal.querySelector('.cart-view');
  const cartLines = modal.querySelector('.cart-lines');
  const cartEmpty = modal.querySelector('.cart-empty');
  const cartForm = modal.querySelector('.cart-form');
  const cartSum = modal.querySelector('.cart-sum');
  const cartSend = modal.querySelector('.cart-send');
  const cartError = modal.querySelector('.cart-error');
  const trackView = modal.querySelector('.track-view');
  const trackMsg = trackView.querySelector('.track-msg');
  const barBtn = modal.querySelector('.mm-bar-btn');
  const canAnimate = () => motionOK && !RM.matches;
  let activeCat = null, lastFocus = null, closing = false;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
  };
  const money = c => 'R$ ' + (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100));
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  async function api(url, options = {}) {
    let res;
    try {
      res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch {
      throw new Error('Sem conexão com a cafeteria agora. Tente de novo ou peça no balcão.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não deu certo agora. Tente de novo em instantes.');
    return data;
  }

  function setActive(cat, instant) {
    if (cat === activeCat) return;
    activeCat = cat;
    const tab = mmTabs.find(t => t.dataset.cat === cat);
    mmTabs.forEach(t => t.classList.toggle('active', t === tab));
    if (!tab) return;
    const x = tab.offsetLeft, w = tab.offsetWidth;
    if (motionOK) M.animate(mmInk, { x, width: w }, instant || RM.matches ? { duration: 0 } : { type: 'spring', bounce: 0.2, visualDuration: 0.35 });
    else { mmInk.style.transform = 'translateX(' + x + 'px)'; mmInk.style.width = w + 'px'; }
    mmTabsBar.scrollTo({ left: Math.max(0, x - 40), behavior: instant || RM.matches ? 'auto' : 'smooth' });
  }
  function goTo(cat, smooth, instantInk) {
    const c = cats.find(s => s.dataset.cat === cat) || cats[0];
    mmBody.scrollTo({ top: c === cats[0] ? 0 : c.offsetTop - 8, behavior: smooth && !RM.matches ? 'smooth' : 'auto' });
    setActive(c.dataset.cat, instantInk);
  }
  let spyRaf = null;
  mmBody.addEventListener('scroll', () => {
    if (spyRaf) return;
    spyRaf = requestAnimationFrame(() => {
      spyRaf = null;
      const top = mmBody.scrollTop + 80;
      let cur = cats[0];
      for (const c of cats) if (c.offsetTop <= top) cur = c;
      if (mmBody.scrollTop + mmBody.clientHeight >= mmBody.scrollHeight - 4) cur = cats[cats.length - 1];
      setActive(cur.dataset.cat);
    });
  }, { passive: true });
  mmTabs.forEach(t => t.addEventListener('click', e => { e.preventDefault(); goTo(t.dataset.cat, true); }));

  function openMenu(cat) {
    if (modal.open) { goTo(cat || activeCat, true); return; }
    lastFocus = document.activeElement;
    document.documentElement.classList.add('modal-open');
    modal.showModal();
    activeCat = null;
    goTo(cat || 'paes', false, true);
    if (canAnimate()) M.animate(sheet, { opacity: [0, 1], y: [40, 0], scale: [0.98, 1] }, { type: 'spring', bounce: 0.15, visualDuration: 0.45 });
    loadMenu().then(resumeOrder);
  }
  async function closeMenu() {
    if (!modal.open || closing) return;
    closing = true;
    if (canAnimate()) await M.animate(sheet, { opacity: 0, y: 30 }, { duration: 0.2, ease: 'easeIn' });
    modal.close();
    if (motionOK) M.animate(sheet, { opacity: 1, y: 0, scale: 1 }, { duration: 0 });
    closing = false;
  }
  modal.addEventListener('cancel', e => { e.preventDefault(); closeMenu(); });
  modal.addEventListener('close', () => {
    document.documentElement.classList.remove('modal-open');
    if (location.hash === '#menu') history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });
  modal.addEventListener('click', e => { if (e.target === modal) closeMenu(); });
  modal.querySelector('.mm-close').addEventListener('click', closeMenu);
  modal.querySelector('[data-close-menu]').addEventListener('click', async e => {
    e.preventDefault();
    lastFocus = null;
    await closeMenu();
    document.getElementById('reservar').scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth' });
  });
  document.querySelectorAll('[data-open-menu]').forEach(b => b.addEventListener('click', () => openMenu(b.dataset.openMenu || null)));

  /* side drawer: every section, the hours and the order button */
  const side = document.getElementById('side');
  const sidePanel = side.querySelector('.side-panel');
  const burger = document.querySelector('.nav-burger');
  const sideLinks = [...side.querySelectorAll('.side-nav a')];
  let sideClosing = false;
  function openSide() {
    if (side.open) return;
    const mark = scrollY + innerHeight / 3;
    let cur = sideLinks[0];
    for (const a of sideLinks) {
      const t = document.querySelector(a.hash);
      if (t && t.getBoundingClientRect().top + scrollY <= mark) cur = a;
    }
    sideLinks.forEach(a => a === cur ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
    document.documentElement.classList.add('modal-open');
    side.showModal();
    burger.setAttribute('aria-expanded', 'true');
    if (canAnimate()) {
      M.animate(sidePanel, { x: ['-100%', '0%'] }, { type: 'spring', bounce: 0.12, visualDuration: 0.45 });
      M.animate(sideLinks, { opacity: [0, 1], x: [-24, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.5, delay: M.stagger(0.04, { startDelay: 0.1 }) });
    }
  }
  function sideClosed() {
    if (!modal.open) document.documentElement.classList.remove('modal-open');
    burger.setAttribute('aria-expanded', 'false');
  }
  async function closeSide() {
    if (!side.open || sideClosing) return;
    sideClosing = true;
    if (canAnimate()) await M.animate(sidePanel, { x: '-100%' }, { duration: 0.22, ease: 'easeIn' });
    side.close();
    sideClosed();
    if (motionOK) M.animate(sidePanel, { x: '0%' }, { duration: 0 });
    sideClosing = false;
  }
  burger.addEventListener('click', openSide);
  side.addEventListener('cancel', e => { e.preventDefault(); closeSide(); });
  side.addEventListener('close', sideClosed);
  side.addEventListener('click', e => { if (e.target === side) closeSide(); });
  side.querySelector('.side-close').addEventListener('click', closeSide);
  sideLinks.forEach(a => a.addEventListener('click', async e => {
    e.preventDefault();
    await closeSide();
    document.querySelector(a.hash).scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth' });
  }));
  side.querySelector('[data-side-order]').addEventListener('click', async () => { await closeSide(); openMenu(); });

  /* menu from the server: live prices and sold-out items */
  const menuById = new Map();
  const cart = new Map();
  for (const [id, qty] of Object.entries(store.get('freijo_cart') || {})) {
    if (Number.isInteger(Number(id)) && Number.isInteger(qty) && qty > 0 && qty <= 20) cart.set(Number(id), qty);
  }
  let menuState = 'idle';
  let tracking = null;

  function stepper(item) {
    const wrap = el('div', 'qty');
    wrap.dataset.id = item.id;
    const minus = el('button', 'minus', '−');
    minus.type = 'button';
    minus.dataset.act = 'dec';
    minus.setAttribute('aria-label', 'Tirar um: ' + item.name);
    const plus = el('button', 'plus', '+');
    plus.type = 'button';
    plus.dataset.act = 'inc';
    plus.setAttribute('aria-label', 'Adicionar: ' + item.name);
    wrap.append(minus, el('output'), plus);
    return wrap;
  }

  function renderMenu(categories) {
    menuById.clear();
    for (const c of categories) {
      const section = cats.find(s => s.dataset.cat === c.slug);
      if (!section) continue;
      const ul = section.querySelector('ul');
      ul.replaceChildren(...c.items.map(item => {
        menuById.set(item.id, item);
        const li = el('li', 'mi' + (item.available ? '' : ' off'));
        const info = el('div');
        info.append(el('b', null, item.name), el('p', null, item.description));
        li.append(info, el('span', 'price', money(item.priceCents)), item.available ? stepper(item) : el('span', 'sold', 'Esgotado'));
        return li;
      }));
    }
    const gone = [...cart.keys()].filter(id => !menuById.get(id)?.available);
    if (gone.length) {
      const names = gone.map(id => menuById.get(id)?.name).filter(Boolean);
      gone.forEach(id => cart.delete(id));
      saveCart();
      if (names.length) cartError.textContent = 'Acabou agora e saiu do seu pedido: ' + names.join(', ') + '.';
    }
  }

  async function loadMenu() {
    if (menuState === 'online' || menuState === 'loading') return;
    menuState = 'loading';
    try {
      const { categories } = await api('/api/menu');
      renderMenu(categories);
      menuState = 'online';
    } catch {
      menuState = 'offline';
    }
    sheet.classList.toggle('offline', menuState === 'offline');
    mmOffline.hidden = menuState !== 'offline';
    renderCart();
  }

  /* the cart */
  const saveCart = () => store.set('freijo_cart', Object.fromEntries(cart));
  const cartCount = () => [...cart.values()].reduce((s, q) => s + q, 0);
  const cartTotal = () => [...cart].reduce((s, [id, q]) => s + (menuById.get(id)?.priceCents || 0) * q, 0);

  function changeQty(id, delta) {
    const q = Math.min(20, Math.max(0, (cart.get(id) || 0) + delta));
    if (q) cart.set(id, q); else cart.delete(id);
    saveCart();
    cartError.textContent = '';
    renderCart();
    if (delta > 0 && canAnimate()) {
      M.animate(cartSum, { scale: [1.18, 1] }, { type: 'spring', bounce: 0.4, visualDuration: 0.3 });
      if (sheet.classList.contains('has-bar')) M.animate(barBtn, { scale: [1.04, 1] }, { type: 'spring', bounce: 0.4, visualDuration: 0.3 });
    }
  }
  modal.addEventListener('click', e => {
    const b = e.target.closest('.qty button');
    if (b) changeQty(Number(b.closest('.qty').dataset.id), b.dataset.act === 'inc' ? 1 : -1);
  });

  function syncSteppers() {
    modal.querySelectorAll('.qty').forEach(w => {
      const q = cart.get(Number(w.dataset.id)) || 0;
      w.querySelector('output').textContent = q;
      w.classList.toggle('zero', !q);
    });
  }

  function renderCart() {
    const lines = [...cart].filter(([id]) => menuById.has(id));
    cartLines.replaceChildren(...lines.map(([id, q]) => {
      const item = menuById.get(id);
      const li = el('li');
      li.append(el('span', 'nm', item.name), stepper(item), el('span', 'lt', money(item.priceCents * q)));
      return li;
    }));
    syncSteppers();
    const count = cartCount();
    const total = cartTotal();
    cartEmpty.hidden = lines.length > 0;
    cartSum.textContent = money(total);
    cartSend.disabled = !lines.length || menuState !== 'online';
    sheet.classList.toggle('has-bar', lines.length > 0 || !!tracking);
    barBtn.querySelector('.bar-label').textContent = tracking ? 'Acompanhar pedido nº ' + tracking.number : 'Ver meu pedido · ' + count + (count === 1 ? ' item' : ' itens');
    barBtn.querySelector('.bar-sum').textContent = tracking ? '' : money(total);
  }

  /* where the order goes: the table (QR code) or the counter */
  const tableFromQr = (() => {
    const v = new URLSearchParams(location.search).get('mesa');
    return v && /^\d{1,2}$/.test(v) && Number(v) >= 1 ? Number(v) : null;
  })();
  function setType(type) {
    cartForm.dataset.type = type;
    cartForm.elements.type.value = type;
  }
  cartForm.addEventListener('change', e => { if (e.target.name === 'type') setType(e.target.value); });
  if (tableFromQr) {
    mmTable.textContent = 'Mesa ' + tableFromQr;
    mmTable.hidden = false;
    setType('mesa');
    cartForm.classList.add('locked');
    cartForm.elements.table.value = tableFromQr;
    cartForm.elements.table.readOnly = true;
  } else setType('balcao');
  const savedName = store.get('freijo_name');
  if (typeof savedName === 'string') cartForm.elements.name.value = savedName;

  cartForm.addEventListener('submit', async e => {
    e.preventDefault();
    cartError.textContent = '';
    const f = cartForm.elements;
    const type = cartForm.dataset.type;
    const table = Number(f.table.value);
    const name = f.name.value.trim();
    if (type === 'mesa' && !(Number.isInteger(table) && table >= 1 && table <= 99)) { cartError.textContent = 'Diga o número da mesa. Ele está no QR code.'; f.table.focus(); return; }
    if (type === 'balcao' && name.length < 2) { cartError.textContent = 'Diga seu nome para a gente chamar no balcão.'; f.name.focus(); return; }
    cartSend.disabled = true;
    cartSend.textContent = 'Enviando...';
    try {
      const { order } = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ type, table: type === 'mesa' ? table : undefined, name, note: f.note.value, items: [...cart].map(([id, qty]) => ({ id, qty })) })
      });
      cart.clear();
      saveCart();
      f.note.value = '';
      if (name) store.set('freijo_name', name);
      store.set('freijo_order', { token: order.token });
      showTrack(order);
    } catch (err) {
      cartError.textContent = err.message;
      if (/acabou|não existe/i.test(err.message)) { menuState = 'idle'; loadMenu(); }
    } finally {
      cartSend.textContent = 'Enviar pedido';
      renderCart();
    }
  });

  /* following the order live */
  const STEPS = ['novo', 'preparando', 'pronto', 'entregue'];
  const FINAL = ['entregue', 'cancelado'];
  function statusMessage(o) {
    if (o.status === 'novo') return 'A equipe já recebeu seu pedido.';
    if (o.status === 'preparando') return 'Estamos preparando. Coado na hora leva uns minutinhos.';
    if (o.status === 'pronto') return o.type === 'mesa' ? 'Pronto! Já está indo para a sua mesa.' : 'Pronto! Pode buscar no balcão.';
    if (o.status === 'entregue') return 'Entregue. Bom proveito.';
    return 'Pedido cancelado. Fale com a gente no balcão.';
  }
  function renderTrack(o) {
    const prev = tracking && tracking.status;
    tracking = o;
    trackView.querySelector('.track-num b').textContent = o.number;
    trackView.querySelector('.track-where').textContent = o.type === 'mesa'
      ? 'Mesa ' + o.table + (o.name ? ', ' + o.name : '')
      : 'Retirada no balcão, em nome de ' + o.name;
    const idx = STEPS.indexOf(o.status);
    trackView.querySelectorAll('.track-steps li').forEach((li, i) => {
      li.classList.toggle('done', o.status === 'entregue' ? true : i < idx);
      li.classList.toggle('now', o.status !== 'entregue' && i === idx);
    });
    trackView.classList.toggle('cancel', o.status === 'cancelado');
    trackMsg.textContent = statusMessage(o);
    trackView.querySelector('.track-items').replaceChildren(...o.items.map(it => {
      const li = el('li');
      li.append(el('span', 'nm', it.qty + '× ' + it.name), el('span', 'lt', money(it.priceCents * it.qty)));
      return li;
    }));
    trackView.querySelector('.track-sum').textContent = money(o.totalCents);
    if (prev && prev !== o.status) {
      if (canAnimate()) {
        M.animate(trackMsg, { opacity: [0, 1], y: [10, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.5 });
        const now = trackView.querySelector('.track-steps li.now i');
        if (now) M.animate(now, { scaleY: [2.2, 1] }, { type: 'spring', bounce: 0.4, visualDuration: 0.4 });
      }
      if (o.status === 'pronto' && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([120, 60, 120]);
    }
    renderCart();
  }
  function stopTrackStream() {
    if (tracking && tracking.es) tracking.es.close();
  }
  function showTrack(o) {
    stopTrackStream();
    renderTrack(o);
    cartView.hidden = true;
    trackView.hidden = false;
    sheet.classList.add('show-cart');
    if (FINAL.includes(o.status) || !window.EventSource) return;
    const es = new EventSource('/api/orders/' + encodeURIComponent(o.token) + '/stream');
    es.addEventListener('order', ev => {
      const data = JSON.parse(ev.data);
      const keep = tracking.es;
      renderTrack(data);
      tracking.es = keep;
      if (FINAL.includes(data.status)) es.close();
    });
    tracking.es = es;
  }
  async function resumeOrder() {
    const saved = store.get('freijo_order');
    if (tracking || !saved || typeof saved.token !== 'string' || menuState !== 'online') return;
    try {
      const { order } = await api('/api/orders/' + encodeURIComponent(saved.token));
      const fresh = Date.now() - Date.parse(order.updatedAt) < 2 * 3600 * 1000;
      if (!FINAL.includes(order.status) || fresh) showTrack(order);
      else store.set('freijo_order', null);
    } catch {
      store.set('freijo_order', null);
    }
  }
  trackView.querySelector('.track-new').addEventListener('click', () => {
    stopTrackStream();
    tracking = null;
    store.set('freijo_order', null);
    trackView.hidden = true;
    cartView.hidden = false;
    sheet.classList.remove('show-cart');
    renderCart();
  });
  barBtn.addEventListener('click', () => {
    sheet.classList.add('show-cart');
    modal.querySelector('.mm-cart').scrollTop = 0;
  });
  modal.querySelector('.cart-back').addEventListener('click', () => sheet.classList.remove('show-cart'));

  if (location.hash === '#menu' || tableFromQr) openMenu();
  addEventListener('hashchange', () => { if (location.hash === '#menu') openMenu(); });

  /* environment motes and hidden-tab pause */
  const env = document.querySelector('.env');
  const mr = rng(42);
  for (let i = 0; i < 16; i++) {
    const m = document.createElement('span');
    m.className = 'mote';
    m.style.left = (mr() * 100).toFixed(2) + '%';
    m.style.animationDuration = (24 + mr() * 20).toFixed(1) + 's';
    m.style.animationDelay = (-mr() * 40).toFixed(1) + 's';
    const s = (1.5 + mr() * 2.5).toFixed(1) + 'px';
    m.style.width = m.style.height = s;
    env.appendChild(m);
  }
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  /* bread reservation: saved on the server, shown on the staff panel */
  const formWrap = document.querySelector('.book-form');
  const form = formWrap.querySelector('form');
  const success = formWrap.querySelector('.success');
  const formError = form.querySelector('.form-error');
  const formBtn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    formError.textContent = '';
    const bad = [...form.querySelectorAll('[required]')].find(i => !i.value.trim());
    if (bad) {
      bad.focus();
      bad.setAttribute('aria-invalid', 'true');
      formError.textContent = 'Preencha seu nome e o WhatsApp.';
      return;
    }
    const f = form.elements;
    formBtn.disabled = true;
    formBtn.textContent = 'Reservando...';
    try {
      const { reservation: r } = await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ name: f.nome.value, whatsapp: f.whatsapp.value, bread: f.pao.value, time: f.horario.value })
      });
      success.textContent = 'Reservado para ' + r.pickupLabel + ', às ' + r.pickupTime + '. Seu código é ' + r.code + '. É só dizer seu nome no balcão.';
      formWrap.classList.add('sent');
      if (motionOK && !RM.matches) M.animate(success, { opacity: [0, 1], y: [10, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.6 });
    } catch (err) {
      formError.textContent = err.message;
    } finally {
      formBtn.disabled = false;
      formBtn.textContent = 'Reservar meu pão';
    }
  });
  form.addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
})();
