/* ═══════════════════════════════════════════════════════════
   TixWatcher — Indicators Library v2.0
   ═══════════════════════════════════════════════════════════ */

const Indicators = (() => {
  const closes  = data => data.map(d => d.close);
  function fillNull(n) { return Array(n).fill(null); }

  function sma(data, period = 14) {
    const src = closes(data);
    return src.map((_, i) => {
      if (i < period - 1) return null;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += src[j];
      return sum / period;
    });
  }

  function ema(data, period = 14) {
    const src = closes(data);
    const k   = 2 / (period + 1);
    const out  = fillNull(src.length);
    let started = false, prev = 0;
    for (let i = 0; i < src.length; i++) {
      if (i < period - 1) continue;
      if (!started) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += src[j];
        prev = sum / period; out[i] = prev; started = true; continue;
      }
      prev = src[i] * k + prev * (1 - k); out[i] = prev;
    }
    return out;
  }

  function rsi(data, period = 14) {
    const src = closes(data);
    const out  = fillNull(src.length);
    if (src.length < period + 1) return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = src[i] - src[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period; i < src.length; i++) {
      if (i > period) {
        const d = src[i] - src[i - 1];
        avgGain  = (avgGain  * (period - 1) + (d > 0 ? d : 0)) / period;
        avgLoss  = (avgLoss  * (period - 1) + (d < 0 ? -d : 0)) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
    return out;
  }

  function macd(data, fast = 12, slow = 26, signal = 9) {
    const fastEma  = ema(data, fast);
    const slowEma  = ema(data, slow);
    const n        = data.length;
    const macdLine = data.map((_, i) =>
      fastEma[i] !== null && slowEma[i] !== null ? fastEma[i] - slowEma[i] : null
    );
    const k       = 2 / (signal + 1);
    const sigLine = fillNull(n);
    let prev = null, count = 0;
    for (let i = 0; i < n; i++) {
      if (macdLine[i] === null) continue;
      count++;
      if (count < signal) { prev = (prev === null ? 0 : prev) + macdLine[i]; continue; }
      if (count === signal) { prev = (prev + macdLine[i]) / signal; sigLine[i] = prev; continue; }
      prev = macdLine[i] * k + prev * (1 - k); sigLine[i] = prev;
    }
    const hist = data.map((_, i) =>
      macdLine[i] !== null && sigLine[i] !== null ? macdLine[i] - sigLine[i] : null
    );
    return { macd: macdLine, signal: sigLine, histogram: hist };
  }

  function bbands(data, period = 20, mult = 2) {
    const src  = closes(data);
    const mid  = sma(data, period);
    const upper = fillNull(data.length);
    const lower = fillNull(data.length);
    for (let i = period - 1; i < src.length; i++) {
      const slice = src.slice(i - period + 1, i + 1);
      const mean  = mid[i];
      const sd    = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      upper[i] = mean + mult * sd;
      lower[i] = mean - mult * sd;
    }
    return { upper, mid, lower };
  }

  function vwap(data) {
    const out = fillNull(data.length);
    let cumTPV = 0, cumVol = 0, prevDate = null;
    for (let i = 0; i < data.length; i++) {
      const d    = data[i];
      const date = new Date(d.time).toDateString();
      if (date !== prevDate) { cumTPV = 0; cumVol = 0; prevDate = date; }
      const tp   = (d.high + d.low + d.close) / 3;
      cumTPV    += tp * d.volume; cumVol += d.volume;
      out[i]     = cumVol > 0 ? cumTPV / cumVol : d.close;
    }
    return out;
  }

  function atr(data, period = 14) {
    const out = fillNull(data.length);
    if (data.length < 2) return out;
    const trs = [data[0].high - data[0].low];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].close;
      trs.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - prev), Math.abs(data[i].low - prev)));
    }
    if (trs.length < period) return out;
    let sum = trs.slice(0, period).reduce((a, b) => a + b, 0);
    out[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    return out;
  }

  function stoch(data, kPeriod = 14, dPeriod = 3) {
    const n  = data.length;
    const kLine = fillNull(n), dLine = fillNull(n);
    for (let i = kPeriod - 1; i < n; i++) {
      const slice    = data.slice(i - kPeriod + 1, i + 1);
      const lowestL  = Math.min(...slice.map(d => d.low));
      const highestH = Math.max(...slice.map(d => d.high));
      const rng      = highestH - lowestL;
      kLine[i] = rng === 0 ? 50 : ((data[i].close - lowestL) / rng) * 100;
    }
    for (let i = kPeriod + dPeriod - 2; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) { if (kLine[j] !== null) { sum += kLine[j]; cnt++; } }
      if (cnt === dPeriod) dLine[i] = sum / dPeriod;
    }
    return { k: kLine, d: dLine };
  }

  function obv(data) {
    const out = fillNull(data.length);
    if (!data.length) return out;
    out[0] = data[0].volume;
    for (let i = 1; i < data.length; i++) {
      if (data[i].close > data[i - 1].close)      out[i] = out[i-1] + data[i].volume;
      else if (data[i].close < data[i - 1].close) out[i] = out[i-1] - data[i].volume;
      else                                          out[i] = out[i-1];
    }
    return out;
  }

  function cci(data, period = 20) {
    const out = fillNull(data.length);
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const tps   = slice.map(d => (d.high + d.low + d.close) / 3);
      const mean  = tps.reduce((a, b) => a + b, 0) / period;
      const mad   = tps.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
      out[i] = mad === 0 ? 0 : (tps[tps.length - 1] - mean) / (0.015 * mad);
    }
    return out;
  }

  return { sma, ema, rsi, macd, bbands, vwap, atr, stoch, obv, cci };
})();

window.Indicators = Indicators;

/* ═══════════════════════════════════════════════════════════
   Signal Notification System
   ═══════════════════════════════════════════════════════════ */
const SignalNotifier = (() => {
  let container = null;

  function init() {
    if (container) return;
    container = document.createElement('div');
    container.id = 'signal-notif-container';
    container.style.cssText = `
      position: fixed;
      bottom: 32px;
      right: 14px;
      display: flex;
      flex-direction: column-reverse;
      gap: 6px;
      z-index: 9999;
      pointer-events: none;
      max-width: 220px;
    `;
    document.body.appendChild(container);
  }

  function notify(symbol, signal, label, chartId) {
    init();
    const isBuy = signal === 'BUY';
    const el = document.createElement('div');
    el.style.cssText = `
      background: ${isBuy ? 'rgba(0,200,83,0.08)' : 'rgba(255,61,0,0.08)'};
      border: 1px solid ${isBuy ? 'rgba(0,200,83,0.3)' : 'rgba(255,61,0,0.3)'};
      border-left: 2px solid ${isBuy ? '#00c853' : '#ff3d00'};
      border-radius: 4px;
      padding: 7px 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: ${isBuy ? '#00c853' : '#ff3d00'};
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: all;
      opacity: 0;
      transform: translateX(12px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      cursor: default;
      backdrop-filter: blur(8px);
    `;
    el.innerHTML = `
      <span style="font-size:11px">${isBuy ? '▲' : '▼'}</span>
      <div>
        <div style="font-weight:600;letter-spacing:.3px">${symbol}</div>
        <div style="opacity:.7;font-size:9px">${label || signal} · C${chartId + 1}</div>
      </div>
      <div style="margin-left:auto;opacity:.4;font-size:9px;cursor:pointer" onclick="this.parentElement.remove()">✕</div>
    `;
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    // Auto-dismiss after 4s
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(12px)';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  return { notify };
})();

window.SignalNotifier = SignalNotifier;

/* ═══════════════════════════════════════════════════════════
   IndicatorEngine v2.0
   ═══════════════════════════════════════════════════════════ */
const IndicatorEngine = (() => {

  /* ── Presets ── */
  const PRESETS = {
    sma_cross: {
      name: 'SMA Crossover (20/50)',
      description: 'BUY when SMA20 crosses above SMA50, SELL when it crosses below.',
      code: `// SMA 20/50 Crossover
// Draws two SMA lines on the chart automatically
const fast = sma(20);
const slow = sma(50);
if (i === 0) return;
const prevFast = sma(20, i - 1);
const prevSlow = sma(50, i - 1);
if (fast !== null && slow !== null && prevFast !== null && prevSlow !== null) {
  if (prevFast <= prevSlow && fast > slow) {
    signal = 'BUY';
    label = 'Cross↑';
  } else if (prevFast >= prevSlow && fast < slow) {
    signal = 'SELL';
    label = 'Cross↓';
  }
}`
    },
    rsi_levels: {
      name: 'RSI Overbought/Oversold',
      description: 'BUY when RSI(14) < 30, SELL when RSI > 70.',
      code: `// RSI Overbought / Oversold
const r = rsi(14);
if (r === null) return;
const prevR = i > 0 ? rsi(14, i - 1) : null;
if (r < 30 && (prevR === null || prevR >= 30)) {
  signal = 'BUY';
  label = 'OS ' + r.toFixed(0);
} else if (r > 70 && (prevR === null || prevR <= 70)) {
  signal = 'SELL';
  label = 'OB ' + r.toFixed(0);
}`
    },
    bb_breakout: {
      name: 'Bollinger Band Breakout',
      description: 'BUY above upper band, SELL below lower band.',
      code: `// Bollinger Band Breakout (20, 2)
// Draws BB bands on chart automatically
const bands = bb(20, 2);
if (bands.upper === null) return;
if (close > bands.upper) {
  signal = 'BUY';
  label = 'BB↑';
} else if (close < bands.lower) {
  signal = 'SELL';
  label = 'BB↓';
}`
    },
    macd_cross: {
      name: 'MACD Signal Crossover',
      description: 'BUY when MACD crosses above signal, SELL when below.',
      code: `// MACD Crossover (12, 26, 9)
const m = macd(12, 26, 9);
if (m.macd === null || m.signal === null || i === 0) return;
const prev = macd(12, 26, 9, i - 1);
if (prev.macd === null) return;
const crossUp   = m.macd > m.signal && prev.macd <= prev.signal;
const crossDown = m.macd < m.signal && prev.macd >= prev.signal;
if (crossUp)   { signal = 'BUY';  label = 'MACD↑'; }
if (crossDown) { signal = 'SELL'; label = 'MACD↓'; }`
    },
    vwap_cross: {
      name: 'VWAP Cross',
      description: 'BUY when price crosses above VWAP, SELL when below.',
      code: `// VWAP Cross — draws VWAP line on chart
const v = vwap();
if (!prevClose || i === 0) return;
const prevV = vwap(i - 1);
if (prevClose < prevV && close > v) {
  signal = 'BUY';
  label = 'VWAP↑';
} else if (prevClose > prevV && close < v) {
  signal = 'SELL';
  label = 'VWAP↓';
}`
    },
    ema_ribbon: {
      name: 'EMA Ribbon (9/21/55)',
      description: 'Draws 3 EMA lines. BUY when price is above all three.',
      code: `// EMA Ribbon — draws 3 EMA lines on chart
const e9  = ema(9);
const e21 = ema(21);
const e55 = ema(55);
if (e9 === null || e21 === null || e55 === null) return;
if (close > e9 && close > e21 && close > e55 && e9 > e21) {
  signal = 'BUY';
  label = '↑Ribbon';
} else if (close < e9 && close < e21 && close < e55 && e9 < e21) {
  signal = 'SELL';
  label = '↓Ribbon';
}`
    },
    stoch_cross: {
      name: 'Stochastic Cross',
      description: 'BUY when %K crosses above %D in oversold zone.',
      code: `// Stochastic Crossover
const s = stoch(14, 3);
if (s.k === null || s.d === null || i === 0) return;
const prev = stoch(14, 3, i - 1);
if (prev.k === null) return;
if (prev.k <= prev.d && s.k > s.d && s.k < 30) {
  signal = 'BUY';
  label = 'Stoch↑';
} else if (prev.k >= prev.d && s.k < s.d && s.k > 70) {
  signal = 'SELL';
  label = 'Stoch↓';
}`
    }
  };

  /* ── compile ── */
  function compile(userCode, data) {
    if (!data || !data.length) return { signals: [], overlays: {}, error: null };

    const _smaCache  = {}, _emaCache  = {}, _rsiCache  = {};
    const _atrCache  = {}, _bbCache   = {}, _macdCache = {};
    const _stochCache = {};
    let _vwapArr = null;

    const usedSma = new Set(), usedEma = new Set();
    let usedBb = false, usedVwap = false;

    function getSma(period)   { if (!_smaCache[period])  _smaCache[period]  = Indicators.sma(data, period);  usedSma.add(period);  return _smaCache[period]; }
    function getEma(period)   { if (!_emaCache[period])  _emaCache[period]  = Indicators.ema(data, period);  usedEma.add(period);  return _emaCache[period]; }
    function getRsi(period)   { if (!_rsiCache[period])  _rsiCache[period]  = Indicators.rsi(data, period);  return _rsiCache[period]; }
    function getAtr(period)   { if (!_atrCache[period])  _atrCache[period]  = Indicators.atr(data, period);  return _atrCache[period]; }
    function getBb(p, m)      { const k=`${p}_${m}`; if (!_bbCache[k]) _bbCache[k] = Indicators.bbands(data, p, m); usedBb=true; return _bbCache[k]; }
    function getMacd(f, s, g) { const k=`${f}_${s}_${g}`; if (!_macdCache[k]) _macdCache[k] = Indicators.macd(data, f, s, g); return _macdCache[k]; }
    function getVwap()        { if (!_vwapArr) _vwapArr = Indicators.vwap(data); usedVwap=true; return _vwapArr; }
    function getStoch(k, d)   { const key=`${k}_${d}`; if (!_stochCache[key]) _stochCache[key] = Indicators.stoch(data, k, d); return _stochCache[key]; }

    const signals = [];
    let compileError = null;

    const wrappedCode = `
      (function(bar_i, bar_data, _getSma, _getEma, _getRsi, _getAtr, _getBb, _getMacd, _getVwap, _getStoch) {
        const i         = bar_i;
        const close     = bar_data[bar_i].close;
        const open      = bar_data[bar_i].open;
        const high      = bar_data[bar_i].high;
        const low       = bar_data[bar_i].low;
        const volume    = bar_data[bar_i].volume;
        const prevClose = bar_i > 0 ? bar_data[bar_i - 1].close : null;

        function sma(period, atI)  { const arr = _getSma(period);  const idx = atI !== undefined ? atI : bar_i; return arr[Math.min(idx, arr.length-1)]; }
        function ema(period, atI)  { const arr = _getEma(period);  const idx = atI !== undefined ? atI : bar_i; return arr[Math.min(idx, arr.length-1)]; }
        function rsi(period, atI)  { const arr = _getRsi(period);  const idx = atI !== undefined ? atI : bar_i; return arr[Math.min(idx, arr.length-1)]; }
        function atr(period, atI)  { const arr = _getAtr(period);  const idx = atI !== undefined ? atI : bar_i; return arr[Math.min(idx, arr.length-1)]; }
        function vwap(atI)         { const arr = _getVwap();        const idx = atI !== undefined ? atI : bar_i; return arr[Math.min(idx, arr.length-1)]; }
        function bb(period, mult, atI) {
          mult = mult || 2;
          const res = _getBb(period, mult);
          const idx = atI !== undefined ? atI : bar_i;
          return { upper: res.upper[idx], mid: res.mid[idx], lower: res.lower[idx] };
        }
        function macd(f, s, sig, atI) {
          const res = _getMacd(f || 12, s || 26, sig || 9);
          const idx = atI !== undefined ? atI : bar_i;
          return { macd: res.macd[idx], signal: res.signal[idx], histogram: res.histogram[idx] };
        }
        function stoch(k, d, atI) {
          const res = _getStoch(k || 14, d || 3);
          const idx = atI !== undefined ? atI : bar_i;
          return { k: res.k[idx], d: res.d[idx] };
        }

        let signal = 'NEUTRAL';
        let label  = '';

        ${userCode}

        return { signal, label };
      })
    `;

    try {
      const fn = new Function('return ' + wrappedCode)();
      for (let i = 0; i < data.length; i++) {
        try {
          const result = fn(i, data, getSma, getEma, getRsi, getAtr, getBb, getMacd, getVwap, getStoch);
          signals.push(result);
        } catch {
          signals.push({ signal: 'NEUTRAL', label: '' });
        }
      }
    } catch (err) {
      compileError = err.message;
    }

    const overlays = {
      smaLines: [...usedSma].map(p => ({ period: p, label: `SMA${p}`, values: _smaCache[p] })),
      emaLines: [...usedEma].map(p => ({ period: p, label: `EMA${p}`, values: _emaCache[p] })),
      bbands:   usedBb ? Object.values(_bbCache) : [],
      vwapLine: usedVwap ? _vwapArr : null
    };

    return { signals, overlays, error: compileError };
  }

  function getPresets()  { return PRESETS; }
  function getPreset(id) { return PRESETS[id] || null; }

  return { compile, getPresets, getPreset };
})();

window.IndicatorEngine = IndicatorEngine;