(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = root.classList.contains('reduced');
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ramp = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- Nav ---------- */
  const nav = $('#nav'), toggle = $('#navToggle'), sheet = $('#navSheet');
  function setSheet(open) {
    toggle.setAttribute('aria-expanded', open);
    sheet.hidden = !open;
    if (open) nav.classList.add('solid');
  }
  toggle.addEventListener('click', () => setSheet(sheet.hidden));
  $$('a', sheet).forEach(a => a.addEventListener('click', () => setSheet(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { setSheet(false); toggle.focus(); } });

  const navLinks = $$('.nav-links a');
  const navTargets = navLinks.map(a => $(a.getAttribute('href')));
  let lastY = scrollY;
  function updateNav() {
    const y = scrollY;
    nav.classList.toggle('solid', y > 24 || !sheet.hidden);
    nav.classList.toggle('away', y > lastY + 2 && y > 900 && sheet.hidden);
    if (y < lastY - 2) nav.classList.remove('away');
    lastY = y;
    const mid = innerHeight * .4;
    let cur = -1;
    navTargets.forEach((s, i) => { if (!s) return; const r = s.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) cur = i; });
    navLinks.forEach((a, i) => a.classList.toggle('on', i === cur));
  }

  /* ---------- Reveal ---------- */
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    $$('[data-reveal]').forEach(el => io.observe(el));
  } else {
    $$('[data-reveal]').forEach(el => el.classList.add('in'));
  }

  /* ---------- Hero: terrain → flood → simulated depth ---------- */
  const hero = $('#top'), media = $('#heroMedia'), copy = $('#heroCopy');
  const lFlood = $('.hl-flood'), lDepth = $('.hl-depth'), scan = $('.hero-scan');
  const stages = $$('#heroStages li'), legend = $('#heroLegend');
  let heroStage = -1;
  function updateHero() {
    const r = hero.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    if (r.bottom < 0) return;
    const flood = ramp(p, .16, .42);
    const wipe = ease(ramp(p, .5, .82));
    lFlood.style.opacity = flood.toFixed(3);
    lDepth.style.clipPath = `inset(0 ${(100 - wipe * 100).toFixed(2)}% 0 0)`;
    scan.style.left = (wipe * 100).toFixed(2) + '%';
    scan.style.opacity = wipe > 0 && wipe < 1 ? 1 : 0;
    media.style.transform = `scale(${(1.0 + p * .09).toFixed(4)})`;
    const out = ramp(p, .04, .2);
    copy.style.opacity = (1 - out).toFixed(3);
    copy.style.transform = `translateY(${(-out * 48).toFixed(1)}px)`;
    copy.style.visibility = out >= 1 ? 'hidden' : 'visible';
    hero.style.setProperty('--copy', (1 - out * .85).toFixed(3));
    // each stage line tracks its own picture: full only once that picture is fully shown
    [1, flood, wipe].forEach((f, i) => {
      stages[i].style.setProperty('--fill', f.toFixed(4));
      stages[i].classList.toggle('on', f >= .995);
    });
    const s = wipe >= .995 ? 2 : 0;
    if (s !== heroStage) { heroStage = s; legend.classList.toggle('on', s === 2); }
  }
  if (reduced) {
    // No scroll-linked choreography: show the simulated-depth frame as a calm still.
    hero.style.height = 'auto';
    lDepth.style.clipPath = 'none';
    stages.forEach(li => { li.classList.add('on'); li.style.setProperty('--fill', 1); });
    legend.classList.add('on');
    lDepth.style.opacity = 0; // keep terrain behind headline for legibility
  }

  /* ---------- Canvases (illustrative model) ---------- */
  const views = [];
  function onScreen(el, cb) {
    const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { rootMargin: '120px' });
    io.observe(el);
  }

  // Breakthrough comparison
  const cSolver = $('#cmpSolver'), cDeep = $('#cmpDeep');
  const sSolver = $('#cmpSolverStatus'), sDeep = $('#cmpDeepStatus');
  let cmpOn = false;
  if (window.FloodView && cSolver) {
    const vS = new FloodView(cSolver, { simW: 200, simH: 125, seed: 11, rise: .16 });
    const vD = new FloodView(cDeep, { simW: 200, simH: 125, seed: 11, rise: .16 });
    views.push(vS, vD);
    const LOOP = 10;            // seconds per cycle
    const SOLVER_REACH = .28;   // the solver is still working when the cycle restarts (illustrative)
    const steps = 2880;
    function drawCmp(time) {
      const c = reduced ? LOOP * .8 : time % LOOP;
      const sp = clamp(c / (LOOP * .92), 0, 1);
      const ts = reduced ? .25 : sp * SOLVER_REACH;
      vS.draw({ t: ts, cmap: 1, contours: .4, mesh: 1, scan: reduced ? null : (c * 3.1) % 1, time });
      const n = Math.floor(ts * steps);
      sSolver.textContent = 'Timestep ' + String(n).padStart(4, '0') + ' / ' + steps;
      const inf = clamp((c - .6) / 1.0, 0, 1);
      const td = reduced ? 1 : ease(inf);
      vD.draw({ t: td, cmap: 1, contours: .4, arrows: td >= 1 ? .8 : 0, time });
      sDeep.textContent = c < .6 ? 'Ready' : inf < 1 ? 'Inferring…' : 'Full evolution · complete';
    }
    drawCmp(0);
    onScreen($('.compare'), v => { cmpOn = v; });
    views.cmp = drawCmp;
  }

  // In-action sticky sequence
  const actCanvas = $('#actCanvas'), stepsEls = $$('#actSteps .act-step');
  const hudStep = $('#actHudStep'), hudT = $('#actHudT'), actLegend = $('#actLegend');
  const stepNames = ['Rainfall input', 'Terrain analysis', 'Water propagation', 'Depth and velocity', 'Actionable intelligence'];
  let actOn = false, actS = 0, actShown = 0, actIdx = -1;
  let vA = null;
  if (window.FloodView && actCanvas) {
    vA = new FloodView(actCanvas, { simW: 300, simH: 200, seed: 7, rise: .15 });
    views.push(vA);
    onScreen(actCanvas, v => { actOn = v; });
  }
  function measureSteps() {
    // continuous progress through the five steps, measured at 55% of the viewport
    const line = innerHeight * .55;
    let s = 0;
    stepsEls.forEach(el => { const r = el.getBoundingClientRect(); s += clamp((line - r.top) / r.height, 0, 1); });
    actS = reduced ? 4.6 : s;
    const idx = clamp(Math.floor(actS), 0, 4);
    if (idx !== actIdx) {
      actIdx = idx;
      stepsEls.forEach((el, i) => el.classList.toggle('on', i === idx));
      hudStep.textContent = '0' + (idx + 1) + ' / ' + stepNames[idx];
    }
  }
  let actLast = 0;
  function drawAct(time) {
    if (!vA) return;
    // frame-rate independent easing toward the scroll position
    const dt = clamp(time - actLast, 0, 1); actLast = time;
    actShown += (actS - actShown) * (reduced || !dt ? 1 : 1 - Math.exp(-dt * 7));
    const s = actShown;
    const t = ease(ramp(s, 1.7, 3.3));
    const st = {
      time,
      rain: 1 - ramp(s, 1.0, 1.9),
      contours: ramp(s, .9, 1.5) * (1 - ramp(s, 2.4, 3.2) * .7),
      t,
      water: ramp(s, 1.55, 1.8),
      cmap: ramp(s, 2.9, 3.4),
      arrows: ramp(s, 3.1, 3.6) * (1 - ramp(s, 4.3, 4.8) * .55),
      assets: ramp(s, 3.95, 4.5)
    };
    vA.draw(st);
    const mins = Math.round(t * 480);
    hudT.textContent = 'T+' + String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    actLegend.classList.toggle('on', st.cmap > .5);
  }

  /* ---------- Forecast: from → to ---------- */
  const trItems = $$('#trTo li');
  let trI = 0, trOn = false;
  if (trItems.length) {
    onScreen($('#trTo'), v => { trOn = v; });
    if (!reduced) setInterval(() => {
      if (!trOn || document.hidden) return;
      trItems[trI].classList.remove('on');
      trI = (trI + 1) % trItems.length;
      trItems[trI].classList.add('on');
    }, 3200);
  }

  /* ---------- Risk: compare slider ---------- */
  const cmp = $('#riskCmp'), range = $('#riskRange');
  function setPos(v) { cmp.style.setProperty('--pos', v + '%'); range.value = v; }
  if (cmp) {
    range.addEventListener('input', () => setPos(+range.value));
    let intro = false;
    if (!reduced) onScreen(cmp, v => {
      if (!v || intro) return;
      intro = true;
      const t0 = performance.now(), from = 92, to = 50;
      (function step(now) {
        const k = clamp((now - t0) / 1600, 0, 1);
        setPos(Math.round(from + (to - from) * ease(k)));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* ---------- Post-event: draw the reconstructed extent ---------- */
  const pe = $('#peMedia'), peExtent = $('.pe-extent');
  // anchor each label to its pin's rendered position (the SVG crops like the photo)
  function placeNotes() {
    if (!pe) return;
    const box = pe.getBoundingClientRect(), pins = $$('.pe-pin', pe), notes = $$('.pe-notes li', pe);
    pins.forEach((g, i) => {
      const r = g.getBoundingClientRect(), n = notes[i];
      if (!n) return;
      n.style.left = (r.left + r.width / 2 - box.left) + 'px';
      n.style.top = (r.top + r.height / 2 - box.top) + 'px';
    });
  }
  placeNotes();
  addEventListener('load', placeNotes);
  function updatePE() {
    if (!pe) return;
    const r = pe.getBoundingClientRect();
    const p = reduced ? 1 : ramp(innerHeight - r.top, innerHeight * .2, innerHeight * .9);
    peExtent.style.setProperty('--draw', (1 - p).toFixed(3));
    pe.classList.toggle('drawn', p >= .98);
  }

  /* ---------- Film + chapters ---------- */
  const film = $('#filmVideo'), play = $('#filmPlay'), frame = $('.film-frame'), chBtns = $$('#chapters button');
  function startFilm(t) {
    frame.classList.add('playing');
    film.controls = true;
    const go = () => { if (t != null) { try { film.currentTime = t; } catch (e) {} } film.play().catch(() => {}); };
    if (film.readyState >= 1) go(); else { film.preload = 'auto'; film.addEventListener('loadedmetadata', go, { once: true }); film.load(); }
    if (window.plausible) plausible('Demo video play', { props: { from: t == null ? 'start' : String(t) } });
  }
  play.addEventListener('click', () => startFilm(null));
  chBtns.forEach(b => b.addEventListener('click', () => {
    startFilm(+b.dataset.t);
    frame.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }));
  film.addEventListener('timeupdate', () => {
    const t = film.currentTime;
    let cur = -1;
    chBtns.forEach((b, i) => { if (t >= +b.dataset.t - .5) cur = i; });
    chBtns.forEach((b, i) => b.classList.toggle('on', i === cur));
  });

  /* ---------- Loop ---------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateNav();
      if (!reduced) updateHero();
      measureSteps();
      updatePE();
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { views.forEach(v => v.resize()); placeNotes(); onScroll(); if (views.cmp) views.cmp(0); drawAct(0); });

  updateNav(); if (!reduced) updateHero(); measureSteps(); updatePE();
  drawAct(0);

  if (!reduced) {
    (function frameLoop(now) {
      const time = now / 1000;
      if (cmpOn && views.cmp) views.cmp(time);
      if (actOn) drawAct(time);
      requestAnimationFrame(frameLoop);
    })(performance.now());
  }
  // fonts can change canvas label metrics; redraw once ready
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (views.cmp) views.cmp(0); drawAct(0); });

  /* ---------- ?tune: live controls for the secondary (glass) buttons ---------- */
  if (new URLSearchParams(location.search).has('tune')) {
    const controls = [
      { v: '--ghost-blur', label: 'Blur', min: 0, max: 40, step: 1, unit: 'px' },
      { v: '--ghost-sat', label: 'Saturation', min: 1, max: 2, step: .05, unit: '' },
      { v: '--ghost-fill', label: 'Fill opacity', min: 0, max: .4, step: .01, unit: '' },
      { v: '--ghost-border', label: 'Border opacity', min: 0, max: .6, step: .01, unit: '' }
    ];
    const css = getComputedStyle(root);
    const initial = Object.fromEntries(controls.map(c => [c.v, parseFloat(css.getPropertyValue(c.v))]));
    const panel = document.createElement('aside');
    panel.className = 'tune';
    panel.setAttribute('aria-label', 'Secondary button controls');
    panel.innerHTML = '<div class="tune-head"><b>Secondary buttons</b><button type="button" aria-label="Close controls">×</button></div>' +
      controls.map((c, i) => `<label for="tune${i}"><span>${c.label}</span><output id="tuneOut${i}"></output><input id="tune${i}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${initial[c.v]}"></label>`).join('') +
      '<div class="tune-foot"><button type="button" data-act="reset">Reset</button><button type="button" data-act="copy">Copy CSS</button></div><pre id="tuneCss"></pre>';
    document.body.appendChild(panel);
    const fmt = (c, n) => c.unit ? n + c.unit : String(+n.toFixed(2));
    function apply() {
      const lines = controls.map((c, i) => {
        const n = +$('#tune' + i).value;
        root.style.setProperty(c.v, fmt(c, n));
        $('#tuneOut' + i).textContent = fmt(c, n);
        return `${c.v}:${fmt(c, n)};`;
      });
      $('#tuneCss').textContent = ':root{' + lines.join('') + '}';
    }
    $$('input', panel).forEach(r => r.addEventListener('input', apply));
    $('[data-act=reset]', panel).addEventListener('click', () => { controls.forEach((c, i) => { $('#tune' + i).value = initial[c.v]; }); apply(); });
    $('[data-act=copy]', panel).addEventListener('click', e => {
      const b = e.currentTarget, t = $('#tuneCss').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy CSS'; }, 1400); }, () => { getSelection().selectAllChildren($('#tuneCss')); });
    });
    $('.tune-head button', panel).addEventListener('click', () => panel.remove());
    apply();
  }
})();
