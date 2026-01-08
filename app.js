// Simple web Aim Trainer (vanilla JS)
// Modes: warmup, timeattack, reaction, tracking
(() => {
  // DOM
  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d', { alpha: false });
  const modesEl = document.getElementById('modes');
  const modeBtns = Array.from(document.querySelectorAll('.mode-btn'));
  const targetSizeEl = document.getElementById('targetSize');
  const labelTargetSize = document.getElementById('labelTargetSize');
  const spawnIntervalEl = document.getElementById('spawnInterval');
  const labelSpawn = document.getElementById('labelSpawn');
  const spawnSetting = document.getElementById('spawnSetting');
  const timeAttackEl = document.getElementById('timeAttack');
  const labelTime = document.getElementById('labelTime');
  const timeAttackSetting = document.getElementById('timeAttackSetting');
  const trackingSpeedEl = document.getElementById('trackingSpeed');
  const labelSpeed = document.getElementById('labelSpeed');
  const trackingSetting = document.getElementById('trackingSetting');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const endBtn = document.getElementById('endBtn');

  const hitsEl = document.getElementById('hits');
  const missesEl = document.getElementById('misses');
  const accEl = document.getElementById('acc');
  const elapsedEl = document.getElementById('elapsed');
  const reactionStats = document.getElementById('reactionStats');
  const avgReactionEl = document.getElementById('avgReaction');
  const bestReactionEl = document.getElementById('bestReaction');
  const lastSessionEl = document.getElementById('lastSession');

  // State
  const Mode = { WARMUP: 'warmup', TIME: 'timeattack', REACTION: 'reaction', TRACK: 'tracking' };
  let mode = Mode.TIME;
  let targetSize = Number(targetSizeEl.value);
  let spawnInterval = Number(spawnIntervalEl.value);
  let timeAttack = Number(timeAttackEl.value);
  let trackingSpeed = Number(trackingSpeedEl.value);

  let target = null; // {x,y,size,vx,vy,spawnedAt}
  let hits = 0;
  let misses = 0;
  let reactionTimes = [];
  let running = false;
  let lastTime = 0;
  let elapsed = 0;
  let spawnTimer = null;
  let sessionTimer = null;
  let raf = null;

  // Setup canvas sizing
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    canvas.height = Math.max(200, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    // reset target safe
    target = null;
  }
  window.addEventListener('resize', resize);
  resize();

  // UI bindings
  function setActiveMode(newMode) {
    mode = newMode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === newMode));
    spawnSetting.style.display = (newMode === Mode.REACTION) ? 'none' : '';
    timeAttackSetting.style.display = (newMode === Mode.TIME) ? '' : 'none';
    trackingSetting.style.display = (newMode === Mode.TRACK) ? '' : 'none';
    reactionStats.style.display = (newMode === Mode.REACTION ? '' : 'none');
    // reset target on mode change
    target = null;
    draw();
  }

  modeBtns.forEach(b => {
    b.addEventListener('click', () => setActiveMode(b.dataset.mode));
  });

  targetSizeEl.addEventListener('input', () => {
    targetSize = Number(targetSizeEl.value);
    labelTargetSize.textContent = targetSize;
  });
  spawnIntervalEl.addEventListener('input', () => {
    spawnInterval = Number(spawnIntervalEl.value);
    labelSpawn.textContent = spawnInterval;
  });
  timeAttackEl.addEventListener('input', () => {
    timeAttack = Number(timeAttackEl.value);
    labelTime.textContent = timeAttack;
  });
  trackingSpeedEl.addEventListener('input', () => {
    trackingSpeed = Number(trackingSpeedEl.value);
    labelSpeed.textContent = trackingSpeed;
  });

  startBtn.addEventListener('click', startSession);
  pauseBtn.addEventListener('click', pauseSession);
  resetBtn.addEventListener('click', resetSession);
  endBtn.addEventListener('click', endSession);

  // Input handling (mouse & touch)
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    } else {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('touchstart', onPointerDown, { passive: true });

  function onPointerDown(e) {
    if (!running) return;
    const p = getPointerPos(e);
    if (!target) {
      misses++;
      updateHUD();
      return;
    }
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = target.size / 2;
    if (dist <= r) {
      // Hit
      hits++;
      if (mode === Mode.REACTION && target.spawnedAt) {
        const rt = Date.now() - target.spawnedAt;
        reactionTimes.push(rt);
      }
      // handle behavior per mode
      if (mode === Mode.REACTION) {
        // remove target and respawn after short delay
        target = null;
        updateHUD();
        setTimeout(spawnReactionTarget, 240);
      } else if (mode === Mode.TRACK) {
        // respawn tracking
        spawnTrackingTarget();
      } else {
        // spawn immediate new one
        spawnRandomTarget();
      }
    } else {
      misses++;
    }
    updateHUD();
  }

  // Spawning
  function rand(min, max) { return min + Math.random() * (max - min); }
  function spawnRandomTarget() {
    const padding = targetSize / 2 + 8;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const x = rand(padding, w - padding);
    const y = rand(padding, h - padding - 6);
    target = { x, y, size: targetSize, spawnedAt: Date.now() };
    draw();
  }
  function spawnReactionTarget() {
    const padding = targetSize / 2 + 8;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const x = rand(padding, w - padding);
    const y = rand(padding, h - padding - 6);
    target = { x, y, size: targetSize, spawnedAt: Date.now() };
    draw();
  }
  function spawnTrackingTarget() {
    const padding = targetSize / 2 + 8;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const x = rand(padding, w - padding);
    const y = rand(padding, h - padding - 6);
    const angle = rand(0, Math.PI * 2);
    const vx = Math.cos(angle) * trackingSpeed;
    const vy = Math.sin(angle) * trackingSpeed;
    target = { x, y, size: targetSize, vx, vy, spawnedAt: Date.now() };
    draw();
  }

  // Session controls
  function resetSession() {
    stopTimers();
    target = null;
    hits = 0;
    misses = 0;
    reactionTimes = [];
    elapsed = 0;
    running = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    updateHUD();
    draw();
  }

  function startSession() {
    // initialize
    hits = 0; misses = 0; reactionTimes = []; elapsed = 0;
    running = true;
    lastTime = performance.now();
    startBtn.disabled = true;
    pauseBtn.disabled = false;

    if (mode === Mode.REACTION) {
      spawnReactionTarget();
    } else if (mode === Mode.TRACK) {
      spawnTrackingTarget();
      // no spawn timer for tracking; movement handled in raf
    } else {
      spawnRandomTarget();
      spawnTimer = setInterval(() => {
        if (!running) return;
        spawnRandomTarget();
      }, spawnInterval);
    }

    sessionTimer = setInterval(() => {
      if (!running) return;
      elapsed += 0.1;
      elapsedEl.textContent = Math.floor(elapsed);
      if (mode === Mode.TIME && elapsed >= timeAttack) {
        endSession();
      }
    }, 100);

    raf = requestAnimationFrame(loop);
    updateHUD();
  }

  function pauseSession() {
    running = !running;
    pauseBtn.textContent = running ? 'Pause' : 'Resume';
    if (running) {
      lastTime = performance.now();
      raf = requestAnimationFrame(loop);
    } else {
      if (raf) cancelAnimationFrame(raf);
    }
  }

  function endSession() {
    stopTimers();
    running = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    saveStats();
    showSummary();
  }

  function stopTimers() {
    if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // Rendering & loop
  function loop(ts) {
    if (!running) return;
    const dt = Math.max(0, (ts - lastTime) / 1000);
    lastTime = ts;

    // move tracking target
    if (mode === Mode.TRACK && target && (target.vx || target.vy)) {
      target.x += target.vx * dt;
      target.y += target.vy * dt;
      // bounce
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const r = target.size / 2 + 6;
      if (target.x < r) { target.x = r; target.vx *= -1; }
      if (target.x > w - r) { target.x = w - r; target.vx *= -1; }
      if (target.y < r) { target.y = r; target.vy *= -1; }
      if (target.y > h - r - 6) { target.y = h - r - 6; target.vy *= -1; }
    }

    draw();
    raf = requestAnimationFrame(loop);
  }

  // Drawing
  function drawBackground() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = '#081116';
    ctx.fillRect(0, 0, w, h);
    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function drawTarget(t) {
    if (!t) return;
    const c = ctx;
    const x = t.x, y = t.y, s = t.size;
    const r = s / 2;
    // outer
    c.beginPath();
    c.fillStyle = '#ff5c6a';
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    // middle
    c.beginPath();
    c.fillStyle = '#ffffff';
    c.arc(x, y, r * 0.62, 0, Math.PI * 2);
    c.fill();
    // inner
    c.beginPath();
    c.fillStyle = '#ff5c6a';
    c.arc(x, y, r * 0.32, 0, Math.PI * 2);
    c.fill();
    // crosshair
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - r * 0.18, y); c.lineTo(x + r * 0.18, y);
    c.moveTo(x, y - r * 0.18); c.lineTo(x, y + r * 0.18);
    c.stroke();
  }

  function draw() {
    drawBackground();
    if (target) drawTarget(target);
  }

  // HUD
  function updateHUD() {
    hitsEl.textContent = String(hits);
    missesEl.textContent = String(misses);
    const total = hits + misses;
    const acc = total === 0 ? 0 : (hits / total * 100);
    accEl.textContent = acc.toFixed(1);
    elapsedEl.textContent = Math.floor(elapsed);
    if (reactionTimes.length > 0) {
      const sum = reactionTimes.reduce((a, b) => a + b, 0);
      avgReactionEl.textContent = Math.round(sum / reactionTimes.length);
      bestReactionEl.textContent = Math.min(...reactionTimes);
    } else {
      avgReactionEl.textContent = '—';
      bestReactionEl.textContent = '—';
    }
  }

  // Stats persistence & summary
  function saveStats() {
    const stats = {
      mode,
      hits, misses,
      accuracy: Number(((hits / Math.max(1, hits + misses)) * 100).toFixed(2)),
      timestamp: new Date().toISOString(),
      avgReaction: reactionTimes.length ? Math.round(reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length) : null,
      bestReaction: reactionTimes.length ? Math.min(...reactionTimes) : null
    };
    try {
      localStorage.setItem('aim_last_stats', JSON.stringify(stats));
      showLastSessionPreview();
    } catch (e) {
      console.warn('Could not save stats', e);
    }
  }

  function showLastSessionPreview() {
    try {
      const raw = localStorage.getItem('aim_last_stats');
      if (!raw) { lastSessionEl.textContent = ''; return; }
      const s = JSON.parse(raw);
      lastSessionEl.textContent = `Last: ${s.mode} • ${s.hits} hits • ${s.misses} misses • ${s.accuracy}%`;
    } catch(e) { /* ignore */ }
  }

  function showSummary() {
    const acc = ((hits / Math.max(1, hits + misses)) * 100).toFixed(1);
    let html = `Mode: ${mode}\nHits: ${hits}\nMisses: ${misses}\nAccuracy: ${acc}%`;
    if (reactionTimes.length) {
      const avg = Math.round(reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length);
      const best = Math.min(...reactionTimes);
      html += `\nAvg reaction: ${avg} ms\nBest reaction: ${best} ms`;
    }
    alert(html);
  }

  // Initialization: wire initial UI state & restore last session
  labelTargetSize.textContent = targetSize;
  labelSpawn.textContent = spawnInterval;
  labelTime.textContent = timeAttack;
  labelSpeed.textContent = trackingSpeed;
  setActiveMode(mode);
  showLastSessionPreview();
  updateHUD();

  // Ensure controls update variables live (selected mode stored in setActiveMode)
  // expose settings change to live variables
  // when user finishes adjusting sliders update target size/behavior
  targetSizeEl.addEventListener('change', () => { targetSize = Number(targetSizeEl.value); });
  spawnIntervalEl.addEventListener('change', () => { spawnInterval = Number(spawnIntervalEl.value); });
  timeAttackEl.addEventListener('change', () => { timeAttack = Number(timeAttackEl.value); });
  trackingSpeedEl.addEventListener('change', () => { trackingSpeed = Number(trackingSpeedEl.value); });

  // Save last session preview on load
  window.addEventListener('load', showLastSessionPreview);
})();