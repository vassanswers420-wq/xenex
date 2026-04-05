/**
 * TixWatcher — ChartWindow Module
 * Manages individual chart windows: DOM, events, live data, state.
 * All rendering is delegated to ChartRenderer.
 */

'use strict';

let winIdCounter = 0;
const windows    = [];

/* ─── Market hours helper ─── */
function isMarketOpen() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const cur = ist.getHours() * 60 + ist.getMinutes();
  return cur >= 9 * 60 + 15 && cur <= 15 * 60 + 30;
}

/* ─── Simple signal notifier ─── */
const SignalNotifier = (() => {
  const _last = {};
  function notify(symbol, signal, label, chartId, indId) {
    const key = `${chartId}_${indId}_${symbol}`;
    if (_last[key] === signal) return;
    _last[key] = signal;
    const isBuy = signal === 'BUY';
    const el = document.createElement('div');
    el.style.cssText = `
      background:${isBuy ? 'rgba(0,217,126,0.10)' : 'rgba(255,71,87,0.10)'};
      border:1px solid ${isBuy ? 'rgba(0,217,126,0.3)' : 'rgba(255,71,87,0.3)'};
      border-left:3px solid ${isBuy ? '#00d97e' : '#ff4757'};
      border-radius:4px;padding:8px 10px;
      font-family:'JetBrains Mono',monospace;font-size:10px;
      color:${isBuy ? '#00d97e' : '#ff4757'};
      display:flex;align-items:center;gap:8px;
      pointer-events:all;opacity:0;transform:translateX(18px);
      transition:opacity .25s,transform .25s;cursor:default;
      box-shadow:0 2px 12px rgba(0,0,0,0.5);min-width:180px;
    `;
    el.innerHTML = `
      <span style="font-size:13px">${isBuy ? '▲' : '▼'}</span>
      <div style="flex:1">
        <div style="font-weight:700;letter-spacing:.3px">${symbol}</div>
        <div style="opacity:.6;font-size:9px;margin-top:1px">${label || signal} · Chart ${chartId + 1}</div>
      </div>
      <span style="opacity:.4;cursor:pointer;padding:2px 4px" onclick="this.closest('div').remove()">✕</span>
    `;
    const container = document.getElementById('toast-container');
    container.appendChild(el);
    if (container.children.length > 5) container.children[0].remove();
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; });
    setTimeout(() => {
      el.style.opacity = '0'; el.style.transform = 'translateX(18px)';
      setTimeout(() => el.parentNode && el.remove(), 300);
    }, 5000);
  }
  function resetChart(chartId) {
    Object.keys(_last).forEach(k => { if (k.startsWith(`${chartId}_`)) delete _last[k]; });
  }
  return { notify, resetChart };
})();
window.SignalNotifier = SignalNotifier;

/* ─── Symbol Price Hub (shared live tick state per symbol) ─── */
const SymbolPriceHub = (() => {
  const hubs = new Map();
  function get(sym) {
    if (!hubs.has(sym)) hubs.set(sym, { anchor: null, walkTarget: null, lastTick: null, subscribers: new Set() });
    return hubs.get(sym);
  }
  function subscribe(sym, chart)   { get(sym).subscribers.add(chart);    }
  function unsubscribe(sym, chart) {
    const h = hubs.get(sym); if (!h) return;
    h.subscribers.delete(chart);
    if (h.subscribers.size === 0) hubs.delete(sym);
  }
  function seed(sym, price) {
    const h = get(sym);
    if (h.anchor === null) { h.anchor = price; h.walkTarget = price; h.lastTick = price; }
  }
  function tick(sym) {
    const h = hubs.get(sym); if (!h || h.anchor === null) return null;
    const TICK_PCT = 0.00008, WALK_BLEND = 0.08;
    const anchor = h.anchor, cur = h.lastTick ?? anchor, target = h.walkTarget ?? anchor;
    const noise = (Math.random() - 0.5) * 2 * anchor * TICK_PCT;
    const pull  = (target - cur) * WALK_BLEND;
    let price = cur + noise + pull;
    const band = anchor * TICK_PCT * 3;
    price = Math.max(anchor - band, Math.min(anchor + band, price));
    h.lastTick = price;
    return price;
  }
  function realSync(sym, realPrice) {
    const h = hubs.get(sym);
    if (!h || h.anchor === null) { const h2 = get(sym); h2.anchor = realPrice; h2.walkTarget = realPrice; h2.lastTick = realPrice; return realPrice; }
    const MAX_JUMP = 0.002, cur = h.lastTick ?? h.anchor;
    const clamped = Math.max(cur - cur * MAX_JUMP, Math.min(cur + cur * MAX_JUMP, realPrice));
    h.anchor = clamped; h.walkTarget = clamped;
    return clamped;
  }
  return { subscribe, unsubscribe, seed, tick, realSync };
})();
window.SymbolPriceHub = SymbolPriceHub;

/* ═══════════════════════════════════════════════════════════
   ChartWindow CLASS
═══════════════════════════════════════════════════════════ */
class ChartWindow {
  constructor(symbol, position) {
    this.id         = winIdCounter++;
    this.symbol     = symbol || 'RELIANCE';
    this.chartType  = 'candle';
    this.showVolume = true;
    this.data       = [];
    this.viewStart  = 0; this.viewEnd = 0;
    this.lo = 0; this.hi = 0;
    this.liveCandle = null; this.currentBucket = null;
    this.tools      = []; this.currentTool = null; this.tempTool = null;
    this.indicators = [];
    this._lastSignalState = {};
    this.liveTimer  = null; this.syncTimer = null;
    this.loadId     = 0;
    this.maximized  = false;
    this._preMaxState = null;
    this.mX = -1; this.mY = -1;
    this._alerts    = []; // price alerts

    this._buildDOM(position);
    this._setupEvents();
    this.resize();
    windows.push(this);
    if (typeof updateStatusBar === 'function') updateStatusBar();
  }

  /* ─────── DOM BUILD ─────── */
  _buildDOM(pos) {
    const ws = document.getElementById('workspace');
    const el = document.createElement('div');
    el.className = 'chart-win';
    el.dataset.winId = this.id;
    el.style.left   = (pos?.x || 20 + this.id * 30) + 'px';
    el.style.top    = (pos?.y || 20 + this.id * 30) + 'px';
    el.style.width  = (pos?.w || 620) + 'px';
    el.style.height = (pos?.h || 420) + 'px';
    el.style.zIndex = 10 + this.id;

    const SYMBOLS = window.DataProvider?.SYMBOLS || [];
    const chartTypes = [
      { id:'candle',  title:'Candlestick', svg:`<svg viewBox="0 0 18 18" width="12" height="12"><line x1="4" y1="2" x2="4" y2="16" stroke="currentColor" stroke-width="1.2"/><rect x="2.5" y="5" width="3" height="6" fill="currentColor"/><line x1="13" y1="2" x2="13" y2="16" stroke="currentColor" stroke-width="1.2"/><rect x="11.5" y="4" width="3" height="7" fill="currentColor"/></svg>` },
      { id:'ohlc',    title:'OHLC bars',   svg:`<svg viewBox="0 0 18 18" width="12" height="12"><line x1="5" y1="2" x2="5" y2="16" stroke="currentColor" stroke-width="1.4"/><line x1="2" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.4"/><line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" stroke-width="1.4"/><line x1="13" y1="2" x2="13" y2="16" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.4"/><line x1="13" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.4"/></svg>` },
      { id:'line',    title:'Line',        svg:`<svg viewBox="0 0 18 18" width="12" height="12" fill="none"><polyline points="2,13 7,8 11,11 16,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
      { id:'area',    title:'Area',        svg:`<svg viewBox="0 0 18 18" width="12" height="12" fill="none"><polyline points="2,13 7,8 11,11 16,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="2,13 7,8 11,11 16,4 16,16 2,16" fill="currentColor" opacity=".3"/></svg>` },
      { id:'heatmap', title:'Volume Heat', svg:`<svg viewBox="0 0 18 18" width="12" height="12"><rect x="2" y="2" width="6" height="6" fill="currentColor" opacity=".7"/><rect x="10" y="2" width="6" height="6" fill="currentColor"/><rect x="2" y="10" width="6" height="6" fill="currentColor" opacity=".4"/><rect x="10" y="10" width="6" height="6" fill="currentColor" opacity=".85"/></svg>` }
    ];

    el.innerHTML = `
      <div class="win-titlebar">
        <div class="win-traffic">
          <button class="win-btn win-btn-close" title="Close"></button>
          <button class="win-btn win-btn-min"   title="Minimize/Restore"></button>
          <button class="win-btn win-btn-exp"   title="Maximize/Restore"></button>
        </div>
        <span class="win-sym-badge" data-sym-badge>${this.symbol}</span>
        <span class="win-price-badge" data-price-badge>—</span>
        <span class="win-chg-badge" data-chg-badge></span>
        <div class="win-right">
          <span class="win-alert-count" data-alert-count style="display:none"></span>
          <span style="font-size:9px;color:var(--text3)">Chart ${this.id + 1}</span>
        </div>
      </div>
      <div class="panel-header">
        <select class="sym-select" data-sym-select>
          ${SYMBOLS.map(s => `<option value="${s}" ${s === this.symbol ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <div class="chart-type-btns">
          ${chartTypes.map(ct => `<div class="ct-btn ${ct.id === 'candle' ? 'active' : ''}" data-ct="${ct.id}" title="${ct.title}">${ct.svg}</div>`).join('')}
        </div>
        <div class="draw-btns">
          <button class="draw-btn" data-draw="trendline" title="Draw trendline">Trend</button>
          <button class="draw-btn" data-draw="hline"     title="Horizontal line">H-Line</button>
          <button class="draw-btn" data-draw="rect"      title="Draw rectangle">Rect</button>
          <button class="draw-btn" data-draw="fib"       title="Fibonacci retracement">Fib</button>
          <button class="draw-btn" data-draw="clear"     title="Clear drawings">Clear</button>
        </div>
        <div class="panel-header-right">
          <button class="ph-icon-btn vol-btn" data-vol-btn title="Toggle volume">Vol</button>
          <button class="ph-icon-btn alert-btn" data-alert-btn title="Price alert">🔔</button>
          <button class="ind-launch-btn" title="Indicators">⚡</button>
        </div>
      </div>
      <div class="chart-body">
        <canvas class="chart-canvas"></canvas>
        <div class="chart-tooltip"></div>
        <div class="chart-loading"><div class="spin"></div><span class="ltxt">Loading…</span></div>
      </div>
      <div class="resize-handle"></div>
    `;

    ws.appendChild(el);
    this.el       = el;
    this.canvas   = el.querySelector('.chart-canvas');
    this.ctx      = this.canvas.getContext('2d');
    this.tooltip  = el.querySelector('.chart-tooltip');
    this.loadingEl = el.querySelector('.chart-loading');
  }

  /* ─────── EVENTS ─────── */
  _setupEvents() {
    const el = this.el;
    const titlebar = el.querySelector('.win-titlebar');

    el.querySelector('.win-btn-close').addEventListener('click', e => { e.stopPropagation(); this.destroy(); });
    el.querySelector('.win-btn-min').addEventListener('click',   e => { e.stopPropagation(); this._toggleMinimize(); });
    el.querySelector('.win-btn-exp').addEventListener('click',   e => { e.stopPropagation(); this._toggleMaximize(); });

    el.querySelector('[data-sym-select]').addEventListener('change', e => this.loadSymbol(e.target.value));

    el.querySelectorAll('[data-ct]').forEach(btn => btn.addEventListener('click', () => {
      el.querySelectorAll('[data-ct]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.chartType = btn.dataset.ct;
      this.draw();
    }));

    el.querySelectorAll('[data-draw]').forEach(btn => btn.addEventListener('click', () => {
      const tool = btn.dataset.draw;
      if (tool === 'clear') {
        this.tools = []; this.currentTool = null; this.tempTool = null;
        el.querySelectorAll('[data-draw]').forEach(b => b.classList.remove('active'));
        this.draw(); saveState?.();
      } else {
        this.currentTool = this.currentTool === tool ? null : tool;
        el.querySelectorAll('[data-draw]').forEach(b => b.classList.remove('active'));
        if (this.currentTool) btn.classList.add('active');
      }
    }));

    el.querySelector('[data-vol-btn]')?.addEventListener('click', () => {
      this.showVolume = !this.showVolume;
      el.querySelector('[data-vol-btn]').style.color = this.showVolume ? 'var(--accent)' : '';
      this.draw();
    });

    el.querySelector('[data-alert-btn]')?.addEventListener('click', () => this._showAlertDialog());

    el.querySelector('.ind-launch-btn')?.addEventListener('click', () => {
      if (typeof openIndicatorEditor === 'function') openIndicatorEditor(this);
    });

    this._setupDrag(titlebar);
    this._setupResize(el.querySelector('.resize-handle'));
    el.addEventListener('mousedown', () => this._focus());
    this._setupCanvasEvents();
    titlebar.addEventListener('dblclick', () => this._toggleMaximize());
  }

  _focus() {
    windows.forEach(w => w.el.classList.remove('focused'));
    this.el.classList.add('focused');
    const maxZ = Math.max(...windows.map(w => parseInt(w.el.style.zIndex || 10)));
    this.el.style.zIndex = maxZ + 1;
  }

  _toggleMinimize() {
    const body = this.el.querySelector('.chart-body');
    const ph   = this.el.querySelector('.panel-header');
    if (body.style.display === 'none') {
      body.style.display = ''; ph.style.display = '';
      this.el.style.height = (this._preMinH || 420) + 'px';
    } else {
      this._preMinH = this.el.offsetHeight;
      body.style.display = 'none'; ph.style.display = 'none';
      this.el.style.height = '30px';
    }
  }

  _toggleMaximize() {
    if (this.maximized) {
      const s = this._preMaxState;
      this.el.classList.remove('maximized');
      Object.assign(this.el.style, { left: s.left, top: s.top, width: s.width, height: s.height, zIndex: s.zIndex });
      this.maximized = false;
    } else {
      this._preMaxState = { left: this.el.style.left, top: this.el.style.top, width: this.el.style.width, height: this.el.style.height, zIndex: this.el.style.zIndex };
      this.el.classList.add('maximized');
      this.el.style.zIndex = 500;
      this.maximized = true;
    }
    requestAnimationFrame(() => this.resize());
  }

  _setupDrag(handle) {
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      if (e.target.classList.contains('win-btn') || this.maximized) return;
      dragging = true; ox = e.clientX - this.el.offsetLeft; oy = e.clientY - this.el.offsetTop;
      this.el.classList.add('dragging'); this._focus(); e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const ws = document.getElementById('workspace').getBoundingClientRect();
      this.el.style.left = Math.max(0, Math.min(e.clientX - ox, ws.width  - 100)) + 'px';
      this.el.style.top  = Math.max(0, Math.min(e.clientY - oy, ws.height - 50))  + 'px';
    });
    document.addEventListener('mouseup', () => { if (dragging) { dragging = false; this.el.classList.remove('dragging'); } });
  }

  _setupResize(handle) {
    let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    handle.addEventListener('mousedown', e => {
      if (this.maximized) return;
      resizing = true; sx = e.clientX; sy = e.clientY; sw = this.el.offsetWidth; sh = this.el.offsetHeight;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', e => {
      if (!resizing) return;
      this.el.style.width  = Math.max(300, sw + (e.clientX - sx)) + 'px';
      this.el.style.height = Math.max(200, sh + (e.clientY - sy)) + 'px';
      this.resize();
    });
    document.addEventListener('mouseup', () => { if (resizing) { resizing = false; saveState?.(); } });
  }

  _setupCanvasEvents() {
    const canvas = this.canvas, body = this.el.querySelector('.chart-body');
    let drawing = false, panDragging = false, dragX = 0, vsD = 0, veD = 0;

	canvas.addEventListener('mousedown', e => {
	  // ✅ RIGHT CLICK = cancel (do this FIRST)
	  if (e.button === 2) {
		this.tempTool = null;
		drawing = false;
		this.draw();
		return;
	  }

	  // ✅ ONLY allow LEFT click
	  if (e.button !== 0) return;

	  if (!this.currentTool) return;

	  const r = canvas.getBoundingClientRect();
	  const x = e.clientX - r.left;
	  const y = e.clientY - r.top;

	  drawing = true;

	  const idx = this.xToIdx(x);
	  const price = this.yToPrice(y);

	  if (this.currentTool === 'trendline') {
		this.tempTool = { type: 'trendline', i1: idx, p1: price, i2: idx, p2: price };
	  }
	  else if (this.currentTool === 'hline') {
		this.tempTool = { type: 'hline', price, i1: 0, i2: 0, p1: price, p2: price };
	  }
	  else if (this.currentTool === 'rect') {
		this.tempTool = { type: 'rect', i1: idx, p1: price, i2: idx, p2: price };
	  }
	  else if (this.currentTool === 'fib') {
		this.tempTool = { type: 'fib', i1: idx, p1: price, i2: idx, p2: price };
	  }
	});


	canvas.addEventListener('mouseup', e => {
	  // ✅ ONLY left click can finalize drawing
	  if (e.button !== 0) return;

	  if (!drawing || !this.tempTool) return;

	  this.tools.push(this.tempTool);
	  this.tempTool = null;
	  drawing = false;

	  this.draw();
	  saveState?.();
	});
	canvas.addEventListener('mouseleave', () => {
	  drawing = false;
	  this.tempTool = null;
	  this.draw();
	});
	canvas.addEventListener('contextmenu', e => {
	  e.preventDefault();

	  drawing = false; // 🚨 CRITICAL FIX
	  this.currentTool = null;
	  this.tempTool = null;

	  this.el.querySelectorAll('[data-draw]').forEach(b => b.classList.remove('active'));

	  this.draw();
	});

    body.addEventListener('mousedown', e => {
      if (this.currentTool) return;
      panDragging = true; dragX = e.clientX; vsD = this.viewStart; veD = this.viewEnd;
    });
	body.addEventListener('mousemove', e => {
	  const r = canvas.getBoundingClientRect();
	  const x = e.clientX - r.left;
	  const y = e.clientY - r.top;

	  this.mX = x;
	  this.mY = y;

	  // ✅ PAN logic
	  if (panDragging && this.data.length) {
		const vis = veD - vsD;
		const delta = (e.clientX - dragX) / canvas.clientWidth * vis;

		[this.viewStart, this.viewEnd] = this._clampView(vsD - delta, veD - delta);
	  }

	  // ✅ redraw ALWAYS
	  this.draw();
	});
    body.addEventListener('mouseup',    () => { panDragging = false; });
    body.addEventListener('mouseleave', () => { panDragging = false; this.mX = -1; this.mY = -1; this.tooltip.style.display = 'none'; this.draw(); });

    body.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.data.length) return;
      const vis = this.viewEnd - this.viewStart;
      const factor = e.deltaY > 0 ? 1.12 : 0.88;
      const newVis = Math.max(10, Math.min(400, vis * factor));
      const rect = canvas.getBoundingClientRect();
      const mRatio = (e.clientX - rect.left) / canvas.clientWidth;
      const mid = this.viewStart + vis * mRatio;
      this.viewStart = mid - newVis * mRatio; this.viewEnd = this.viewStart + newVis;
      [this.viewStart, this.viewEnd] = this._clampView(this.viewStart, this.viewEnd);
      this.draw();
    }, { passive: false });

    /* Double-click canvas — check alerts */
    canvas.addEventListener('dblclick', e => {
      const price = this.yToPrice(e.offsetY);
      this._alerts.push({ price: +price.toFixed(2), triggered: false });
      this._updateAlertBadge();
      this._showToast(`Alert set @ ${price.toFixed(2)}`, 'info');
      saveState?.();
    });
  }

  /* ─────── LIVE DATA ─────── */
  async loadSymbol(sym) {
    const reqId = ++this.loadId;
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; }
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    if (this.symbol) {
      window.DataProvider?.unsubscribe(this.symbol);
      window.SymbolPriceHub?.unsubscribe(this.symbol, this);
    }
    window.SignalNotifier?.resetChart(this.id);

    this.symbol = sym; this.data = []; this.tools = []; this.tempTool = null;
    this.liveCandle = null; this.currentBucket = null;
    this.viewStart = 0; this.viewEnd = 0; this.lo = 0; this.hi = 0;
    this.indicators.forEach(ind => { ind.signals = []; ind.overlays = {}; });
    this._lastSignalState = {};

    this.loadingEl.classList.remove('gone');
    this._updateHeader();

    try {
      const json = await window.DataProvider.getData(sym);
      if (reqId !== this.loadId) return;
      if (!json?.length) throw new Error('No data');
      this.data = json.sort((a, b) => a.time - b.time);

      try {
        const rp = await window.DataProvider.getLastPrice(sym);
        if (reqId !== this.loadId) return;
        if (rp && rp > 0) {
          const last = this.data[this.data.length - 1];
          if (Math.abs(rp - last.close) / last.close > 0.005) {
            last.close = rp; last.high = Math.max(last.high, rp); last.low = Math.min(last.low, rp);
          }
        }
      } catch {}

      if (reqId !== this.loadId) return;
      this._seedLiveCandle();
      this._defaultView();
      this._runAllIndicators();
      this.draw();
      this._updateHeader();
      this.loadingEl.classList.add('gone');

      const sel = this.el.querySelector('[data-sym-select]');
      if (sel && sel.value !== sym) sel.value = sym;
      this.el.querySelector('[data-sym-badge]').textContent = sym;

      saveState?.();
      window.DataProvider.subscribe(sym);
      window.SymbolPriceHub.seed(sym, this.liveCandle.close);
      window.SymbolPriceHub.subscribe(sym, this);
      this.liveTimer = setInterval(() => this._fakeTick(), 1000);
      this.syncTimer = setInterval(() => this._realSync(), 5000);
    } catch (err) {
      console.error(`[Win ${this.id}] loadSymbol error:`, err);
      this.loadingEl.classList.add('gone');
    }
  }

  _seedLiveCandle() {
    if (!this.data.length) return;
    const last = this.data[this.data.length - 1];
    const nb = this._bucketOf(Date.now()), lb = this._bucketOf(last.time);
    if (lb === nb) { this.liveCandle = { ...last }; this.data[this.data.length - 1] = this.liveCandle; }
    else { this.liveCandle = { time: nb, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 }; this.data.push(this.liveCandle); }
    this.currentBucket = this._bucketOf(this.liveCandle.time);
  }
  _bucketOf(ms) { return Math.floor(ms / 60000) * 60000; }

  _fakeTick() {
    if (!isMarketOpen() || !this.liveCandle || !this.symbol) return;
    const price = window.SymbolPriceHub.tick(this.symbol);
    if (price === null) return;
    this._updateLiveCandle(price);
    this._runAllIndicators();
    this._checkSignalNotifications();
    this._checkAlerts(price);
    this.draw(); this._updateHeader();
  }

  async _realSync() {
    if (!isMarketOpen() || !this.symbol || !this.data.length) return;
    const sym = this.symbol;
    try {
      const rp = await window.DataProvider.getLastPrice(sym);
      if (!rp || sym !== this.symbol) return;
      const clamped = window.SymbolPriceHub.realSync(sym, rp);
      const cur = this.liveCandle ? this.liveCandle.close : clamped;
      this._updateLiveCandle(cur + (clamped - cur) * 0.3, true);
      this._runAllIndicators();
      this._checkSignalNotifications();
      this.draw(); this._updateHeader();
    } catch {}
  }

  _updateLiveCandle(price, isRealSync = false) {
    if (!this.liveCandle) return;
    const nb = this._bucketOf(Date.now());
    if (nb !== this.currentBucket) {
      if (!isRealSync) return;
      const pc = this.liveCandle.close;
      if (Math.abs(price - pc) / pc > 0.01) return;
      this.currentBucket = nb;
      this.liveCandle = { time: nb, open: pc, high: Math.max(pc, price), low: Math.min(pc, price), close: price, volume: 0 };
      this.data.push(this.liveCandle);
      if (this.viewEnd >= this.data.length - 2) {
        const vis = this.viewEnd - this.viewStart; this.viewEnd = this.data.length; this.viewStart = this.viewEnd - vis;
      }
    } else {
      this.liveCandle.close = price;
      if (price > this.liveCandle.high) this.liveCandle.high = price;
      if (price < this.liveCandle.low)  this.liveCandle.low  = price;
    }
  }

  _updateHeader() {
    const badge = this.el.querySelector('[data-sym-badge]');
    const price = this.el.querySelector('[data-price-badge]');
    const chg   = this.el.querySelector('[data-chg-badge]');
    if (badge) badge.textContent = this.symbol || '—';
    if (this.data.length) {
      const last = this.liveCandle || this.data[this.data.length - 1];
      const diff = last.close - last.open;
      const pct  = ((diff / last.open) * 100).toFixed(2);
      if (price) { price.textContent = last.close.toFixed(2); price.style.color = diff >= 0 ? 'var(--up)' : 'var(--dn)'; }
      if (chg)   { chg.textContent = `${diff >= 0 ? '+' : ''}${pct}%`; chg.style.color = diff >= 0 ? 'var(--up)' : 'var(--dn)'; }
    }
  }

  /* ─────── INDICATORS ─────── */
  _runAllIndicators() {
    this.indicators.forEach(ind => {
      if (!ind.enabled || !ind.code?.trim()) { ind.signals = []; ind.overlays = {}; ind.error = null; return; }
      const result = window.IndicatorEngine.compile(ind.code, this.data);
      if (!result) return;
      ind.signals  = result.signals  || [];
      ind.overlays = result.overlays || {};
      ind.error    = result.error    || null;
    });
  }

  _runIndicatorById(id) {
    const ind = this.indicators.find(x => x.id === id); if (!ind) return;
    if (!ind.enabled || !ind.code?.trim()) { ind.signals = []; ind.overlays = {}; ind.error = null; return; }
    const result = window.IndicatorEngine.compile(ind.code, this.data);
    if (!result) return;
    ind.signals  = result.signals  || [];
    ind.overlays = result.overlays || {};
    ind.error    = result.error    || null;
  }

  _checkSignalNotifications() {
    const lastIdx = this.data.length - 1; if (lastIdx < 0) return;
    this.indicators.forEach(ind => {
      if (!ind.enabled || !ind.signals?.length) return;
      const sig = ind.signals[lastIdx];
      if (!sig?.signal || sig.signal === 'NEUTRAL') return;
      window.SignalNotifier.notify(this.symbol, sig.signal, sig.label || ind.name, this.id, ind.id);
    });
  }

  /* ─────── PRICE ALERTS ─────── */
  _checkAlerts(price) {
    let triggered = false;
    this._alerts.forEach(alert => {
      if (alert.triggered) return;
      const prev = this.data.length >= 2 ? this.data[this.data.length - 2].close : null;
      if (!prev) return;
      if ((prev < alert.price && price >= alert.price) || (prev > alert.price && price <= alert.price)) {
        alert.triggered = true; triggered = true;
        this._showToast(`🔔 ${this.symbol} hit ${alert.price}`, 'alert');
      }
    });
    if (triggered) this._updateAlertBadge();
  }

  _updateAlertBadge() {
    const badge = this.el.querySelector('[data-alert-count]'); if (!badge) return;
    const active = this._alerts.filter(a => !a.triggered).length;
    badge.textContent = active > 0 ? `🔔${active}` : '';
    badge.style.display = active > 0 ? '' : 'none';
  }

  _showAlertDialog() {
    const priceStr = prompt(`Set price alert for ${this.symbol}\nCurrent: ${this.data[this.data.length-1]?.close?.toFixed(2) || '—'}\nEnter target price:`);
    if (!priceStr) return;
    const price = parseFloat(priceStr);
    if (!isFinite(price) || price <= 0) return;
    this._alerts.push({ price, triggered: false });
    this._updateAlertBadge();
    this._showToast(`Alert set @ ${price.toFixed(2)}`, 'info');
    saveState?.();
  }

  _showToast(msg, type = 'info') {
    const el = document.createElement('div');
    const colors = { info: '#3d9cff', alert: '#f0a500', error: '#ff4757' };
    el.style.cssText = `background:var(--bg2);border:1px solid var(--border2);border-left:3px solid ${colors[type]||colors.info};border-radius:4px;padding:7px 10px;font-size:9px;color:var(--text1);opacity:0;transform:translateX(18px);transition:.25s;font-family:'JetBrains Mono',monospace;`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
  }

  addIndicator(code = '', name = 'Indicator', enabled = true) {
    const ind = { id: Date.now() + Math.random(), code, enabled, name, signals: [], overlays: {}, error: null };
    this.indicators.push(ind);
    if (enabled && code.trim() && this.data.length) this._runIndicatorById(ind.id);
    this.draw(); saveState?.();
    return ind;
  }

  updateIndicator(id, code, enabled, name) {
    const ind = this.indicators.find(x => x.id === id); if (!ind) return;
    ind.code = code; ind.enabled = enabled; if (name) ind.name = name;
    if (enabled && code.trim() && this.data.length) this._runIndicatorById(id);
    else { ind.signals = []; ind.overlays = {}; ind.error = null; }
    this.draw(); saveState?.();
  }

  removeIndicator(id) {
    this.indicators = this.indicators.filter(x => x.id !== id);
    delete this._lastSignalState[id];
    this.draw(); saveState?.();
  }

  /* ─────── BACKTEST ─────── */
  runBacktest(indId) {
    const ind = this.indicators.find(x => x.id === indId); if (!ind) return null;
    if (!ind.signals?.length) return null;
    return window.IndicatorEngine.backtest(ind.signals, this.data);
  }

  /* ─────── DRAW / VIEW ─────── */
  _defaultView() { this.viewEnd = this.data.length; this.viewStart = Math.max(0, this.data.length - 80); }
  _clampView(s, e) {
    const vis = e - s;
    if (s < 0) s = 0;
    const extra = vis * 0.5;
    if (e > this.data.length + extra) e = this.data.length + extra;
    s = e - vis; if (s < 0) s = 0;
    return [s, e];
  }
  xToIdx(x)    { return this.viewStart + (x / this.canvas.clientWidth) * (this.viewEnd - this.viewStart); }
  yToPrice(y)  { return this.hi - ((y - 14) / (this.canvas.clientHeight - 38)) * (this.hi - this.lo); }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    this.canvas.width  = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    if (this.data.length) this.draw();
  }

  draw() { window.ChartRenderer.draw(this); }

  /* ─────── STATE ─────── */
  exportState() {
    return {
      symbol: this.symbol, chartType: this.chartType,
      showVolume: this.showVolume, tools: this.tools,
      viewStart: this.viewStart, viewEnd: this.viewEnd,
      alerts: this._alerts,
      pos: { x: parseInt(this.el.style.left) || 0, y: parseInt(this.el.style.top) || 0, w: this.el.offsetWidth, h: this.el.offsetHeight },
      indicators: this.indicators.map(ind => ({ id: ind.id, code: ind.code, enabled: ind.enabled, name: ind.name }))
    };
  }

  async importState(s) {
    if (s.chartType)   this.chartType  = s.chartType;
    if (s.showVolume !== undefined) this.showVolume = s.showVolume;
    if (s.tools)       this.tools      = s.tools;
    if (s.alerts)      this._alerts    = s.alerts;
    if (s.indicators)  this.indicators = s.indicators.map(ind => ({ ...ind, signals: [], overlays: {}, error: null }));
    if (s.pos) { this.el.style.left = s.pos.x + 'px'; this.el.style.top = s.pos.y + 'px'; this.el.style.width = s.pos.w + 'px'; this.el.style.height = s.pos.h + 'px'; }
    this._updateAlertBadge();
    if (s.symbol) await this.loadSymbol(s.symbol);
    else { this._defaultView(); this.resize(); this.draw(); }
  }

  destroy() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.symbol) {
      window.DataProvider?.unsubscribe(this.symbol);
      window.SymbolPriceHub?.unsubscribe(this.symbol, this);
    }
    this.el.remove();
    const idx = windows.indexOf(this);
    if (idx >= 0) windows.splice(idx, 1);
    if (typeof updateStatusBar === 'function') updateStatusBar();
    if (typeof saveState      === 'function') saveState();
  }
}

window.ChartWindow = ChartWindow;
window.windows     = windows;