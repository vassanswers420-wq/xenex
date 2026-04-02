
/* ═══ ENCRYPT / DECRYPT ═══ */
const EK = 'TixWatcher_v2.1_SecureKey_2026';
function enc(t){const e=btoa(unescape(encodeURIComponent(t)));let r='';for(let i=0;i<e.length;i++)r+=String.fromCharCode(e.charCodeAt(i)^EK.charCodeAt(i%EK.length));return btoa(r)}
function dec(s){try{const d=atob(s);let r='';for(let i=0;i<d.length;i++)r+=String.fromCharCode(d.charCodeAt(i)^EK.charCodeAt(i%EK.length));return decodeURIComponent(escape(atob(r)))}catch{return null}}

/* ═══ DRAW COLOURS ═══ */
const C={bg:'#0d0e11',grid:'#1c2030',text2:'#5a6278',up:'#26a69a',dn:'#ef5350',line:'#3b82f6'};

/* ═══════════════════════════════════════════════════════════════
   ChartPanel  — isolated state, safe live-tick engine
   ═══════════════════════════════════════════════════════════════
   Fix summary:
   A) loadSymbol() unsubscribes old symbol before subscribing new,
      preventing a stale symbol from staying in DataProvider's set.
   B) _seedLiveCandle() creates a brand-new object via Object.assign
      instead of storing a direct reference to the last bar, so
      mutations to liveCandle never affect the historical array.
   C) _fakeTick() is bounded to ±MAX_TICK_PCT of the ANCHOR price
      (the price at load time / last sync), not of the current close.
      This prevents drift compounding: fake ticks wander away, next
      sync target is far, correction looks like a jump.
   D) _realSync() clamps the incoming price to ±MAX_JUMP_PCT of the
      current live close. If the real price is outside that band
      (e.g. market closed, bad data) we walk toward it gradually
      over several ticks rather than snapping.
   E) New-bucket creation is guarded: only fires when isRealSync AND
      the new price passes a sanity check (within 1% of prev close).
   ═══════════════════════════════════════════════════════════════ */
class ChartPanel {
  constructor(panelEl, id) {
    this.id        = id;
    this.panel     = panelEl;
    this.canvas    = panelEl.querySelector('[data-canvas]');
    this.ctx       = this.canvas.getContext('2d');
    this.tip       = panelEl.querySelector('[data-tip]');
    this.loading   = panelEl.querySelector('.loading');

    this.data        = [];
    this.symbol      = '';
    this.chartType   = 'candle';
    this.loadId      = 0;
    this.viewStart   = 0;
    this.viewEnd     = 0;
    this.synced      = false;
    this.mX = -1; this.mY = -1;
    this.currentTool = null;
    this.tools       = [];
    this.tempTool    = null;
    this.lo = 0; this.hi = 0;

    // ── Live tick state (all isolated per-chart) ──
    this.liveCandle    = null;   // owned object, never shared
    this.currentBucket = null;

    // The "anchor" is the last confirmed real price.
    // Fake ticks orbit around it; they reset to anchor on each sync.
    this._anchor       = null;
    // Walking target: fake ticks walk toward this when anchor shifts.
    this._walkTarget   = null;

    // Timer handles
    this.liveTimer = null;
    this.syncTimer = null;

    // Limits
    this.MAX_TICK_PCT  = 0.0006;  // ±0.06% per fake tick from anchor
    this.MAX_JUMP_PCT  = 0.003;   // ±0.3%  max snap per real sync
    this.WALK_BLEND    = 0.15;    // 15% blend per tick toward walk target

    this._setupToolEvents();
    this._setupPanEvents();
    this.resize();
  }

  /* ── Persistence ── */
  exportState() {
    return { symbol:this.symbol, chartType:this.chartType, tools:this.tools, viewStart:this.viewStart, viewEnd:this.viewEnd };
  }
  async importState(s) {
    if (s.chartType) this.chartType = s.chartType;
    if (s.tools)     this.tools     = s.tools;
    if (s.symbol)    await this.loadSymbol(s.symbol);
    if (s.viewStart !== undefined) this.viewStart = s.viewStart;
    if (s.viewEnd   !== undefined) this.viewEnd   = s.viewEnd;
    if (!this.data.length || this.viewEnd <= this.viewStart) this._defaultView();
    this.resize(); this.draw();
  }

  /* ════════════════════════════════════════════════════════
     loadSymbol — full hard-reset, isolated per chart
     ════════════════════════════════════════════════════════ */
  async loadSymbol(sym) {
    const reqId = ++this.loadId;

    // A) Kill timers FIRST
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; }
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }

    // A) Unsubscribe old symbol so DataProvider's set stays clean
    if (this.symbol) DataProvider.unsubscribe(this.symbol);

    // B) Full state wipe
    this.symbol        = sym;
    this.data          = [];
    this.tools         = [];
    this.tempTool      = null;
    this.liveCandle    = null;
    this.currentBucket = null;
    this._anchor       = null;
    this._walkTarget   = null;
    this.viewStart     = 0;
    this.viewEnd       = 0;
    this.lo = 0; this.hi = 0;

    this.loading.classList.remove('gone');
    this.draw();

    try {
      // getData returns a DEEP COPY — this chart owns this array exclusively
      const json = await DataProvider.getData(sym);
      if (reqId !== this.loadId) return;   // symbol changed mid-flight
      if (!json || !json.length) throw new Error('No data');

      this.data = json.sort((a, b) => a.time - b.time);

      // C) Seed live candle as a NEW object (no shared reference)
      this._seedLiveCandle();

      this._defaultView();
      this.draw();
      this.updateHeader();
      this.loading.classList.add('gone');
      saveState();

      DataProvider.subscribe(sym);

      // Fake tick every 1 s
      this.liveTimer = setInterval(() => this._fakeTick(), 1000);
      // Real sync every 5 s
      this.syncTimer = setInterval(() => this._realSync(), 5000);

    } catch (err) {
      console.error(`[Chart ${this.id}] loadSymbol error:`, err);
      this.loading.classList.add('gone');
    }
  }

  /* ── Seed live candle from last historical bar (owned copy) ── */
  _seedLiveCandle() {
    if (!this.data.length) return;
    const last   = this.data[this.data.length - 1];
    const nowBucket = this._bucketOf(Date.now());
    const lastBucket = this._bucketOf(last.time);

    if (lastBucket === nowBucket) {
      // Replace the last bar object with a clone we own
      this.liveCandle = Object.assign({}, last);
      this.data[this.data.length - 1] = this.liveCandle;
    } else {
      // New minute not in history — create fresh open candle
      this.liveCandle = {
        time:   nowBucket,
        open:   last.close,
        high:   last.close,
        low:    last.close,
        close:  last.close,
        volume: 0
      };
      this.data.push(this.liveCandle);
    }

    this.currentBucket = this._bucketOf(this.liveCandle.time);
    // Anchor = starting close. Fake ticks orbit within ±MAX_TICK_PCT of this.
    this._anchor     = this.liveCandle.close;
    this._walkTarget = this.liveCandle.close;
  }

  /* ── Fake tick every 1 s ── */
	_fakeTick() {
	  if (!isIndianMarketOpen()) return; // 🚫 freeze when market closed

	  if (!this.liveCandle || this._anchor === null) return;

	  const anchor = this._anchor;
	  const cur    = this.liveCandle.close;
	  const target = this._walkTarget ?? anchor;

	  const noise  = (Math.random() - 0.5) * 2 * anchor * this.MAX_TICK_PCT;
	  const pull   = (target - cur) * this.WALK_BLEND;

	  let price = cur + noise + pull;

	  const band = anchor * this.MAX_TICK_PCT * 3;
	  price = Math.max(anchor - band, Math.min(anchor + band, price));

	  this._updateLiveCandle(price);
	  this.draw();
	  this.updateHeader();
	}

  /* ── Real sync every 5 s ── */
	async _realSync() {
	  if (!isIndianMarketOpen()) return; // 🚫 no sync when closed

	  if (!this.symbol || !this.data.length) return;

	  const sym = this.symbol;
	  try {
		const realPrice = await DataProvider.getLastPrice(sym);
		if (!realPrice || sym !== this.symbol) return;

		const cur = this.liveCandle ? this.liveCandle.close : this._anchor;
		if (!cur) {
		  this._anchor = realPrice;
		  this._walkTarget = realPrice;
		  return;
		}

		const maxJump = cur * this.MAX_JUMP_PCT;
		const clamped = Math.max(cur - maxJump, Math.min(cur + maxJump, realPrice));

		this._anchor     = clamped;
		this._walkTarget = clamped;

		const step = (clamped - cur) * 0.3;
		this._updateLiveCandle(cur + step, true);

		this.draw();
		this.updateHeader();
	  } catch (e) {}
	}

  /* ── Apply a price to the live candle ── */
  _updateLiveCandle(price, isRealSync = false) {
    if (!this.liveCandle) return;

    const nowBucket = this._bucketOf(Date.now());

    if (nowBucket !== this.currentBucket) {
      // E) Only advance bucket on a real sync, and only if price is sane
      if (!isRealSync) return;
      const prevClose = this.liveCandle.close;
      if (Math.abs(price - prevClose) / prevClose > 0.01) return;  // >1% → ignore

      this.currentBucket = nowBucket;
      this.liveCandle = {
        time:   nowBucket,
        open:   prevClose,
        high:   Math.max(prevClose, price),
        low:    Math.min(prevClose, price),
        close:  price,
        volume: 0
      };
      this.data.push(this.liveCandle);

      // Extend view to keep live candle visible
      if (this.viewEnd >= this.data.length - 2) {
        const vis = this.viewEnd - this.viewStart;
        this.viewEnd   = this.data.length;
        this.viewStart = this.viewEnd - vis;
      }
    } else {
      this.liveCandle.close = price;
      if (price > this.liveCandle.high) this.liveCandle.high = price;
      if (price < this.liveCandle.low)  this.liveCandle.low  = price;
    }
  }

  _bucketOf(ms) { return Math.floor(ms / 60000) * 60000; }

  /* ── Header ── */
  updateHeader() {
    if (!this.data.length) return;
    const last = this.liveCandle || this.data[this.data.length - 1];
    this.panel.querySelector('[data-sym]').textContent   = this.symbol;
    this.panel.querySelector('[data-price]').textContent = last.close.toFixed(2);
  }

  /* ── View helpers ── */
  _defaultView() {
    this.viewEnd   = this.data.length;
    this.viewStart = Math.max(0, this.data.length - 60);
  }

  _clampView(start, end, total) {
    const vis = end - start;
    if (start < 0) start = 0;
    const extraRight = vis * 0.5;
    if (end > total + extraRight) end = total + extraRight;
    start = end - vis;
    if (start < 0) start = 0;
    return [start, end];
  }

  priceY(p, lo, hi) {
    return 10 + (1 - (p - lo) / (hi - lo)) * (this.canvas.clientHeight - 30);
  }
  xOfIdx(i) {
    return (i - this.viewStart + 0.5) * (this.canvas.clientWidth / (this.viewEnd - this.viewStart));
  }
  xToIdx(x) {
    return this.viewStart + (x / this.canvas.clientWidth) * (this.viewEnd - this.viewStart);
  }
  yToPrice(y) {
    return this.hi - ((y - 10) / (this.canvas.clientHeight - 30)) * (this.hi - this.lo);
  }

  /* ── Drawing tools setup ── */
  _setupToolEvents() {
    const canvas = this.canvas;
    let drawing = false;
    canvas.addEventListener('mousedown', e => {
      if (!this.currentTool) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      drawing = true;
      if (this.currentTool === 'trendline')
        this.tempTool = { type:'trendline', i1:this.xToIdx(x), p1:this.yToPrice(y), i2:this.xToIdx(x), p2:this.yToPrice(y) };
      else if (this.currentTool === 'hline')
        this.tempTool = { type:'hline', price:this.yToPrice(y) };
    });
    canvas.addEventListener('mousemove', e => {
      if (!drawing || !this.tempTool) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.tempTool.type === 'trendline') { this.tempTool.i2 = this.xToIdx(x); this.tempTool.p2 = this.yToPrice(y); }
      else if (this.tempTool.type === 'hline') this.tempTool.price = this.yToPrice(y);
      this.draw();
    });
    canvas.addEventListener('mouseup', () => {
      if (!drawing || !this.tempTool) return;
      this.tools.push(this.tempTool); this.tempTool = null; drawing = false;
      this.draw(); saveState();
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault(); this.currentTool = null; this.tempTool = null;
      this.panel.querySelectorAll('[data-draw-tool]').forEach(b => b.classList.remove('active'));
      this.draw();
    });
    this.panel.querySelectorAll('[data-draw-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.drawTool;
        if (tool === 'clear') {
          this.tools = []; this.currentTool = null; this.tempTool = null;
          this.panel.querySelectorAll('[data-draw-tool]').forEach(b => b.classList.remove('active'));
          this.draw(); saveState();
        } else {
          this.currentTool = tool;
          this.panel.querySelectorAll('[data-draw-tool]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  _drawTools() {
    const ctx = this.ctx; const W = this.canvas.clientWidth;
    ctx.save(); ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.setLineDash([5,5]);
    const all = this.tempTool ? [...this.tools, this.tempTool] : this.tools;
    all.forEach(t => {
      if (t.type === 'trendline') {
        ctx.beginPath();
        ctx.moveTo(this.xOfIdx(t.i1), this.priceY(t.p1, this.lo, this.hi));
        ctx.lineTo(this.xOfIdx(t.i2), this.priceY(t.p2, this.lo, this.hi));
        ctx.stroke();
      } else if (t.type === 'hline') {
        const y = this.priceY(t.price, this.lo, this.hi);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFD700'; ctx.font = '11px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(t.price.toFixed(2), W - 5, y);
      }
    });
    ctx.restore();
  }

  /* ── Pan / zoom / hover ── */
  _setupPanEvents() {
    const body = this.panel.querySelector('.chart-body');
    let dragging = false, dragX = 0, vsD = 0, veD = 0;
    body.addEventListener('mousedown', e => {
      if (this.currentTool) return;
      dragging = true; dragX = e.clientX; vsD = this.viewStart; veD = this.viewEnd;
    });
    body.addEventListener('mousemove', e => {
      this.mX = e.offsetX; this.mY = e.offsetY;
      if (!this.currentTool) this._drawOverlay();
      if (!dragging || !this.data.length) return;
      const vis = veD - vsD;
      const delta = (e.clientX - dragX) / this.canvas.clientWidth * vis;
      let ns = vsD - delta, ne = veD - delta;
      [ns, ne] = this._clampView(ns, ne, this.data.length);
      this.viewStart = ns; this.viewEnd = ne;
      this.draw();
    });
    body.addEventListener('mouseup',    () => { dragging = false; });
    body.addEventListener('mouseleave', () => {
      dragging = false; this.mX = -1; this.mY = -1;
      this.tip.style.display = 'none';
    });
    body.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.data.length) return;
      const vis    = this.viewEnd - this.viewStart;
      const factor = e.deltaY > 0 ? 1.13 : 0.88;
      const newVis = Math.max(10, Math.min(300, vis * factor));
      const rect   = this.canvas.getBoundingClientRect();
      const mRatio = (e.clientX - rect.left) / this.canvas.clientWidth;
      const mid    = this.viewStart + vis * mRatio;
      this.viewStart = mid - newVis * mRatio;
      this.viewEnd   = this.viewStart + newVis;
      [this.viewStart, this.viewEnd] = this._clampView(this.viewStart, this.viewEnd, this.data.length);
      this.draw();
    }, { passive:false });
    this.panel.querySelectorAll('[data-chart-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.panel.querySelectorAll('[data-chart-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.chartType;
        this.chartType = t === 'heat' ? 'heatmap' : t;
        this.draw();
      });
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.panel.clientWidth, h = this.panel.clientHeight;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    if (this.data.length) this.draw();
  }

  /* ── Main draw ── */
  draw() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = C.bg; ctx.fillRect(0,0,W,H);

    const slice = this.data.slice(Math.floor(this.viewStart), Math.ceil(this.viewEnd));
    if (!slice.length) { ctx.restore(); return; }

    const vis  = this.viewEnd - this.viewStart;
    const AP   = 50;  // axis padding left
    const candW = (W - AP) / vis;
    const bodyW = Math.max(1, candW * 0.6);

    let lo = Infinity, hi = -Infinity;
    slice.forEach(d => { lo = Math.min(lo, d.low); hi = Math.max(hi, d.high); });
    const rng = hi - lo || 1;
    lo -= rng * 0.05; hi += rng * 0.05;
    this.lo = lo; this.hi = hi;

    // Y axis
    ctx.fillStyle = C.text2; ctx.font = '12px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const y = 10 + (H - 30) * (i / 5);
      const p = hi - (hi - lo) * (i / 5);
      ctx.fillText(p.toFixed(2), AP - 5, y);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // X axis
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const nxt = Math.min(slice.length, 10);
    for (let i = 0; i <= nxt; i++) {
      const idx = Math.floor(i * (slice.length - 1) / Math.max(nxt, 1));
      if (!slice[idx]) continue;
      const x   = AP + (idx - 0.5) * ((W - AP) / vis);
      const dt  = new Date(slice[idx].time);
      const lbl = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      ctx.fillStyle = C.text2; ctx.fillText(lbl, x, H - 20);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 30); ctx.stroke();
    }

    // Chart
    if (this.chartType === 'line') {
      ctx.beginPath(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
      slice.forEach((d, i) => {
        const x = AP + (i - 0.5) * ((W - AP) / vis);
        const y = this.priceY(d.close, lo, hi);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

    } else if (this.chartType === 'heatmap') {
      const maxVol = slice.reduce((m,d) => Math.max(m, d.volume), 0) || 1;
      ctx.globalCompositeOperation = 'screen';
      slice.forEach((d, i) => {
        const x  = AP + (i - 0.5) * ((W - AP) / vis);
        const yO = this.priceY(d.open, lo, hi), yC = this.priceY(d.close, lo, hi);
        const yCenter = (yO + yC) / 2;
        const vi = Math.pow(d.volume / maxVol, 0.5);
        const radius = candW * 2 + vi * candW * 4;
        const g = ctx.createRadialGradient(x, yCenter, 0, x, yCenter, radius);
        const a = 0.5 + vi * 0.5;
        const isBuy = d.close >= d.open;
        if (isBuy) {
          g.addColorStop(0, `rgba(${Math.floor(255-155*vi)},255,0,${a})`);
          g.addColorStop(0.6, `rgba(${Math.floor(255-155*vi)},255,0,0.3)`);
        } else {
          g.addColorStop(0, `rgba(255,${Math.floor(165*(1-vi))},0,${a})`);
          g.addColorStop(0.6, `rgba(255,${Math.floor(165*(1-vi))},0,0.3)`);
        }
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, yCenter, radius, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

    } else {
      // Candlestick
      slice.forEach((d, i) => {
        const x  = AP + (i - 0.5) * ((W - AP) / vis);
        const yO = this.priceY(d.open,  lo, hi);
        const yH = this.priceY(d.high,  lo, hi);
        const yL = this.priceY(d.low,   lo, hi);
        const yC = this.priceY(d.close, lo, hi);
        const clr = d.close >= d.open ? C.up : C.dn;
        ctx.strokeStyle = clr; ctx.lineWidth = Math.max(0.5, candW * 0.08);
        ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, Math.min(yO,yC)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, Math.max(yO,yC)); ctx.lineTo(x, yL); ctx.stroke();
        ctx.fillStyle = clr;
        ctx.fillRect(x - bodyW/2, Math.min(yO,yC), bodyW, Math.max(1, Math.abs(yC-yO)));
      });
    }

    this._drawTools();
    ctx.restore();

    // Live price line + label
    if (this.liveCandle || this.data.length) {
      const last = this.liveCandle || this.data[this.data.length - 1];
      const y    = this.priceY(last.close, this.lo, this.hi);
      ctx.save();
      ctx.strokeStyle = '#4da6ff'; ctx.lineWidth = 1; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '12px monospace';
      const txt = last.close.toFixed(2);
      const bw  = ctx.measureText(txt).width + 12, bh = 16;
      let   by  = y - bh/2;
      if (by < 2) by = 2;
      if (by + bh > H - 2) by = H - bh - 2;
      ctx.fillStyle = '#4da6ff'; ctx.fillRect(2, by, bw, bh);
      ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 8, by + bh/2);
      ctx.restore();
    }
  }

  /* ── Hover tooltip ── */
  _drawOverlay() {
    if (this.mX < 0 || !this.data.length) { this.tip.style.display = 'none'; return; }
    const vis = this.viewEnd - this.viewStart;
    const idx = Math.round(this.viewStart + (this.mX / this.canvas.clientWidth) * vis);
    if (idx >= 0 && idx < this.data.length) {
      const d = this.data[idx];
      const chg = d.close - d.open, pct = ((chg / d.open) * 100).toFixed(2);
      this.tip.innerHTML = `
        <div class="tr"><span class="tl">O</span><span class="tv">${d.open.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">H</span><span class="tv">${d.high.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">L</span><span class="tv">${d.low.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">C</span><span class="tv">${d.close.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">CHG</span><span class="tv ${chg>=0?'up':'dn'}">${chg>=0?'+':''}${chg.toFixed(2)} (${pct}%)</span></div>`;
      this.tip.style.display = 'block';
      this.tip.style.left = Math.min(this.mX + 10, this.canvas.clientWidth - 150) + 'px';
      this.tip.style.top  = Math.max(10, this.mY - 60) + 'px';
    }
  }
}

/* ═══ APP STATE ═══ */
const charts = [];
let symbols = [], currentLayout = '2x2', lastUsedSymbols = [];

function saveState() {
  try {
    const s = { version:'2.1', timestamp:Date.now(), layout:currentLayout, lastUsedSymbols, charts:charts.map(c=>c.exportState()) };
    localStorage.setItem('tixwatcher_state', enc(JSON.stringify(s)));
    const sb = document.getElementById('sb-status');
    sb.textContent = 'Saved';
    setTimeout(() => sb.textContent = 'Ready', 2000);
  } catch(e) { console.error('Save failed', e); }
}

function loadState() {
  try {
    const d = dec(localStorage.getItem('tixwatcher_state'));
    if (!d) return false;
    const s = JSON.parse(d);
    if (s.version !== '2.1') return false;
    if (s.layout) { currentLayout = s.layout; applyLayout(currentLayout); }
    if (s.lastUsedSymbols) lastUsedSymbols = s.lastUsedSymbols;
    if (s.charts) (async () => {
      for (let i = 0; i < s.charts.length; i++)
        if (i < charts.length) await charts[i].importState(s.charts[i]);
    })();
    return true;
  } catch { return false; }
}

function applyLayout(layout) {
  const main = document.getElementById('main');
  let vis = [];
  if (layout === '1x1')      { main.style.gridTemplateColumns='1fr'; main.style.gridTemplateRows='1fr'; vis=[0]; }
  else if (layout === '1x2') { main.style.gridTemplateColumns='1fr 1fr'; main.style.gridTemplateRows='1fr'; vis=[0,1]; }
  else                       { main.style.gridTemplateColumns='1fr 1fr'; main.style.gridTemplateRows='1fr 1fr'; vis=charts.map((_,i)=>i); }
  charts.forEach((c,i) => {
    c.panel.style.display = vis.includes(i) ? 'flex' : 'none';
    if (vis.includes(i)) { c.resize(); c.draw(); }
  });
}

function exportToFile() {
  const s = { version:'2.1', timestamp:Date.now(), layout:currentLayout, lastUsedSymbols, charts:charts.map(c=>c.exportState()) };
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([enc(JSON.stringify(s))], {type:'text/plain'})),
    download: `tixwatcher_${Date.now()}.twl`
  });
  a.click(); URL.revokeObjectURL(a.href);
  charts.forEach(c => { c.resize(); c.draw(); });
}

function importFromFile() {
  const inp = Object.assign(document.createElement('input'), {type:'file', accept:'.twl'});
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async ev => {
      try {
        const s = JSON.parse(dec(ev.target.result));
        if (s.version !== '2.1') throw new Error('Incompatible version');
        if (s.layout) { currentLayout = s.layout; applyLayout(currentLayout); }
        if (s.lastUsedSymbols) lastUsedSymbols = s.lastUsedSymbols;
        if (s.charts) for (let i=0; i<s.charts.length; i++) if (i<charts.length) await charts[i].importState(s.charts[i]);
      } catch(err) { alert('Import failed: ' + err.message); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ═══ INIT ═══ */
async function init() {
  try   { symbols = await DataProvider.getSymbols(); }
  catch { symbols = DataProvider.SYMBOLS.map(s => ({symbol:s,name:s})); }

  document.querySelectorAll('[data-panel]').forEach((el, i) => {
    const chart = new ChartPanel(el, i);
    charts.push(chart);
    const sel = el.querySelector('[data-symbol-select]');
    if (!sel) return;
    symbols.forEach(s => { const o = document.createElement('option'); o.value = o.text = s.symbol||s; sel.appendChild(o); });
    sel.value = symbols[i]?.symbol || symbols[0]?.symbol;
    sel.addEventListener('change', () => chart.loadSymbol(sel.value));
  });

  if (!loadState()) {
    charts.forEach(c => { const sel = c.panel.querySelector('[data-symbol-select]'); if (sel) c.loadSymbol(sel.value); });
  }

  new ResizeObserver(() => charts.forEach(c => c.resize())).observe(document.getElementById('main'));

  setInterval(() => {
    document.getElementById('sb-time').textContent = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  }, 1000);
}

/* ═══ MENU ═══ */
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const was = item.classList.contains('active');
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    if (!was) item.classList.add('active');
  });
});
document.addEventListener('click', () => document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active')));

document.querySelectorAll('.menu-opt').forEach(opt => {
  opt.addEventListener('click', e => {
    e.stopPropagation();
    const act = opt.dataset.action;
    const main = document.getElementById('main');
    let vis = [];

    if      (act==='inspect')    openInspector();
    else if (act==='export')     exportToFile();
    else if (act==='import')     importFromFile();
    else if (act==='layout-1x1') { currentLayout='1x1'; main.style.gridTemplateColumns='1fr'; main.style.gridTemplateRows='1fr'; vis=[0]; saveState(); }
    else if (act==='layout-1x2') { currentLayout='1x2'; main.style.gridTemplateColumns='1fr 1fr'; main.style.gridTemplateRows='1fr'; vis=[0,1]; saveState(); }
    else if (act==='layout-2x2') { currentLayout='2x2'; main.style.gridTemplateColumns='1fr 1fr'; main.style.gridTemplateRows='1fr 1fr'; vis=charts.map((_,i)=>i); saveState(); }
    else if (act==='sync-charts') {
      const anyOff = charts.some(c => !c.synced);
      charts.forEach(c => c.synced = anyOff);
      if (anyOff) { const sym = charts[0].symbol; charts.forEach(c => { if (c !== charts[0]) c.loadSymbol(sym); }); }
      charts.forEach(c => c.panel.style.border = c.synced ? '2px solid #FFD700' : '2px solid #333');
    }
    else if (act==='reset-zoom') charts.forEach(c => { c._defaultView(); c.draw(); });

    if (vis.length) {
      charts.forEach((c,i) => {
        const show = vis.includes(i);
        c.panel.style.display = show ? 'flex' : 'none';
        if (show) { c.resize(); if (!c.data.length) { const sel=c.panel.querySelector('[data-symbol-select]'); if(sel) c.loadSymbol(sel.value); } }
      });
    }
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  });
});
function isIndianMarketOpen() {
  const now = new Date();

  // Convert to IST explicitly (safe across browsers)
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const day = ist.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = ist.getHours();
  const minutes = ist.getMinutes();

  // Weekend check
  if (day === 0 || day === 6) return false;

  // Time check (09:15 to 15:30)
  const currentMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  return currentMinutes >= marketOpen && currentMinutes <= marketClose;
}
/* ═══ INSPECTOR ═══ */
function openInspector() {
  const grid = document.getElementById('inspector-grid');
  grid.innerHTML = '';
  charts.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="card-sym">Chart ${i+1}: ${c.symbol||'Empty'}</div>
      <div class="card-info">Type: ${c.chartType} | Bars: ${c.data.length}</div>
      <div class="card-info">Tools: ${c.tools.length} | Anchor: ${c._anchor?.toFixed(2)||'—'}</div>
      <div class="card-preview">${c.chartType==='candle'?'▯▯▯':c.chartType==='heatmap'?'🔥🔥🔥':'📈'}</div>
      <div class="card-actions">
        <button class="card-btn" onclick="focusChart(${i})">Focus</button>
        <button class="card-btn" onclick="clearChart(${i})">Clear</button>
      </div>`;
    grid.appendChild(card);
  });
  document.getElementById('inspector').classList.add('active');
}
function closeInspector() { document.getElementById('inspector').classList.remove('active'); }
function focusChart(i) {
  currentLayout='1x1';
  charts.forEach((c,j) => { c.panel.style.display = j===i?'flex':'none'; if(j===i) c.resize(); });
  closeInspector(); saveState();
}
function clearChart(i) {
  if(confirm(`Clear drawings on Chart ${i+1}?`)){charts[i].tools=[];charts[i].draw();saveState();openInspector();}
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeInspector(); });

init();
