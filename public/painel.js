(() => {
  const M = window.Motion;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const canAnimate = () => !!(M && M.animate) && !RM.matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const loginView = $('#login');
  const appView = $('#app');
  const loginForm = $('.login-card');
  const loginError = $('.login-error');
  const live = $('.live');
  const toastEl = $('.toast');

  const ACTIVE = ['novo', 'preparando', 'pronto'];
  const orders = new Map();
  let today = null;
  let es = null;
  let lostConnection = false;
  let resDate = null;
  let resToday = null;

  /* helpers */
  const money = c => 'R$ ' + (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100));
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const button = (label, cls, onClick) => {
    const b = el('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  function age(iso) {
    const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    return 'há ' + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
  }
  const clock = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
  }

  async function api(url, options = {}) {
    let res;
    try {
      res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch {
      throw new Error('Sem conexão com o servidor. Confira a internet.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.includes('/auth/login')) {
      showLogin(data.error);
      throw new Error(data.error || 'Sessão encerrada.');
    }
    if (!res.ok) throw new Error(data.error || 'Não deu certo. Tente de novo.');
    return data;
  }

  /* sound: a short two-note chime for new orders */
  let audioCtx = null;
  let soundOn = (() => { try { return localStorage.getItem('freijo_sound') !== 'off'; } catch { return true; } })();
  const soundBtn = $('.sound');
  function renderSound() {
    soundBtn.textContent = soundOn ? 'Som ligado' : 'Som desligado';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.classList.toggle('on', soundOn);
  }
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* no audio */ }
  }
  function chime() {
    if (!soundOn || !audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      [[880, 0], [1318.5, 0.16]].forEach(([freq, delay]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.28, t + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.55);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.6);
      });
    } catch { /* no audio */ }
  }
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('freijo_sound', soundOn ? 'on' : 'off'); } catch { /* storage blocked */ }
    renderSound();
    if (soundOn) { unlockAudio(); chime(); }
  });
  renderSound();

  /* login and logout */
  function showLogin(message) {
    if (es) { es.close(); es = null; }
    appView.hidden = true;
    loginView.hidden = false;
    loginError.textContent = message || '';
    document.title = 'Painel da equipe · Freijó';
    loginForm.elements.password.focus();
  }
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    unlockAudio();
    loginError.textContent = '';
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: loginForm.elements.password.value }) });
      loginForm.reset();
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('.logout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* already out */ }
    showLogin('Você saiu do painel.');
  });

  /* tabs */
  const tabs = $$('.tabs [role="tab"]');
  function selectTab(name) {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.tab').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'reservas') loadReservations(resDate);
    if (name === 'cardapio') loadMenu();
  }
  tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  /* orders board */
  const NEXT = {
    novo: [['Começar preparo', 'primary', 'preparando'], ['Cancelar', 'danger', 'cancelado']],
    preparando: [['Marcar como pronto', 'primary', 'pronto'], ['Voltar para novos', 'quiet', 'novo']],
    pronto: [[null, 'primary', 'entregue'], ['Voltar ao preparo', 'quiet', 'preparando']],
    entregue: [['Reabrir', 'quiet', 'pronto']],
    cancelado: [['Reabrir', 'quiet', 'novo']]
  };

  async function setOrderStatus(id, status, btn) {
    btn.disabled = true;
    try {
      const { order } = await api('/api/staff/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      upsertOrder(order, false);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  }

  function orderCard(o) {
    const card = el('article', 'card');
    card.dataset.id = o.id;
    const head = el('div', 'card-head');
    head.append(
      el('span', 'num', 'nº ' + o.number),
      el('span', 'where' + (o.type === 'mesa' ? ' mesa' : ''), o.type === 'mesa' ? 'Mesa ' + o.table + (o.name ? ' · ' + o.name : '') : 'Balcão · ' + o.name)
    );
    const ageEl = el('span', 'age');
    ageEl.dataset.created = o.createdAt;
    ageEl.title = 'Pedido às ' + clock(o.createdAt);
    head.append(ageEl);
    if (!ACTIVE.includes(o.status)) head.append(el('span', 'status-tag', o.status === 'entregue' ? 'Entregue' : 'Cancelado'));
    const ul = el('ul');
    for (const it of o.items) {
      const li = el('li');
      li.append(el('b', null, it.qty + '×'), el('span', null, it.name));
      ul.append(li);
    }
    card.append(head, ul);
    if (o.note) card.append(el('p', 'note', 'Obs.: ' + o.note));
    const foot = el('div', 'card-foot');
    foot.append(el('span', 'total', money(o.totalCents)));
    for (const [label, cls, status] of NEXT[o.status] || []) {
      const text = label || (o.type === 'mesa' ? 'Entregue na mesa' : 'Retirado no balcão');
      const b = button(text, cls, () => {
        if (status === 'cancelado' && !b.classList.contains('confirm')) {
          b.classList.add('confirm');
          b.textContent = 'Confirmar cancelamento';
          setTimeout(() => { b.classList.remove('confirm'); b.textContent = text; }, 3500);
          return;
        }
        setOrderStatus(o.id, status, b);
      });
      foot.append(b);
    }
    card.append(foot);
    updateAge(card);
    return card;
  }

  function updateAge(card) {
    const o = orders.get(Number(card.dataset.id));
    const a = card.querySelector('.age');
    if (!o || !a) return;
    a.textContent = age(o.createdAt);
    const waited = (Date.now() - Date.parse(o.createdAt)) / 60000;
    card.classList.toggle('late', (o.status === 'novo' && waited >= 5) || (o.status === 'preparando' && waited >= 15));
  }

  function renderBoard() {
    const list = [...orders.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const col of ['novo', 'preparando', 'pronto']) {
      const wrap = $(`.col[data-col="${col}"] .cards`);
      const items = list.filter(o => o.status === col);
      reconcile(wrap, items);
      $(`.col[data-col="${col}"] .count`).textContent = items.length;
    }
    const done = list.filter(o => !ACTIVE.includes(o.status) && o.serviceDate === today).reverse();
    reconcile($('.history .cards'), done);
    $('.history .count').textContent = done.length;

    const todays = list.filter(o => o.serviceDate === today && o.status !== 'cancelado');
    $('[data-stat="open"]').textContent = list.filter(o => ACTIVE.includes(o.status)).length;
    $('[data-stat="today"]').textContent = todays.length;
    $('[data-stat="revenue"]').textContent = money(todays.reduce((s, o) => s + o.totalCents, 0));

    const fresh = list.filter(o => o.status === 'novo').length;
    const badge = $('.tabs [data-tab="pedidos"] .badge');
    badge.hidden = !fresh;
    badge.textContent = fresh;
    document.title = (fresh ? '(' + fresh + ') ' : '') + 'Painel da equipe · Freijó';
  }

  const rendered = new Map();
  function reconcile(wrap, list) {
    const keep = new Set(list.map(o => o.id));
    for (const card of [...wrap.children]) if (!keep.has(Number(card.dataset.id))) card.remove();
    list.forEach((o, i) => {
      const key = o.id + ':' + o.updatedAt;
      let card = wrap.querySelector(`[data-id="${o.id}"]`);
      if (!card || rendered.get(o.id) !== key) {
        const next = orderCard(o);
        if (card) card.replaceWith(next); else if (wrap.children[i]) wrap.insertBefore(next, wrap.children[i]); else wrap.append(next);
        if (!card && canAnimate()) M.animate(next, { opacity: [0, 1], y: [14, 0] }, { type: 'spring', bounce: 0.2, visualDuration: 0.45 });
        card = next;
        rendered.set(o.id, key);
      } else if (wrap.children[i] !== card) {
        wrap.insertBefore(card, wrap.children[i] || null);
      }
    });
  }

  function upsertOrder(o, isNew) {
    orders.set(o.id, o);
    renderBoard();
    if (isNew) {
      const card = $(`.col[data-col="novo"] [data-id="${o.id}"]`);
      if (card) {
        card.classList.add('fresh');
        setTimeout(() => card.classList.remove('fresh'), 8000);
      }
      chime();
      toast('Novo pedido nº ' + o.number + ' · ' + (o.type === 'mesa' ? 'Mesa ' + o.table : 'Balcão, ' + o.name));
    }
  }

  async function loadOrders() {
    const data = await api('/api/staff/orders');
    today = data.today;
    orders.clear();
    rendered.clear();
    $$('.cards').forEach(c => c.replaceChildren());
    data.orders.forEach(o => orders.set(o.id, o));
    renderBoard();
  }
  setInterval(() => $$('.card').forEach(updateAge), 30000);

  /* reservations */
  const resList = $('.res-list');
  const dateInput = $('.date input');
  async function setResStatus(id, status, btn) {
    btn.disabled = true;
    try {
      await api('/api/staff/reservations/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadReservations(resDate);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  }
  const RES_ACTIONS = {
    reservado: [['Separar', 'primary', 'separado'], ['Cancelar', 'danger', 'cancelado']],
    separado: [['Retirado', 'primary', 'retirado'], ['Desfazer', 'quiet', 'reservado']],
    retirado: [['Desfazer', 'quiet', 'separado']],
    cancelado: [['Reabrir', 'quiet', 'reservado']]
  };
  const RES_LABEL = { reservado: 'Reservado', separado: 'Separado', retirado: 'Retirado', cancelado: 'Cancelado' };

  function resRow(r) {
    const row = el('div', 'res');
    row.dataset.status = r.status;
    const who = el('div', 'who');
    const wa = el('a', null, r.whatsapp.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'));
    wa.href = 'https://wa.me/55' + r.whatsapp;
    wa.target = '_blank';
    wa.rel = 'noopener';
    who.append(el('b', null, r.name), wa);
    const mid = el('div');
    mid.append(el('div', 'bread', r.bread), el('span', 'code', r.code));
    const acts = el('div', 'acts');
    for (const [label, cls, status] of RES_ACTIONS[r.status] || []) {
      const b = button(label, cls, () => {
        if (status === 'cancelado' && !b.classList.contains('confirm')) {
          b.classList.add('confirm');
          b.textContent = 'Confirmar';
          setTimeout(() => { b.classList.remove('confirm'); b.textContent = label; }, 3500);
          return;
        }
        setResStatus(r.id, status, b);
      });
      acts.append(b);
    }
    row.append(who, mid, el('span', 'pill', RES_LABEL[r.status]), acts);
    return row;
  }

  async function loadReservations(date) {
    try {
      const data = await api('/api/staff/reservations' + (date ? '?date=' + encodeURIComponent(date) : ''));
      resDate = data.date;
      resToday = data.today;
      dateInput.value = data.date;
      $('.res-label').textContent = data.label;
      $$('.day-pick [data-day]').forEach(b => b.classList.toggle('on', (b.dataset.day === 'today' ? resToday : addDays(resToday, 1)) === resDate));
      const bake = $('.bake-list');
      bake.replaceChildren(...(data.totals.length ? data.totals.map(t => {
        const li = el('li');
        li.append(el('b', null, t.count + '×'), document.createTextNode(t.bread));
        return li;
      }) : [el('li', null, 'Nada reservado para este dia.')]));
      resList.replaceChildren();
      if (!data.reservations.length) { resList.append(el('p', 'res-empty', 'Nenhuma reserva para este dia ainda.')); return; }
      const slots = new Map();
      for (const r of data.reservations) {
        if (!slots.has(r.pickupTime)) slots.set(r.pickupTime, []);
        slots.get(r.pickupTime).push(r);
      }
      for (const [time, list] of slots) {
        const slot = el('section', 'slot');
        slot.append(el('h3', null, time + ' · ' + list.filter(r => r.status !== 'cancelado').length + (list.length === 1 ? ' reserva' : ' reservas')));
        list.forEach(r => slot.append(resRow(r)));
        resList.append(slot);
      }
    } catch (err) {
      toast(err.message, true);
    }
  }
  $$('.day-pick [data-day]').forEach(b => b.addEventListener('click', () => {
    if (!resToday) return loadReservations();
    loadReservations(b.dataset.day === 'today' ? resToday : addDays(resToday, 1));
  }));
  dateInput.addEventListener('change', () => { if (dateInput.value) loadReservations(dateInput.value); });

  /* menu availability */
  const menuAdmin = $('.menu-admin');
  function menuRow(item) {
    const row = el('div', 'mrow' + (item.available ? '' : ' off'));
    row.dataset.id = item.id;
    const sw = el('button', 'switch', item.available ? 'Disponível' : 'Esgotado');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(item.available));
    sw.setAttribute('aria-label', item.name + ': ' + (item.available ? 'disponível' : 'esgotado'));
    sw.addEventListener('click', async () => {
      sw.disabled = true;
      try {
        const { item: updated } = await api('/api/staff/menu/' + item.id, { method: 'PATCH', body: JSON.stringify({ available: !item.available }) });
        row.replaceWith(menuRow(updated));
        toast(updated.name + (updated.available ? ' voltou ao cardápio.' : ' marcado como esgotado.'));
      } catch (err) {
        toast(err.message, true);
        sw.disabled = false;
      }
    });
    row.append(el('span', 'nm', item.name), el('span', 'pr', money(item.priceCents)), sw);
    return row;
  }
  async function loadMenu() {
    try {
      const { categories } = await api('/api/staff/menu');
      menuAdmin.replaceChildren(...categories.map(c => {
        const box = el('section', 'mcat');
        box.append(el('h3', null, c.name), ...c.items.map(menuRow));
        return box;
      }));
    } catch (err) {
      toast(err.message, true);
    }
  }

  /* live updates from the server */
  function setLive(on, text) {
    live.dataset.state = on ? 'on' : 'off';
    $('.live-text').textContent = text;
  }
  function connect() {
    if (es) es.close();
    setLive(false, 'Conectando');
    es = new EventSource('/api/staff/stream');
    es.addEventListener('ready', async () => {
      setLive(true, 'Ao vivo');
      if (lostConnection) {
        lostConnection = false;
        try {
          await loadOrders();
          if (!$('#tab-reservas').hidden) loadReservations(resDate);
        } catch { /* handled by api() */ }
      }
    });
    es.addEventListener('order.created', ev => upsertOrder(JSON.parse(ev.data), true));
    es.addEventListener('order.updated', ev => upsertOrder(JSON.parse(ev.data), false));
    es.addEventListener('reservation.created', ev => {
      const r = JSON.parse(ev.data);
      toast('Nova reserva: ' + r.name + ', ' + r.bread + ', ' + r.pickupTime);
      if (!$('#tab-reservas').hidden && r.pickupDate === resDate) loadReservations(resDate);
    });
    es.addEventListener('reservation.updated', ev => {
      const r = JSON.parse(ev.data);
      if (!$('#tab-reservas').hidden && r.pickupDate === resDate) loadReservations(resDate);
    });
    es.addEventListener('menu.updated', ev => {
      const item = JSON.parse(ev.data);
      const row = menuAdmin.querySelector(`[data-id="${item.id}"]`);
      if (row) row.replaceWith(menuRow(item));
    });
    es.onerror = async () => {
      lostConnection = true;
      setLive(false, 'Reconectando');
      try {
        const { staff } = await api('/api/auth/me');
        if (!staff) showLogin('Sua sessão acabou. Entre de novo com a senha da equipe.');
      } catch { /* offline: EventSource keeps retrying */ }
    };
  }

  async function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    try {
      await loadOrders();
      connect();
      selectTab('pedidos');
    } catch (err) {
      if (!appView.hidden) toast(err.message, true);
    }
  }

  (async () => {
    try {
      const { staff } = await api('/api/auth/me');
      if (staff) showApp(); else showLogin();
    } catch (err) {
      showLogin(err.message);
    }
  })();
})();
