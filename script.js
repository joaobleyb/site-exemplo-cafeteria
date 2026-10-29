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

  /* form: demo brand, honest JS-only success state */
  const formWrap = document.querySelector('.book-form');
  const form = formWrap.querySelector('form');
  const success = formWrap.querySelector('.success');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const bad = [...form.querySelectorAll('[required]')].find(i => !i.value.trim());
    if (bad) { bad.focus(); bad.setAttribute('aria-invalid', 'true'); return; }
    formWrap.classList.add('sent');
    if (motionOK && !RM.matches) M.animate(success, { opacity: [0, 1], y: [10, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.6 });
  });
  form.addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
})();
