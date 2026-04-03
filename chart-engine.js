/* ═══════════════════════════════════════════════════════════
   TixWatcher — Chart Engine v2.6
   ═══════════════════════════════════════════════════════════
   Changes vs v2.5:
   A) _drawIndicatorOverlays() — fixed coordinate math so SMA/
      EMA lines, BBands, and VWAP actually render correctly
      on the canvas at the right pixel positions.
   B) Signal notifications — SignalNotifier fires subtle
      corner toasts on BUY/SELL transitions.
   C) Indicator modal — multi-indicator stack with + button,
      full reference guide with code examples.
   ═══════════════════════════════════════════════════════════ */

/* ═══ ENCRYPT / DECRYPT ═══ */
const EK = 'TixWatcher_v2.1_SecureKey_2026';
function enc(t){const e=btoa(unescape(encodeURIComponent(t)));let r='';for(let i=0;i<e.length;i++)r+=String.fromCharCode(e.charCodeAt(i)^EK.charCodeAt(i%EK.length));return btoa(r)}
function dec(s){try{const d=atob(s);let r='';for(let i=0;i<d.length;i++)r+=String.fromCharCode(d.charCodeAt(i)^EK.charCodeAt(i%EK.length));return decodeURIComponent(escape(atob(r)))}catch{return null}}

/* ═══ ThemeManager ═══ */
const ThemeManager = (() => {
  const THEMES = {
    terminal:{label:'Terminal',vars:{'--tw-bg0':'#0a0a0a','--tw-bg1':'#0f0f0f','--tw-bg2':'#141414','--tw-bg3':'#1b1b1b','--tw-bg4':'#222222','--tw-border':'#2a2a2a','--tw-border2':'#3a3a3a','--tw-text1':'#e6e6e6','--tw-text2':'#a0a0a0','--tw-text3':'#5c5c5c','--tw-up':'#00c853','--tw-upd':'rgba(0,200,83,0.12)','--tw-down':'#ff3d00','--tw-downd':'rgba(255,61,0,0.12)','--tw-accent':'#ffb300','--tw-accentd':'rgba(255,179,0,0.15)','--tw-candle-bg':'#0d0e11','--tw-grid':'#1c2030','--tw-up-c':'#26a69a','--tw-dn-c':'#ef5350','--tw-line-c':'#3b82f6','--tw-bar':'#1a1d23','--tw-bar-border':'#2e3340'}},
    dawn:{label:'Dawn',vars:{'--tw-bg0':'#f8f4ef','--tw-bg1':'#f2ece3','--tw-bg2':'#ebe1d4','--tw-bg3':'#dfd2c1','--tw-bg4':'#d3c4ae','--tw-border':'#c4b09a','--tw-border2':'#b09080','--tw-text1':'#2a1f14','--tw-text2':'#6b5240','--tw-text3':'#a08870','--tw-up':'#2d7a4f','--tw-upd':'rgba(45,122,79,0.12)','--tw-down':'#c0392b','--tw-downd':'rgba(192,57,43,0.12)','--tw-accent':'#c77b2b','--tw-accentd':'rgba(199,123,43,0.15)','--tw-candle-bg':'#f0e8dc','--tw-grid':'#d8cfc4','--tw-up-c':'#2d7a4f','--tw-dn-c':'#c0392b','--tw-line-c':'#3b6db0','--tw-bar':'#e8ddd0','--tw-bar-border':'#c4b09a'}},
    ocean:{label:'Ocean',vars:{'--tw-bg0':'#050e1a','--tw-bg1':'#071525','--tw-bg2':'#0a1d30','--tw-bg3':'#0e273e','--tw-bg4':'#13304c','--tw-border':'#1a3d55','--tw-border2':'#245070','--tw-text1':'#c8e8f8','--tw-text2':'#7ab0cc','--tw-text3':'#3d6880','--tw-up':'#00e5cc','--tw-upd':'rgba(0,229,204,0.12)','--tw-down':'#ff6b6b','--tw-downd':'rgba(255,107,107,0.12)','--tw-accent':'#00b4d8','--tw-accentd':'rgba(0,180,216,0.15)','--tw-candle-bg':'#060f1c','--tw-grid':'#0d2235','--tw-up-c':'#00e5cc','--tw-dn-c':'#ff6b6b','--tw-line-c':'#48cae4','--tw-bar':'#081828','--tw-bar-border':'#1a3d55'}},
    ember:{label:'Ember',vars:{'--tw-bg0':'#100803','--tw-bg1':'#180d04','--tw-bg2':'#201208','--tw-bg3':'#2a180a','--tw-bg4':'#341e0c','--tw-border':'#4a2810','--tw-border2':'#60341a','--tw-text1':'#f5dcc8','--tw-text2':'#b8855a','--tw-text3':'#6b4230','--tw-up':'#ffaa00','--tw-upd':'rgba(255,170,0,0.12)','--tw-down':'#ff4444','--tw-downd':'rgba(255,68,68,0.12)','--tw-accent':'#ff6d00','--tw-accentd':'rgba(255,109,0,0.15)','--tw-candle-bg':'#120904','--tw-grid':'#241408','--tw-up-c':'#ffaa00','--tw-dn-c':'#ff4444','--tw-line-c':'#ff8c42','--tw-bar':'#1c0e06','--tw-bar-border':'#4a2810'}},
    matrix:{label:'Matrix',vars:{'--tw-bg0':'#000300','--tw-bg1':'#010501','--tw-bg2':'#020803','--tw-bg3':'#030c04','--tw-bg4':'#041006','--tw-border':'#0a2010','--tw-border2':'#143020','--tw-text1':'#a8ffa8','--tw-text2':'#5abf5a','--tw-text3':'#2a6630','--tw-up':'#00ff41','--tw-upd':'rgba(0,255,65,0.12)','--tw-down':'#ff2828','--tw-downd':'rgba(255,40,40,0.12)','--tw-accent':'#39ff14','--tw-accentd':'rgba(57,255,20,0.12)','--tw-candle-bg':'#000400','--tw-grid':'#051a08','--tw-up-c':'#00ff41','--tw-dn-c':'#ff2828','--tw-line-c':'#00cc66','--tw-bar':'#010701','--tw-bar-border':'#0a2010'}}
  };
  let currentTheme = 'terminal';
  function applyTheme(id, skipRedraw) {
    const theme = THEMES[id]; if (!theme) return;
    currentTheme = id;
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k,v]) => root.style.setProperty(k,v));
    C.bg=theme.vars['--tw-candle-bg']; C.grid=theme.vars['--tw-grid'];
    C.text2=theme.vars['--tw-text2']; C.up=theme.vars['--tw-up-c'];
    C.dn=theme.vars['--tw-dn-c']; C.line=theme.vars['--tw-line-c'];
    document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===id));
    if (!skipRedraw && typeof charts !== 'undefined') charts.forEach(c=>c.draw());
  }
  function getThemes()  { return THEMES; }
  function getCurrent() { return currentTheme; }
  return { applyTheme, getThemes, getCurrent };
})();
window.ThemeManager = ThemeManager;

/* ═══ SymbolPriceHub ═══ */
const SymbolPriceHub = (() => {
  const hubs = new Map();
  function get(sym) { if(!hubs.has(sym)) hubs.set(sym,{anchor:null,walkTarget:null,lastTick:null,subscribers:new Set()}); return hubs.get(sym); }
  function subscribe(sym,chart)   { get(sym).subscribers.add(chart); }
  function unsubscribe(sym,chart) { const h=hubs.get(sym); if(!h) return; h.subscribers.delete(chart); if(h.subscribers.size===0) hubs.delete(sym); }
  function seed(sym,price)        { const h=get(sym); if(h.anchor===null){h.anchor=price;h.walkTarget=price;h.lastTick=price;} }
  function tick(sym) {
    const h=hubs.get(sym); if(!h||h.anchor===null) return null;
    const TICK_PCT=0.00008,WALK_BLEND=0.08;
    const anchor=h.anchor,cur=h.lastTick??anchor,target=h.walkTarget??anchor;
    const noise=(Math.random()-0.5)*2*anchor*TICK_PCT;
    const pull=(target-cur)*WALK_BLEND;
    let price=cur+noise+pull;
    const band=anchor*TICK_PCT*3;
    price=Math.max(anchor-band,Math.min(anchor+band,price));
    h.lastTick=price; return price;
  }
  function realSync(sym,realPrice) {
    const h=hubs.get(sym);
    if(!h||h.anchor===null){const h2=get(sym);h2.anchor=realPrice;h2.walkTarget=realPrice;h2.lastTick=realPrice;return realPrice;}
    const MAX_JUMP_PCT=0.002,cur=h.lastTick??h.anchor;
    const clamped=Math.max(cur-cur*MAX_JUMP_PCT,Math.min(cur+cur*MAX_JUMP_PCT,realPrice));
    h.anchor=clamped;h.walkTarget=clamped; return clamped;
  }
  return {subscribe,unsubscribe,seed,tick,realSync};
})();
window.SymbolPriceHub = SymbolPriceHub;

/* ═══ DRAW COLOURS ═══ */
const C = {bg:'#0d0e11',grid:'#1c2030',text2:'#a0a0a0',up:'#26a69a',dn:'#ef5350',line:'#3b82f6'};
const OVERLAY_COLORS = ['#f59e0b','#a78bfa','#34d399','#fb923c','#60a5fa','#f472b6','#e879f9'];

/* ═══════════════════════════════════════════════════════════
   ChartPanel
   ═══════════════════════════════════════════════════════════ */
class ChartPanel {
  constructor(panelEl, id) {
    this.id=id; this.panel=panelEl;
    this.canvas=panelEl.querySelector('[data-canvas]');
    this.ctx=this.canvas.getContext('2d');
    this.tip=panelEl.querySelector('[data-tip]');
    this.loading=panelEl.querySelector('.loading');
    this.data=[]; this.symbol=''; this.chartType='candle';
    this.loadId=0; this.viewStart=0; this.viewEnd=0;
    this.synced=false; this.mX=-1; this.mY=-1;
    this.currentTool=null; this.tools=[]; this.tempTool=null;
    this.lo=0; this.hi=0;
    this.liveCandle=null; this.currentBucket=null; this._anchor=null;
    this.liveTimer=null; this.syncTimer=null;
    // Multi-indicator stack
    this.indicators = [];       // [{id, code, enabled, name, signals, overlays, error}]
    this._lastSignalState = {}; // track last signal per indicator to fire notifications once
    this._setupToolEvents(); this._setupPanEvents(); this.resize();
  }

  exportState() {
    return {
      symbol:this.symbol, chartType:this.chartType, tools:this.tools,
      viewStart:this.viewStart, viewEnd:this.viewEnd,
      indicators: this.indicators.map(ind => ({ id:ind.id, code:ind.code, enabled:ind.enabled, name:ind.name }))
    };
  }
  async importState(s) {
    if(s.chartType) this.chartType=s.chartType;
    if(s.tools)     this.tools=s.tools;
    if(s.indicators) {
      this.indicators = s.indicators.map(ind => ({ ...ind, signals:[], overlays:{}, error:null }));
    }
    // backwards compat: old single indicator
    if(!s.indicators && s.indicatorCode) {
      this.indicators = [{ id:Date.now(), code:s.indicatorCode, enabled:s.indicatorEnabled||false, name:'Indicator 1', signals:[], overlays:{}, error:null }];
    }
    if(s.symbol) await this.loadSymbol(s.symbol);
    if(s.viewStart!==undefined) this.viewStart=s.viewStart;
    if(s.viewEnd!==undefined)   this.viewEnd=s.viewEnd;
    if(!this.data.length||this.viewEnd<=this.viewStart) this._defaultView();
    this.resize(); this.draw();
  }

  _syncSelector() {
    const sel=this.panel.querySelector('[data-symbol-select]');
    if(sel&&this.symbol&&sel.value!==this.symbol) sel.value=this.symbol;
  }

  async loadSymbol(sym) {
    const reqId=++this.loadId;
    if(this.liveTimer){clearInterval(this.liveTimer);this.liveTimer=null;}
    if(this.syncTimer){clearInterval(this.syncTimer);this.syncTimer=null;}
    if(this.symbol){DataProvider.unsubscribe(this.symbol);SymbolPriceHub.unsubscribe(this.symbol,this);}

    this.symbol=sym; this.data=[]; this.tools=[]; this.tempTool=null;
    this.liveCandle=null; this.currentBucket=null; this._anchor=null;
    this.viewStart=0; this.viewEnd=0; this.lo=0; this.hi=0;
    this.indicators.forEach(ind => { ind.signals=[]; ind.overlays={}; });
    this._lastSignalState = {};

    this.loading.classList.remove('gone');
    this.draw();

    try {
      const json=await DataProvider.getData(sym);
      if(reqId!==this.loadId) return;
      if(!json||!json.length) throw new Error('No data');
      this.data=json.sort((a,b)=>a.time-b.time);

      try {
        const realPrice=await DataProvider.getLastPrice(sym);
        if(reqId!==this.loadId) return;
        if(realPrice&&realPrice>0) {
          const last=this.data[this.data.length-1];
          if(Math.abs(realPrice-last.close)/last.close>0.005){
            last.close=realPrice;last.high=Math.max(last.high,realPrice);last.low=Math.min(last.low,realPrice);
          }
        }
      } catch {}

      if(reqId!==this.loadId) return;
      this._seedLiveCandle();
      this._defaultView();
      this._runAllIndicators();
      this.draw(); this.updateHeader();
      this.loading.classList.add('gone');
      this._syncSelector();
      saveState();
      DataProvider.subscribe(sym);
      SymbolPriceHub.seed(sym,this.liveCandle.close);
      SymbolPriceHub.subscribe(sym,this);
      this.liveTimer=setInterval(()=>this._fakeTick(),1000);
      this.syncTimer=setInterval(()=>this._realSync(),5000);
    } catch(err) {
      console.error(`[Chart ${this.id}] loadSymbol error:`,err);
      this.loading.classList.add('gone');
    }
  }

  /* ── Multi-indicator helpers ──────────────────────────── */
  _runAllIndicators() {
    if(!window.IndicatorEngine) return;
    this.indicators.forEach(ind => {
      if(!ind.enabled || !ind.code.trim()) { ind.signals=[]; ind.overlays={}; ind.error=null; return; }
      const result = IndicatorEngine.compile(ind.code, this.data);
      if(!result) return;
      ind.signals  = result.signals;
      ind.overlays = result.overlays;
      ind.error    = result.error;
    });
  }

  _runIndicatorById(id) {
    const ind = this.indicators.find(x=>x.id===id);
    if(!ind || !window.IndicatorEngine) return;
    if(!ind.enabled || !ind.code.trim()) { ind.signals=[]; ind.overlays={}; ind.error=null; return; }
    const result = IndicatorEngine.compile(ind.code, this.data);
    if(!result) return;
    ind.signals  = result.signals;
    ind.overlays = result.overlays;
    ind.error    = result.error;
  }

  _checkSignalNotifications() {
    if(!window.SignalNotifier) return;
    const lastIdx = this.data.length - 1;
    if(lastIdx < 0) return;
    this.indicators.forEach(ind => {
      if(!ind.enabled || !ind.signals.length) return;
      const sig = ind.signals[lastIdx];
      if(!sig || sig.signal === 'NEUTRAL') return;
      const prev = this._lastSignalState[ind.id];
      if(prev !== sig.signal) {
        this._lastSignalState[ind.id] = sig.signal;
        // Only notify on change, and only BUY/SELL
        if(sig.signal === 'BUY' || sig.signal === 'SELL') {
          SignalNotifier.notify(this.symbol, sig.signal, sig.label || ind.name, this.id);
        }
      }
    });
  }

  addIndicator(code='', name='Indicator', enabled=true) {
    const ind = { id: Date.now() + Math.random(), code, enabled, name, signals:[], overlays:{}, error:null };
    this.indicators.push(ind);
    if(enabled && code.trim() && this.data.length) this._runIndicatorById(ind.id);
    this.draw(); saveState();
    return ind;
  }

  updateIndicator(id, code, enabled, name) {
    const ind = this.indicators.find(x=>x.id===id);
    if(!ind) return;
    ind.code=code; ind.enabled=enabled; if(name) ind.name=name;
    if(enabled && code.trim() && this.data.length) this._runIndicatorById(id);
    else { ind.signals=[]; ind.overlays={}; ind.error=null; }
    this.draw(); saveState();
  }

  removeIndicator(id) {
    this.indicators = this.indicators.filter(x=>x.id!==id);
    delete this._lastSignalState[id];
    this.draw(); saveState();
  }

  /* ── Live candle machinery ────────────────────────────── */
  _seedLiveCandle() {
    if(!this.data.length) return;
    const last=this.data[this.data.length-1];
    const nowBucket=this._bucketOf(Date.now()),lastBucket=this._bucketOf(last.time);
    if(lastBucket===nowBucket){
      this.liveCandle=Object.assign({},last);
      this.data[this.data.length-1]=this.liveCandle;
    } else {
      this.liveCandle={time:nowBucket,open:last.close,high:last.close,low:last.close,close:last.close,volume:0};
      this.data.push(this.liveCandle);
    }
    this.currentBucket=this._bucketOf(this.liveCandle.time);
    this._anchor=this.liveCandle.close;
  }
  _fakeTick() {
    if(!isIndianMarketOpen()||!this.liveCandle||!this.symbol) return;
    const price=SymbolPriceHub.tick(this.symbol);
    if(price===null) return;
    this._updateLiveCandle(price);
    this._runAllIndicators();
    this._checkSignalNotifications();
    this.draw(); this.updateHeader();
  }
  async _realSync() {
    if(!isIndianMarketOpen()||!this.symbol||!this.data.length) return;
    const sym=this.symbol;
    try {
      const realPrice=await DataProvider.getLastPrice(sym);
      if(!realPrice||sym!==this.symbol) return;
      const clamped=SymbolPriceHub.realSync(sym,realPrice);
      const cur=this.liveCandle?this.liveCandle.close:clamped;
      this._updateLiveCandle(cur + (clamped - cur) * 0.3, true);
      this._runAllIndicators();
      this._checkSignalNotifications();
      this.draw(); this.updateHeader();
    } catch {}
  }
  _updateLiveCandle(price,isRealSync=false) {
    if(!this.liveCandle) return;
    const nowBucket=this._bucketOf(Date.now());
    if(nowBucket!==this.currentBucket) {
      if(!isRealSync) return;
      const prevClose=this.liveCandle.close;
      if(Math.abs(price-prevClose)/prevClose>0.01) return;
      this.currentBucket=nowBucket;
      this.liveCandle={time:nowBucket,open:prevClose,high:Math.max(prevClose,price),low:Math.min(prevClose,price),close:price,volume:0};
      this.data.push(this.liveCandle);
      if(this.viewEnd>=this.data.length-2){const vis=this.viewEnd-this.viewStart;this.viewEnd=this.data.length;this.viewStart=this.viewEnd-vis;}
    } else {
      this.liveCandle.close=price;
      if(price>this.liveCandle.high) this.liveCandle.high=price;
      if(price<this.liveCandle.low)  this.liveCandle.low=price;
    }
  }
  _bucketOf(ms){return Math.floor(ms/60000)*60000;}

  updateHeader() {
    if(!this.data.length) return;
    const last=this.liveCandle||this.data[this.data.length-1];
    this.panel.querySelector('[data-sym]').textContent=this.symbol;
    this.panel.querySelector('[data-price]').textContent=last.close.toFixed(2);
  }
  _defaultView(){this.viewEnd=this.data.length;this.viewStart=Math.max(0,this.data.length-60);}
  _clampView(start,end,total){
    const vis=end-start; if(start<0) start=0;
    const extraRight=vis*0.5; if(end>total+extraRight) end=total+extraRight;
    start=end-vis; if(start<0) start=0; return [start,end];
  }
  priceY(p,lo,hi,H){ H = H || this.canvas.clientHeight; return 10+(1-(p-lo)/(hi-lo))*(H-30); }
  xOfIdx(i,W,vis){ W = W || this.canvas.clientWidth; return 50 + (i - this.viewStart + 0.5) * ((W - 50) / vis); }
  xToIdx(x){return this.viewStart+(x/this.canvas.clientWidth)*(this.viewEnd-this.viewStart);}
  yToPrice(y){return this.hi-((y-10)/(this.canvas.clientHeight-30))*(this.hi-this.lo);}

  /* ── Drawing tools ────────────────────────────────────── */
  _setupToolEvents() {
    const canvas=this.canvas;
    let drawing=false;
    canvas.addEventListener('mousedown',e=>{
      if(!this.currentTool) return;
      const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      drawing=true;
      if(this.currentTool==='trendline') this.tempTool={type:'trendline',i1:this.xToIdx(x),p1:this.yToPrice(y),i2:this.xToIdx(x),p2:this.yToPrice(y)};
      else if(this.currentTool==='hline') this.tempTool={type:'hline',price:this.yToPrice(y)};
    });
    canvas.addEventListener('mousemove',e=>{
      this.mX=e.offsetX;this.mY=e.offsetY;
      if(!this.currentTool) this._drawOverlay();
      if(!drawing||!this.tempTool) return;
      const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      if(this.tempTool.type==='trendline'){this.tempTool.i2=this.xToIdx(x);this.tempTool.p2=this.yToPrice(y);}
      else if(this.tempTool.type==='hline') this.tempTool.price=this.yToPrice(y);
      this.draw();
    });
    canvas.addEventListener('mouseup',()=>{
      if(!drawing||!this.tempTool) return;
      this.tools.push(this.tempTool);this.tempTool=null;drawing=false;
      this.draw();saveState();
    });
    canvas.addEventListener('contextmenu',e=>{
      e.preventDefault();this.currentTool=null;this.tempTool=null;
      this.panel.querySelectorAll('[data-draw-tool]').forEach(b=>b.classList.remove('active'));
      this.draw();
    });
    this.panel.querySelectorAll('[data-draw-tool]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const tool=btn.dataset.drawTool;
        if(tool==='clear'){
          this.tools=[];this.currentTool=null;this.tempTool=null;
          this.panel.querySelectorAll('[data-draw-tool]').forEach(b=>b.classList.remove('active'));
          this.draw();saveState();
        } else {
          this.currentTool=tool;
          this.panel.querySelectorAll('[data-draw-tool]').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
    const indBtn=this.panel.querySelector('[data-indicator-btn]');
    if(indBtn) indBtn.addEventListener('click',()=>openIndicatorEditor(this));
  }

  _drawTools() {
    const ctx=this.ctx,W=this.canvas.clientWidth;
    ctx.save();ctx.strokeStyle='#FFD700';ctx.lineWidth=2;ctx.setLineDash([5,5]);
    const all=this.tempTool?[...this.tools,this.tempTool]:this.tools;
    all.forEach(t=>{
      if(t.type==='trendline'){
        ctx.beginPath();
        ctx.moveTo(this.xOfIdx(t.i1,W,this.viewEnd-this.viewStart),this.priceY(t.p1,this.lo,this.hi));
        ctx.lineTo(this.xOfIdx(t.i2,W,this.viewEnd-this.viewStart),this.priceY(t.p2,this.lo,this.hi));
        ctx.stroke();
      } else if(t.type==='hline'){
        const y=this.priceY(t.price,this.lo,this.hi);
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='#FFD700';ctx.font='11px monospace';
        ctx.textAlign='right';ctx.textBaseline='middle';
        ctx.fillText(t.price.toFixed(2),W-5,y);
      }
    });
    ctx.restore();
  }

  /* ── Indicator overlay renderer (fixed coordinate math) ─ */
  _drawIndicatorOverlays() {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const AP = 50;
    const vis = this.viewEnd - this.viewStart;
    const startIdx = Math.floor(this.viewStart);
    const endIdx   = Math.ceil(this.viewEnd);
    const candW    = (W - AP) / vis;

    /* Helper: x pixel for data index i */
    const xOf = (i) => AP + (i - this.viewStart + 0.5) * candW;
    /* Helper: y pixel for price p */
    const yOf = (p) => this.priceY(p, this.lo, this.hi, H);

    /* Helper: draw a line from values array */
    const drawLine = (values, dash) => {
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      for (let i = startIdx; i < endIdx && i < values.length; i++) {
        const val = values[i];
        if (val === null || val === undefined || isNaN(val)) { started = false; continue; }
        const x = xOf(i), y = yOf(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else            ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    let colorIdx = 0;

    ctx.save();

    this.indicators.forEach(ind => {
      if (!ind.enabled || !ind.overlays) return;
      const ov = ind.overlays;

      /* ── SMA lines (solid) ── */
      if (ov.smaLines && ov.smaLines.length) {
        ov.smaLines.forEach(line => {
          if (!line.values) return;
          const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
          ctx.strokeStyle = col;
          ctx.lineWidth   = 1.4;
          drawLine(line.values);
          /* right-edge label */
          let lastV = null;
          for (let i = Math.min(endIdx, line.values.length) - 1; i >= startIdx; i--) {
            if (line.values[i] !== null && !isNaN(line.values[i])) { lastV = line.values[i]; break; }
          }
          if (lastV !== null) {
            ctx.fillStyle = col; ctx.font = '9px monospace';
            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillText(line.label, W - 3, yOf(lastV));
          }
        });
      }

      /* ── EMA lines (dashed) ── */
      if (ov.emaLines && ov.emaLines.length) {
        ov.emaLines.forEach(line => {
          if (!line.values) return;
          const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
          ctx.strokeStyle = col;
          ctx.lineWidth   = 1.4;
          drawLine(line.values, [5, 3]);
          let lastV = null;
          for (let i = Math.min(endIdx, line.values.length) - 1; i >= startIdx; i--) {
            if (line.values[i] !== null && !isNaN(line.values[i])) { lastV = line.values[i]; break; }
          }
          if (lastV !== null) {
            ctx.fillStyle = col; ctx.font = '9px monospace';
            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillText(line.label, W - 3, yOf(lastV));
          }
        });
      }

      /* ── Bollinger Bands ── */
      if (ov.bbands && ov.bbands.length) {
        ov.bbands.forEach(bb => {
          /* Fill band */
          ctx.beginPath();
          let started = false;
          for (let i = startIdx; i < endIdx && i < bb.upper.length; i++) {
            if (bb.upper[i] === null) { started = false; continue; }
            const x = xOf(i), y = yOf(bb.upper[i]);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else           ctx.lineTo(x, y);
          }
          for (let i = Math.min(endIdx, bb.lower.length) - 1; i >= startIdx; i--) {
            if (bb.lower[i] === null) continue;
            ctx.lineTo(xOf(i), yOf(bb.lower[i]));
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(139,92,246,0.05)';
          ctx.fill();

          /* Band lines */
          ctx.strokeStyle = 'rgba(139,92,246,0.8)';
          ctx.lineWidth   = 1;
          drawLine(bb.upper);
          drawLine(bb.lower);
          ctx.strokeStyle = 'rgba(139,92,246,0.35)';
          drawLine(bb.mid, [4, 4]);

          /* Label */
          let lastU = null;
          for (let i = Math.min(endIdx, bb.upper.length) - 1; i >= startIdx; i--) {
            if (bb.upper[i] !== null) { lastU = bb.upper[i]; break; }
          }
          if (lastU !== null) {
            ctx.fillStyle = 'rgba(139,92,246,0.9)'; ctx.font = '9px monospace';
            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillText('BB', W - 3, yOf(lastU));
          }
        });
      }

      /* ── VWAP ── */
      if (ov.vwapLine && ov.vwapLine.length) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth   = 1.5;
        drawLine(ov.vwapLine, [6, 3]);
        let lastVwap = null;
        for (let i = Math.min(endIdx, ov.vwapLine.length) - 1; i >= startIdx; i--) {
          if (ov.vwapLine[i] !== null) { lastVwap = ov.vwapLine[i]; break; }
        }
        if (lastVwap !== null) {
          ctx.fillStyle = '#f59e0b'; ctx.font = '9px monospace';
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText('VWAP', W - 3, yOf(lastVwap));
        }
      }

      /* ── BUY / SELL arrows ── */
      if (ind.signals && ind.signals.length) {
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        for (let i = startIdx; i < endIdx && i < this.data.length && i < ind.signals.length; i++) {
          const sig = ind.signals[i];
          if (!sig || sig.signal === 'NEUTRAL') continue;
          const d = this.data[i];
          const x = xOf(i);
          const isBuy = sig.signal === 'BUY';
          const arrowY = isBuy ? yOf(d.low) + 16 : yOf(d.high) - 16;
          ctx.fillStyle = isBuy ? C.up : C.dn;
          ctx.textBaseline = 'middle';
          ctx.fillText(isBuy ? '▲' : '▼', x, arrowY);
          if (sig.label) {
            ctx.font = '8px monospace';
            ctx.fillText(sig.label, x, arrowY + (isBuy ? 11 : -11));
            ctx.font = 'bold 13px monospace';
          }
        }
      }
    });

    ctx.restore();
  }

  /* ── Pan / zoom / chart-type ──────────────────────────── */
  _setupPanEvents() {
    const body=this.panel.querySelector('.chart-body');
    let dragging=false,dragX=0,vsD=0,veD=0;
    body.addEventListener('mousedown',e=>{ if(this.currentTool) return; dragging=true;dragX=e.clientX;vsD=this.viewStart;veD=this.viewEnd; });
    body.addEventListener('mousemove',e=>{
      this.mX=e.offsetX;this.mY=e.offsetY;
      if(!this.currentTool) this._drawOverlay();
      if(!dragging||!this.data.length) return;
      const vis=veD-vsD;
      const delta=(e.clientX-dragX)/this.canvas.clientWidth*vis;
      let ns=vsD-delta,ne=veD-delta;
      [ns,ne]=this._clampView(ns,ne,this.data.length);
      this.viewStart=ns;this.viewEnd=ne;this.draw();
    });
    body.addEventListener('mouseup',()=>{dragging=false;});
    body.addEventListener('mouseleave',()=>{dragging=false;this.mX=-1;this.mY=-1;this.tip.style.display='none';});
    body.addEventListener('wheel',e=>{
      e.preventDefault(); if(!this.data.length) return;
      const vis=this.viewEnd-this.viewStart;
      const factor=e.deltaY>0?1.13:0.88;
      const newVis=Math.max(10,Math.min(300,vis*factor));
      const rect=this.canvas.getBoundingClientRect();
      const mRatio=(e.clientX-rect.left)/this.canvas.clientWidth;
      const mid=this.viewStart+vis*mRatio;
      this.viewStart=mid-newVis*mRatio;this.viewEnd=this.viewStart+newVis;
      [this.viewStart,this.viewEnd]=this._clampView(this.viewStart,this.viewEnd,this.data.length);
      this.draw();
    },{passive:false});
    this.panel.querySelectorAll('[data-chart-type]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        this.panel.querySelectorAll('[data-chart-type]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const t=btn.dataset.chartType;
        this.chartType=t==='heat'?'heatmap':t;
        this.draw();
      });
    });
  }

  resize() {
    const dpr=window.devicePixelRatio||1;
    const w=this.panel.clientWidth,h=this.panel.clientHeight;
    this.canvas.width=w*dpr;this.canvas.height=h*dpr;
    this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
    if(this.data.length) this.draw();
  }

  draw() {
    const W=this.canvas.clientWidth,H=this.canvas.clientHeight;
    const dpr=window.devicePixelRatio||1,ctx=this.ctx;
    ctx.save();ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);

    const slice=this.data.slice(Math.floor(this.viewStart),Math.ceil(this.viewEnd));
    if(!slice.length){ctx.restore();return;}

    const vis=this.viewEnd-this.viewStart;
    const AP=50,candW=(W-AP)/vis,bodyW=Math.max(1,candW*0.6);

    let lo=Infinity,hi=-Infinity;
    slice.forEach(d=>{lo=Math.min(lo,d.low);hi=Math.max(hi,d.high);});
    const rng=hi-lo||1; lo-=rng*0.05; hi+=rng*0.05;
    this.lo=lo; this.hi=hi;

    /* Price grid */
    ctx.fillStyle=C.text2;ctx.font='12px monospace';ctx.textAlign='right';ctx.textBaseline='middle';
    for(let i=0;i<=5;i++){
      const y=10+(H-30)*(i/5),p=hi-(hi-lo)*(i/5);
      ctx.fillText(p.toFixed(2),AP-5,y);
      ctx.strokeStyle=C.grid;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(AP,y);ctx.lineTo(W,y);ctx.stroke();
    }
    /* Time axis */
    ctx.textAlign='center';ctx.textBaseline='top';
    const nxt=Math.min(slice.length,10);
    for(let i=0;i<=nxt;i++){
      const idx=Math.floor(i*(slice.length-1)/Math.max(nxt,1));
      if(!slice[idx]) continue;
      const x=AP+(idx-0.5)*((W-AP)/vis);
      const dt=new Date(slice[idx].time);
      const lbl=`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      ctx.fillStyle=C.text2;ctx.fillText(lbl,x,H-20);
      ctx.strokeStyle=C.grid;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,H-30);ctx.stroke();
    }

    /* ── Chart types ── */
    if(this.chartType==='line'){
      ctx.beginPath();ctx.strokeStyle=C.line;ctx.lineWidth=1.5;
      slice.forEach((d,i)=>{
        const x=AP+(i-0.5)*((W-AP)/vis),y=this.priceY(d.close,lo,hi,H);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.stroke();
    } else if(this.chartType==='heatmap'){
      const hexRgb=hex=>{const h=hex.replace('#','');return h.length===3?h.split('').map(c=>parseInt(c+c,16)):[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
      const [ur,ug,ub]=hexRgb(C.up),[dr,dg,db]=hexRgb(C.dn);
      const maxVol=slice.reduce((m,d)=>Math.max(m,d.volume),0)||1;
      slice.forEach((d,i)=>{
        const x=AP+(i-0.5)*((W-AP)/vis);
        const yO=this.priceY(d.open,lo,hi,H),yC=this.priceY(d.close,lo,hi,H);
        const yCenter=(yO+yC)/2;
        const vi=Math.pow(d.volume/maxVol,0.5),radius=candW*2+vi*candW*4;
        const g=ctx.createRadialGradient(x,yCenter,0,x,yCenter,radius);
        const a=0.55+vi*0.35;
        const [r,gv,b]=d.close>=d.open?[ur,ug,ub]:[dr,dg,db];
        g.addColorStop(0,`rgba(${r},${gv},${b},${a.toFixed(2)})`);
        g.addColorStop(0.5,`rgba(${r},${gv},${b},${(a*0.45).toFixed(2)})`);
        g.addColorStop(1,`rgba(${r},${gv},${b},0)`);
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,yCenter,radius,0,Math.PI*2);ctx.fill();
      });
    } else {
      slice.forEach((d,i)=>{
        const x=AP+(i-0.5)*((W-AP)/vis);
        const yO=this.priceY(d.open,lo,hi,H),yH=this.priceY(d.high,lo,hi,H);
        const yL=this.priceY(d.low,lo,hi,H),yC=this.priceY(d.close,lo,hi,H);
        const clr=d.close>=d.open?C.up:C.dn;
        ctx.strokeStyle=clr;ctx.lineWidth=Math.max(0.5,candW*0.08);
        ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,Math.min(yO,yC));ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,Math.max(yO,yC));ctx.lineTo(x,yL);ctx.stroke();
        ctx.fillStyle=clr;
        ctx.fillRect(x-bodyW/2,Math.min(yO,yC),bodyW,Math.max(1,Math.abs(yC-yO)));
      });
    }

    /* Indicator overlays (above candles, under drawing tools) */
    this._drawIndicatorOverlays();
    this._drawTools();
    ctx.restore();

    /* Live price line */
    if(this.liveCandle||this.data.length){
      const last=this.liveCandle||this.data[this.data.length-1];
      const y=this.priceY(last.close,this.lo,this.hi,H);
      ctx.save();
      ctx.strokeStyle='#4da6ff';ctx.lineWidth=1;ctx.setLineDash([5,5]);
      ctx.beginPath();ctx.moveTo(50,y);ctx.lineTo(W,y);ctx.stroke();
      ctx.setLineDash([]);
      ctx.font='12px monospace';
      const txt=last.close.toFixed(2);
      const bw=ctx.measureText(txt).width+12,bh=16;
      let by=y-bh/2; if(by<2) by=2; if(by+bh>H-2) by=H-bh-2;
      ctx.fillStyle='#4da6ff';ctx.fillRect(2,by,bw,bh);
      ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(txt,8,by+bh/2);
      ctx.restore();
    }

    /* Indicator status badge */
    const activeInds = this.indicators.filter(ind=>ind.enabled && ind.code.trim());
    if(activeInds.length) {
      ctx.save();
      ctx.font='9px monospace';
      const hasErr = activeInds.some(ind=>ind.error);
      ctx.fillStyle = hasErr ? '#ef5350' : '#ffb300';
      ctx.textAlign='right';ctx.textBaseline='top';
      ctx.fillText(hasErr ? `⚡ERR` : `⚡${activeInds.length}`, W-4, 4);
      ctx.restore();
    }
  }

  _drawOverlay() {
    if(this.mX<0||!this.data.length){this.tip.style.display='none';return;}
    const vis=this.viewEnd-this.viewStart;
    const idx=Math.round(this.viewStart+(this.mX/this.canvas.clientWidth)*vis);
    if(idx>=0&&idx<this.data.length){
      const d=this.data[idx];
      const chg=d.close-d.open,pct=((chg/d.open)*100).toFixed(2);
      this.tip.innerHTML=`
        <div class="tr"><span class="tl">O</span><span class="tv">${d.open.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">H</span><span class="tv">${d.high.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">L</span><span class="tv">${d.low.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">C</span><span class="tv">${d.close.toFixed(2)}</span></div>
        <div class="tr"><span class="tl">CHG</span><span class="tv ${chg>=0?'up':'dn'}">${chg>=0?'+':''}${chg.toFixed(2)} (${pct}%)</span></div>`;
      this.tip.style.display='block';
      this.tip.style.left=Math.min(this.mX+10,this.canvas.clientWidth-150)+'px';
      this.tip.style.top=Math.max(10,this.mY-60)+'px';
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   Indicator Editor Modal — v2.0 (Multi-indicator + full ref)
   ═══════════════════════════════════════════════════════════ */
let _activeEditorChart = null;
let _activeIndicatorId = null;

/* Inject enhanced indicator modal CSS */
const _indCSS = document.createElement('style');
_indCSS.textContent = `
/* ── Indicator Modal v2 ── */
#indicator-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.8);
  z-index:3000; align-items:flex-start; justify-content:center; padding-top:30px; }
#indicator-modal.active { display:flex; }

.ind-panel { background:var(--tw-bar); border:1px solid var(--tw-bar-border); border-radius:8px;
  width:96%; max-width:900px; max-height:90vh; display:flex; flex-direction:column;
  box-shadow:0 24px 64px rgba(0,0,0,.9); overflow:hidden; }

.ind-header { padding:10px 16px; border-bottom:1px solid var(--tw-border);
  display:flex; align-items:center; gap:10px; flex-shrink:0; }
.ind-title { font-size:12px; font-weight:600; color:var(--tw-text1); }
.ind-chart-label { font-size:10px; color:var(--tw-accent); background:var(--tw-accentd);
  padding:2px 8px; border-radius:10px; }
.ind-close-x { margin-left:auto; width:22px; height:22px; display:flex; align-items:center;
  justify-content:center; border-radius:4px; cursor:pointer; color:var(--tw-text3);
  transition:background .1s,color .1s; font-size:11px; }
.ind-close-x:hover { background:var(--tw-bg3); color:var(--tw-text1); }

.ind-body { display:flex; flex:1; min-height:0; overflow:hidden; }

/* Sidebar */
.ind-sidebar { width:220px; flex-shrink:0; border-right:1px solid var(--tw-border);
  display:flex; flex-direction:column; overflow:hidden; }
.ind-sidebar-section { padding:8px 12px 4px; display:flex; align-items:center; justify-content:space-between; }
.ind-sidebar-title { font-size:9px; font-weight:600; letter-spacing:.8px;
  color:var(--tw-text3); text-transform:uppercase; }
.ind-add-btn { background:var(--tw-accentd); border:1px solid var(--tw-accent);
  color:var(--tw-accent); font-family:'JetBrains Mono',monospace; font-size:10px;
  font-weight:700; padding:2px 8px; border-radius:3px; cursor:pointer;
  transition:all .15s; line-height:1.4; }
.ind-add-btn:hover { background:var(--tw-accent); color:#000; }

.ind-stack { flex:1; overflow-y:auto; border-bottom:1px solid var(--tw-border); }
.ind-stack-item { padding:7px 12px; font-size:10px; color:var(--tw-text2);
  cursor:pointer; border-left:2px solid transparent; transition:all .1s;
  display:flex; align-items:center; gap:6px; }
.ind-stack-item:hover { background:var(--tw-bg3); color:var(--tw-text1); border-left-color:var(--tw-border2); }
.ind-stack-item.active { background:var(--tw-accentd); color:var(--tw-accent); border-left-color:var(--tw-accent); }
.ind-stack-item.has-error { border-left-color:#ef5350; }
.ind-stack-name { flex:1; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ind-stack-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.ind-stack-del { opacity:0; font-size:10px; cursor:pointer; color:var(--tw-text3);
  transition:opacity .1s,color .1s; flex-shrink:0; padding:0 2px; }
.ind-stack-item:hover .ind-stack-del { opacity:1; }
.ind-stack-del:hover { color:#ef5350; }
.ind-empty-hint { padding:16px 12px; font-size:9px; color:var(--tw-text3);
  text-align:center; line-height:1.7; }

/* Presets */
.ind-sidebar-presets { padding:0; }
.ind-preset-section { padding:6px 12px 4px; font-size:9px; font-weight:600;
  letter-spacing:.8px; color:var(--tw-text3); text-transform:uppercase; }
.ind-preset-item { padding:5px 12px; font-size:10px; color:var(--tw-text2);
  cursor:pointer; border-left:2px solid transparent; transition:all .1s;
  display:flex; flex-direction:column; gap:1px; }
.ind-preset-item:hover { background:var(--tw-bg3); color:var(--tw-text1); border-left-color:var(--tw-accent); }
.ind-preset-name { font-weight:500; }
.ind-preset-desc { font-size:9px; color:var(--tw-text3); }

/* Editor pane */
.ind-editor-pane { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }
.ind-editor-toolbar { padding:7px 12px; border-bottom:1px solid var(--tw-border);
  display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
.ind-name-input { background:var(--tw-bg2); border:1px solid var(--tw-border);
  color:var(--tw-text1); font-family:'JetBrains Mono',monospace; font-size:10px;
  padding:3px 8px; border-radius:3px; outline:none; transition:border-color .15s; min-width:120px; }
.ind-name-input:focus { border-color:var(--tw-accent); }
.ind-toggle-label { font-size:10px; color:var(--tw-text2); display:flex; align-items:center;
  gap:5px; cursor:pointer; user-select:none; }
.ind-toggle { width:28px; height:15px; background:var(--tw-bg3); border-radius:8px;
  position:relative; transition:background .2s; cursor:pointer; appearance:none;
  -webkit-appearance:none; border:1px solid var(--tw-border2); flex-shrink:0; }
.ind-toggle:checked { background:var(--tw-accent); }
.ind-toggle::after { content:''; position:absolute; top:2px; left:2px; width:9px; height:9px;
  border-radius:50%; background:#fff; transition:left .2s; }
.ind-toggle:checked::after { left:15px; }
.ind-status { font-size:9px; color:var(--tw-up); margin-left:auto; }
.ind-ref-link { font-size:9px; color:var(--tw-text3); cursor:pointer; }
.ind-ref-link:hover { color:var(--tw-text2); }

.ind-select-hint { flex:1; display:flex; align-items:center; justify-content:center;
  flex-direction:column; gap:10px; color:var(--tw-text3); font-size:11px; }
.ind-select-hint-icon { font-size:28px; opacity:.4; }

.ind-code-wrap { flex:1; position:relative; overflow:hidden; }
.ind-code-editor { width:100%; height:100%; background:var(--tw-bg0); color:var(--tw-text1);
  font-family:'JetBrains Mono',monospace; font-size:11px; border:none; outline:none;
  resize:none; padding:12px; line-height:1.75; tab-size:2; }

/* Reference panel */
.ind-ref-panel { background:var(--tw-bg2); border-top:1px solid var(--tw-border);
  padding:0; flex-shrink:0; display:none; max-height:260px; overflow-y:auto; }
.ind-ref-panel.open { display:block; }
.ind-ref-tabs { display:flex; border-bottom:1px solid var(--tw-border); }
.ind-ref-tab { padding:6px 14px; font-size:9px; font-weight:600; letter-spacing:.5px;
  color:var(--tw-text3); cursor:pointer; border-bottom:2px solid transparent;
  transition:all .1s; text-transform:uppercase; }
.ind-ref-tab.active { color:var(--tw-accent); border-bottom-color:var(--tw-accent); }
.ind-ref-body { padding:10px 14px; display:none; }
.ind-ref-body.active { display:block; }
.ind-ref-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:4px 20px; }
.ind-ref-row { font-size:9px; color:var(--tw-text3); line-height:2; }
.ind-ref-row code { color:var(--tw-accent); background:var(--tw-bg3); padding:0 4px; border-radius:2px; }
.ind-ref-example { background:var(--tw-bg1); border:1px solid var(--tw-border);
  border-radius:4px; padding:10px 12px; font-size:10px; color:var(--tw-text2);
  font-family:'JetBrains Mono',monospace; line-height:1.8; white-space:pre; overflow-x:auto; }
.ind-ref-example-title { font-size:9px; font-weight:600; color:var(--tw-text3);
  letter-spacing:.6px; text-transform:uppercase; margin-bottom:6px; }
.ind-ref-examples { display:flex; flex-direction:column; gap:12px; }

/* Footer */
.ind-footer { padding:9px 12px; border-top:1px solid var(--tw-border);
  display:flex; align-items:center; gap:8px; flex-shrink:0; background:var(--tw-bar); }
.ind-error-bar { flex:1; font-size:9px; color:#ef5350; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.btn-primary { background:var(--tw-accent); color:#000; font-family:'JetBrains Mono',monospace;
  font-size:10px; font-weight:600; padding:5px 14px; border:none; border-radius:4px;
  cursor:pointer; transition:opacity .15s; }
.btn-primary:hover { opacity:.85; }
.btn-secondary { background:var(--tw-bg3); color:var(--tw-text2); font-family:'JetBrains Mono',monospace;
  font-size:10px; padding:5px 14px; border:1px solid var(--tw-border); border-radius:4px;
  cursor:pointer; transition:all .15s; }
.btn-secondary:hover { background:var(--tw-bg4); color:var(--tw-text1); border-color:var(--tw-text3); }
`;
document.head.appendChild(_indCSS);

/* Replace indicator modal HTML */
document.addEventListener('DOMContentLoaded', () => {
  const existing = document.getElementById('indicator-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'indicator-modal';
  modal.innerHTML = `
  <div class="ind-panel">
    <div class="ind-header">
      <span class="ind-title">⚡ Indicator Editor</span>
      <span class="ind-chart-label" id="ind-chart-label">Chart 1</span>
      <div class="ind-close-x" id="ind-close-btn">✕</div>
    </div>
    <div class="ind-body">

      <!-- Left sidebar: stack + presets -->
      <div class="ind-sidebar">
        <div class="ind-sidebar-section">
          <span class="ind-sidebar-title">Active</span>
          <button class="ind-add-btn" id="ind-add-btn">+ Add</button>
        </div>
        <div class="ind-stack" id="ind-stack">
          <div class="ind-empty-hint">No indicators yet.<br>Click <b>+ Add</b> or pick<br>a preset below.</div>
        </div>
        <div class="ind-sidebar-presets">
          <div class="ind-preset-section">Presets</div>
          <div id="ind-preset-list"></div>
        </div>
      </div>

      <!-- Right: editor -->
      <div class="ind-editor-pane" id="ind-editor-pane">
        <div class="ind-select-hint" id="ind-select-hint">
          <div class="ind-select-hint-icon">⚡</div>
          <div>Select an indicator or add one</div>
        </div>

        <div id="ind-editor-inner" style="display:none;flex:1;flex-direction:column;overflow:hidden;display:none">
          <div class="ind-editor-toolbar">
            <input class="ind-name-input" id="ind-name-input" placeholder="Indicator name…" value="My Indicator">
            <label class="ind-toggle-label">
              <input type="checkbox" class="ind-toggle" id="ind-enabled-toggle" checked>
              Active
            </label>
            <span class="ind-status" id="ind-status">✓ Ready</span>
            <span class="ind-ref-link" id="ind-ref-toggle">📖 Reference</span>
          </div>
          <div class="ind-code-wrap">
            <textarea class="ind-code-editor" id="ind-code-editor" spellcheck="false"
              placeholder="// Write your indicator here…
// Use sma(n), ema(n), rsi(n), bb(n,mult), macd(f,s,sig), vwap(), atr(n), stoch(k,d)
// Set signal = 'BUY' | 'SELL' | 'NEUTRAL'
// Optionally: label = 'text shown on arrow'"></textarea>
          </div>
          <div class="ind-ref-panel" id="ind-ref-panel">
            <div class="ind-ref-tabs">
              <div class="ind-ref-tab active" data-ref-tab="vars">Variables</div>
              <div class="ind-ref-tab" data-ref-tab="funcs">Functions</div>
              <div class="ind-ref-tab" data-ref-tab="examples">Examples</div>
            </div>
            <div class="ind-ref-body active" data-ref-body="vars">
              <div class="ind-ref-grid">
                <div class="ind-ref-row"><code>close</code> current bar close price</div>
                <div class="ind-ref-row"><code>open</code> current bar open price</div>
                <div class="ind-ref-row"><code>high</code> current bar high</div>
                <div class="ind-ref-row"><code>low</code> current bar low</div>
                <div class="ind-ref-row"><code>volume</code> current bar volume</div>
                <div class="ind-ref-row"><code>prevClose</code> previous bar close</div>
                <div class="ind-ref-row"><code>i</code> bar index (0 = first bar)</div>
                <div class="ind-ref-row"><code>signal = 'BUY'</code> → green ▲ arrow on chart</div>
                <div class="ind-ref-row"><code>signal = 'SELL'</code> → red ▼ arrow on chart</div>
                <div class="ind-ref-row"><code>signal = 'NEUTRAL'</code> → no arrow (default)</div>
                <div class="ind-ref-row"><code>label = 'RSI 32'</code> text under/above arrow</div>
              </div>
            </div>
            <div class="ind-ref-body" data-ref-body="funcs">
              <div class="ind-ref-grid">
                <div class="ind-ref-row"><code>sma(period)</code> → number | null — draws a line on chart</div>
                <div class="ind-ref-row"><code>sma(period, i)</code> → value at bar index i</div>
                <div class="ind-ref-row"><code>ema(period)</code> → number | null — dashed line on chart</div>
                <div class="ind-ref-row"><code>ema(period, i)</code> → value at bar index i</div>
                <div class="ind-ref-row"><code>rsi(period)</code> → 0–100 | null</div>
                <div class="ind-ref-row"><code>bb(period, mult)</code> → {upper, mid, lower} — draws BB bands</div>
                <div class="ind-ref-row"><code>macd(fast, slow, sig)</code> → {macd, signal, histogram}</div>
                <div class="ind-ref-row"><code>macd(f, s, sig, i)</code> → values at bar i</div>
                <div class="ind-ref-row"><code>vwap()</code> → number — draws VWAP line on chart</div>
                <div class="ind-ref-row"><code>vwap(i)</code> → VWAP at bar i</div>
                <div class="ind-ref-row"><code>atr(period)</code> → number | null</div>
                <div class="ind-ref-row"><code>stoch(k, d)</code> → {k, d} — stochastic %K and %D</div>
                <div class="ind-ref-row"><code>stoch(k, d, i)</code> → values at bar i</div>
              </div>
            </div>
            <div class="ind-ref-body" data-ref-body="examples">
              <div class="ind-ref-examples">
                <div>
                  <div class="ind-ref-example-title">Price crosses above SMA20</div>
                  <div class="ind-ref-example">const avg = sma(20);
if (avg && prevClose < avg && close > avg) {
  signal = 'BUY';
  label = 'X↑';
}</div>
                </div>
                <div>
                  <div class="ind-ref-example-title">RSI oversold bounce</div>
                  <div class="ind-ref-example">const r = rsi(14);
if (r !== null && r < 30) {
  signal = 'BUY';
  label = 'RSI ' + r.toFixed(0);
} else if (r !== null && r > 70) {
  signal = 'SELL';
  label = 'RSI ' + r.toFixed(0);
}</div>
                </div>
                <div>
                  <div class="ind-ref-example-title">Two SMA crossover with previous bar comparison</div>
                  <div class="ind-ref-example">const fast = sma(10), slow = sma(30);
if (i === 0 || fast === null || slow === null) return;
const pf = sma(10, i - 1), ps = sma(30, i - 1);
if (pf <= ps && fast > slow) { signal = 'BUY';  label = '↑X'; }
if (pf >= ps && fast < slow) { signal = 'SELL'; label = '↓X'; }</div>
                </div>
                <div>
                  <div class="ind-ref-example-title">Bollinger Band squeeze breakout (auto-draws bands)</div>
                  <div class="ind-ref-example">const b = bb(20, 2);
if (b.upper === null) return;
if (close > b.upper) { signal = 'BUY';  label = 'BB↑'; }
if (close < b.lower) { signal = 'SELL'; label = 'BB↓'; }</div>
                </div>
                <div>
                  <div class="ind-ref-example-title">VWAP cross (auto-draws VWAP line)</div>
                  <div class="ind-ref-example">const v = vwap();
if (!prevClose || i === 0) return;
const pv = vwap(i - 1);
if (prevClose < pv && close > v) { signal = 'BUY';  label = 'VWAP↑'; }
if (prevClose > pv && close < v) { signal = 'SELL'; label = 'VWAP↓'; }</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="ind-footer">
      <div class="ind-error-bar" id="ind-error-bar"></div>
      <button class="btn-secondary" id="ind-clear-btn">Clear Code</button>
      <button class="btn-primary" id="ind-apply-btn">Apply ⚡</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  /* Wire up reference tabs */
  modal.querySelectorAll('.ind-ref-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.ind-ref-tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.ind-ref-body').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector(`[data-ref-body="${tab.dataset.refTab}"]`)?.classList.add('active');
    });
  });

  /* Ref panel toggle */
  modal.querySelector('#ind-ref-toggle')?.addEventListener('click', () => {
    modal.querySelector('#ind-ref-panel')?.classList.toggle('open');
  });

  /* Close */
  modal.querySelector('#ind-close-btn')?.addEventListener('click', closeIndicatorEditor);

  /* + Add button */
  modal.querySelector('#ind-add-btn')?.addEventListener('click', () => {
    if (!_activeEditorChart) return;
    const ind = _activeEditorChart.addIndicator('', 'New Indicator', false);
    _refreshStack();
    _selectIndicator(ind.id);
  });

  /* Apply */
  modal.querySelector('#ind-apply-btn')?.addEventListener('click', applyIndicator);

  /* Clear code */
  modal.querySelector('#ind-clear-btn')?.addEventListener('click', () => {
    const ed = modal.querySelector('#ind-code-editor');
    if (ed) ed.value = '';
  });

  /* Populate presets */
  setTimeout(() => {
    if (!window.IndicatorEngine) return;
    const list = modal.querySelector('#ind-preset-list');
    if (!list) return;
    Object.entries(IndicatorEngine.getPresets()).forEach(([id, p]) => {
      const item = document.createElement('div');
      item.className = 'ind-preset-item';
      item.innerHTML = `<div class="ind-preset-name">${p.name}</div><div class="ind-preset-desc">${p.description}</div>`;
      item.addEventListener('click', () => {
        if (!_activeEditorChart) return;
        const ind = _activeEditorChart.addIndicator(p.code, p.name, true);
        _refreshStack();
        _selectIndicator(ind.id);
      });
      list.appendChild(item);
    });
  }, 300);
});

function _refreshStack() {
  const modal = document.getElementById('indicator-modal');
  if (!modal || !_activeEditorChart) return;
  const stack = modal.querySelector('#ind-stack');
  if (!stack) return;

  const inds = _activeEditorChart.indicators;
  if (!inds.length) {
    stack.innerHTML = '<div class="ind-empty-hint">No indicators yet.<br>Click <b>+ Add</b> or pick<br>a preset below.</div>';
    return;
  }

  stack.innerHTML = '';
  inds.forEach((ind, ci) => {
    const col = OVERLAY_COLORS[ci % OVERLAY_COLORS.length];
    const item = document.createElement('div');
    item.className = 'ind-stack-item' + (ind.id === _activeIndicatorId ? ' active' : '') + (ind.error ? ' has-error' : '');
    item.dataset.indId = ind.id;
    item.innerHTML = `
      <span class="ind-stack-dot" style="background:${ind.enabled ? (ind.error ? '#ef5350' : col) : 'var(--tw-text3)'}"></span>
      <span class="ind-stack-name">${ind.name || 'Indicator'}</span>
      <span class="ind-stack-del" title="Remove" data-del="${ind.id}">✕</span>`;
    item.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      _selectIndicator(ind.id);
    });
    item.querySelector('[data-del]')?.addEventListener('click', e => {
      e.stopPropagation();
      _activeEditorChart.removeIndicator(ind.id);
      if (_activeIndicatorId === ind.id) { _activeIndicatorId = null; _showEditorPane(false); }
      _refreshStack();
    });
    stack.appendChild(item);
  });
}

function _selectIndicator(id) {
  _activeIndicatorId = id;
  const modal = document.getElementById('indicator-modal');
  if (!modal || !_activeEditorChart) return;
  const ind = _activeEditorChart.indicators.find(x => x.id === id);
  if (!ind) return;

  _showEditorPane(true);
  modal.querySelector('#ind-name-input').value = ind.name || '';
  modal.querySelector('#ind-enabled-toggle').checked = ind.enabled;
  modal.querySelector('#ind-code-editor').value = ind.code || '';
  _updateEditorStatus(ind.error);
  _refreshStack();
}

function _showEditorPane(show) {
  const modal = document.getElementById('indicator-modal');
  if (!modal) return;
  modal.querySelector('#ind-select-hint').style.display = show ? 'none' : 'flex';
  const inner = modal.querySelector('#ind-editor-inner');
  if (inner) inner.style.display = show ? 'flex' : 'none';
}

function openIndicatorEditor(chart) {
  _activeEditorChart = chart;
  _activeIndicatorId = null;
  const modal = document.getElementById('indicator-modal');
  if (!modal) return;
  const chartLabel = modal.querySelector('#ind-chart-label');
  if (chartLabel) chartLabel.textContent = `Chart ${chart.id + 1} — ${chart.symbol || 'Empty'}`;
  _showEditorPane(false);
  _refreshStack();
  modal.classList.add('active');
}

function closeIndicatorEditor() {
  document.getElementById('indicator-modal')?.classList.remove('active');
  _activeEditorChart = null;
  _activeIndicatorId = null;
}

function _updateEditorStatus(err) {
  const modal = document.getElementById('indicator-modal');
  if (!modal) return;
  const el = modal.querySelector('#ind-status');
  const eb = modal.querySelector('#ind-error-bar');
  if (el) { if(err){el.textContent='⚠ Error';el.style.color='#ef5350';}else{el.textContent='✓ Ready';el.style.color='#26a69a';} }
  if (eb) eb.textContent = err || '';
}

function applyIndicator() {
  if (!_activeEditorChart || !_activeIndicatorId) return;
  const modal = document.getElementById('indicator-modal');
  if (!modal) return;
  const code    = modal.querySelector('#ind-code-editor')?.value || '';
  const enabled = modal.querySelector('#ind-enabled-toggle')?.checked ?? false;
  const name    = modal.querySelector('#ind-name-input')?.value || 'Indicator';
  _activeEditorChart.updateIndicator(_activeIndicatorId, code, enabled, name);
  const ind = _activeEditorChart.indicators.find(x => x.id === _activeIndicatorId);
  _updateEditorStatus(ind?.error || null);
  _refreshStack();
}

/* ═══ APP STATE ═══ */
const charts = [];
let symbols = [], currentLayout = '2x2', lastUsedSymbols = [];

function saveState() {
  try {
    const s={version:'2.6',timestamp:Date.now(),layout:currentLayout,lastUsedSymbols,theme:ThemeManager.getCurrent(),charts:charts.map(c=>c.exportState())};
    localStorage.setItem('tixwatcher_state',enc(JSON.stringify(s)));
    const sb=document.getElementById('sb-status');
    if(sb){sb.textContent='Saved';setTimeout(()=>sb.textContent='Ready',2000);}
  } catch(e){console.error('Save failed',e);}
}

function loadState() {
  try {
    const d=dec(localStorage.getItem('tixwatcher_state'));
    if(!d) return false;
    const s=JSON.parse(d);
    if(!['2.1','2.2','2.3','2.4','2.5','2.6'].includes(s.version)) return false;
    if(s.layout){currentLayout=s.layout;applyLayout(currentLayout);}
    if(s.lastUsedSymbols) lastUsedSymbols=s.lastUsedSymbols;
    if(s.theme) ThemeManager.applyTheme(s.theme,true);
    if(s.charts)(async()=>{for(let i=0;i<s.charts.length;i++) if(i<charts.length) await charts[i].importState(s.charts[i]);})();
    return true;
  } catch {return false;}
}

function applyLayout(layout) {
  const main=document.getElementById('main'); let vis=[];
  if(layout==='1x1'){main.style.gridTemplateColumns='1fr';main.style.gridTemplateRows='1fr';vis=[0];}
  else if(layout==='1x2'){main.style.gridTemplateColumns='1fr 1fr';main.style.gridTemplateRows='1fr';vis=[0,1];}
  else{main.style.gridTemplateColumns='1fr 1fr';main.style.gridTemplateRows='1fr 1fr';vis=charts.map((_,i)=>i);}
  charts.forEach((c,i)=>{
    c.panel.style.display=vis.includes(i)?'flex':'none';
    if(vis.includes(i)){c.resize();c.draw();}
  });
}

function exportToFile() {
  const s={version:'2.6',timestamp:Date.now(),layout:currentLayout,lastUsedSymbols,theme:ThemeManager.getCurrent(),charts:charts.map(c=>c.exportState())};
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([enc(JSON.stringify(s))],{type:'text/plain'})),download:`tixwatcher_${Date.now()}.twl`});
  a.click();URL.revokeObjectURL(a.href);
}

function importFromFile() {
  const inp=Object.assign(document.createElement('input'),{type:'file',accept:'.twl'});
  inp.onchange=e=>{
    const f=e.target.files[0];if(!f) return;
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const s=JSON.parse(dec(ev.target.result));
        if(!['2.1','2.2','2.3','2.4','2.5','2.6'].includes(s.version)) throw new Error('Incompatible version');
        if(s.layout){currentLayout=s.layout;applyLayout(currentLayout);}
        if(s.lastUsedSymbols) lastUsedSymbols=s.lastUsedSymbols;
        if(s.theme) ThemeManager.applyTheme(s.theme);
        if(s.charts) for(let i=0;i<s.charts.length;i++) if(i<charts.length) await charts[i].importState(s.charts[i]);
      }catch(err){alert('Import failed: '+err.message);}
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ═══ INIT ═══ */
async function init() {
  ThemeManager.applyTheme('terminal',true);
  const sb=document.getElementById('sb-status');
  if(sb) sb.textContent='Refreshing market data…';

  try   {symbols=await DataProvider.getSymbols();}
  catch {symbols=DataProvider.SYMBOLS.map(s=>({symbol:s,name:s}));}

  await DataProvider.bootRefresh(symbols.map(s=>s.symbol||s));
  if(sb) sb.textContent='Ready';

  document.querySelectorAll('[data-panel]').forEach((el,i)=>{
    const chart = new ChartPanel(el,i);
    charts.push(chart);
    window.charts = charts;
    const sel=el.querySelector('[data-symbol-select]');
    if(!sel) return;
    symbols.forEach(s=>{const o=document.createElement('option');o.value=o.text=s.symbol||s;sel.appendChild(o);});
    sel.value=symbols[i]?.symbol||symbols[0]?.symbol;
    sel.addEventListener('change',()=>chart.loadSymbol(sel.value));
  });

  if(!loadState()){
    charts.forEach(c=>{const sel=c.panel.querySelector('[data-symbol-select]');if(sel) c.loadSymbol(sel.value);});
  }

  new ResizeObserver(()=>charts.forEach(c=>c.resize())).observe(document.getElementById('main'));
  setInterval(()=>{const el=document.getElementById('sb-time');if(el) el.textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});},1000);
}

/* ═══ MENU ═══ */
document.querySelectorAll('.menu-item').forEach(item=>{
  item.addEventListener('click',e=>{
    e.stopPropagation();
    const was=item.classList.contains('active');
    document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
    if(!was) item.classList.add('active');
  });
});
document.addEventListener('click',()=>document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active')));

document.querySelectorAll('.menu-opt').forEach(opt=>{
  opt.addEventListener('click',e=>{
    e.stopPropagation();
    const act=opt.dataset.action,main=document.getElementById('main');let vis=[];
    if(act==='inspect')         openInspector();
    else if(act==='export')     exportToFile();
    else if(act==='import')     importFromFile();
    else if(act==='layout-1x1'){currentLayout='1x1';main.style.gridTemplateColumns='1fr';main.style.gridTemplateRows='1fr';vis=[0];saveState();}
    else if(act==='layout-1x2'){currentLayout='1x2';main.style.gridTemplateColumns='1fr 1fr';main.style.gridTemplateRows='1fr';vis=[0,1];saveState();}
    else if(act==='layout-2x2'){currentLayout='2x2';main.style.gridTemplateColumns='1fr 1fr';main.style.gridTemplateRows='1fr 1fr';vis=charts.map((_,i)=>i);saveState();}
    else if(act==='sync-charts'){const anyOff=charts.some(c=>!c.synced);charts.forEach(c=>c.synced=anyOff);if(anyOff){const sym=charts[0].symbol;charts.forEach(c=>{if(c!==charts[0])c.loadSymbol(sym);});}charts.forEach(c=>c.panel.style.border=c.synced?'2px solid var(--tw-accent)':'2px solid #333');}
    else if(act==='reset-zoom') charts.forEach(c=>{c._defaultView();c.draw();});
    else if(act==='settings')   openSettings();
    else if(act==='screenshot') alert('Screenshot: use OS shortcut (Win+Shift+S / Cmd+Shift+4)');
    if(vis.length){charts.forEach((c,i)=>{const show=vis.includes(i);c.panel.style.display=show?'flex':'none';if(show){c.resize();if(!c.data.length){const sel=c.panel.querySelector('[data-symbol-select]');if(sel)c.loadSymbol(sel.value);}}});}
    document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
  });
});

function isIndianMarketOpen(){
  const now=new Date(),ist=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const day=ist.getDay();if(day===0||day===6) return false;
  const cur=ist.getHours()*60+ist.getMinutes();
  return cur>=(9*60+15)&&cur<=(15*60+30);
}

/* ═══ INSPECTOR ═══ */
function openInspector(){
  const grid=document.getElementById('inspector-grid');if(!grid) return;
  grid.innerHTML='';
  charts.forEach((c,i)=>{
    const card=document.createElement('div');card.className='chart-card';
    const indCount = c.indicators.filter(x=>x.enabled).length;
    card.innerHTML=`<div class="card-sym">Chart ${i+1}: ${c.symbol||'Empty'}</div><div class="card-info">Type: ${c.chartType} | Bars: ${c.data.length}</div><div class="card-info">Tools: ${c.tools.length} | Indicators: ${indCount > 0 ? '⚡ ' + indCount + ' active' : 'none'}</div><div class="card-preview">${c.chartType==='candle'?'▯▯▯':c.chartType==='heatmap'?'🔥🔥🔥':'📈'}</div><div class="card-actions"><button class="card-btn" onclick="focusChart(${i})">Focus</button><button class="card-btn" onclick="clearChart(${i})">Clear</button></div>`;
    grid.appendChild(card);
  });
  document.getElementById('inspector').classList.add('active');
}
function closeInspector(){document.getElementById('inspector').classList.remove('active');}
function focusChart(i){currentLayout='1x1';charts.forEach((c,j)=>{c.panel.style.display=j===i?'flex':'none';if(j===i)c.resize();});closeInspector();saveState();}
function clearChart(i){if(confirm(`Clear drawings on Chart ${i+1}?`)){charts[i].tools=[];charts[i].draw();saveState();openInspector();}}

/* ═══ SETTINGS ═══ */
function openSettings()  { document.getElementById('settings-modal').classList.add('active'); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); saveState(); }

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeInspector();closeSettings();closeIndicatorEditor();}
});

init();