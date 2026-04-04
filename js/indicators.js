/**
 * TixWatcher — Indicators Module
 * Pure technical-analysis functions + scripting engine (compile/run user code).
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   INDICATORS — math library
═══════════════════════════════════════════════════════════ */
const Indicators = (() => {
  const closes  = data => data.map(d => d.close);
  const volumes = data => data.map(d => d.volume);
  const nullArr = n    => Array(n).fill(null);

  /* ── SMA ── */
  function sma(data, period = 14) {
    const src = closes(data);
    return src.map((_, i) => {
      if (i < period - 1) return null;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += src[j];
      return sum / period;
    });
  }

  /* ── EMA ── */
  function ema(data, period = 14) {
    const src = closes(data), k = 2 / (period + 1);
    const out = nullArr(src.length);
    let prev = null;
    for (let i = 0; i < src.length; i++) {
      if (i < period - 1) continue;
      if (prev === null) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += src[j];
        prev = sum / period;
        out[i] = prev;
        continue;
      }
      prev = src[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  /* ── RSI ── */
  function rsi(data, period = 14) {
    const src = closes(data), out = nullArr(src.length);
    if (src.length < period + 1) return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = src[i] - src[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / period, al = losses / period;
    for (let i = period; i < src.length; i++) {
      if (i > period) {
        const d = src[i] - src[i - 1];
        ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
        al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
      }
      const rs = al === 0 ? 100 : ag / al;
      out[i] = 100 - 100 / (1 + rs);
    }
    return out;
  }

  /* ── MACD ── */
  function macd(data, fast = 12, slow = 26, signal = 9) {
    const fe = ema(data, fast), se = ema(data, slow), n = data.length;
    const ml = data.map((_, i) => (fe[i] !== null && se[i] !== null) ? fe[i] - se[i] : null);
    const sl = nullArr(n), hist = nullArr(n);
    const k = 2 / (signal + 1);
    let prev = null, count = 0;
    for (let i = 0; i < n; i++) {
      if (ml[i] === null) continue;
      count++;
      if (count < signal) { prev = (prev === null ? 0 : prev) + ml[i]; continue; }
      if (count === signal) { prev = (prev + ml[i]) / signal; sl[i] = prev; }
      else { prev = ml[i] * k + prev * (1 - k); sl[i] = prev; }
    }
    for (let i = 0; i < n; i++) hist[i] = (ml[i] !== null && sl[i] !== null) ? ml[i] - sl[i] : null;
    return { macd: ml, signal: sl, histogram: hist };
  }

  /* ── Bollinger Bands ── */
  function bbands(data, period = 20, mult = 2) {
    const src = closes(data), mid = sma(data, period);
    const upper = nullArr(data.length), lower = nullArr(data.length);
    for (let i = period - 1; i < src.length; i++) {
      const slice = src.slice(i - period + 1, i + 1), mean = mid[i];
      const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      upper[i] = mean + mult * sd;
      lower[i] = mean - mult * sd;
    }
    return { upper, mid, lower };
  }

  /* ── VWAP ── */
  function vwap(data) {
    const out = nullArr(data.length);
    let cumTPV = 0, cumVol = 0, prevDate = null;
    for (let i = 0; i < data.length; i++) {
      const d = data[i], date = new Date(d.time).toDateString();
      if (date !== prevDate) { cumTPV = 0; cumVol = 0; prevDate = date; }
      const tp = (d.high + d.low + d.close) / 3;
      cumTPV += tp * d.volume;
      cumVol += d.volume;
      out[i] = cumVol > 0 ? cumTPV / cumVol : d.close;
    }
    return out;
  }

  /* ── ATR ── */
  function atr(data, period = 14) {
    const out = nullArr(data.length);
    if (data.length < 2) return out;
    const trs = [data[0].high - data[0].low];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].close;
      trs.push(Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - prev),
        Math.abs(data[i].low  - prev)
      ));
    }
    if (trs.length < period) return out;
    let sum = trs.slice(0, period).reduce((a, b) => a + b, 0);
    out[period - 1] = sum / period;
    for (let i = period; i < data.length; i++)
      out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    return out;
  }

  /* ── Stochastic ── */
  function stoch(data, kPeriod = 14, dPeriod = 3) {
    const n = data.length, kLine = nullArr(n), dLine = nullArr(n);
    for (let i = kPeriod - 1; i < n; i++) {
      const slice = data.slice(i - kPeriod + 1, i + 1);
      const loL = Math.min(...slice.map(d => d.low));
      const hiH = Math.max(...slice.map(d => d.high));
      const rng = hiH - loL;
      kLine[i] = rng === 0 ? 50 : ((data[i].close - loL) / rng) * 100;
    }
    for (let i = kPeriod + dPeriod - 2; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        if (kLine[j] !== null) { sum += kLine[j]; cnt++; }
      }
      if (cnt === dPeriod) dLine[i] = sum / dPeriod;
    }
    return { k: kLine, d: dLine };
  }

  /* ── WMA ── */
  function wma(data, period = 14) {
    const src = closes(data), out = nullArr(src.length);
    const denom = (period * (period + 1)) / 2;
    for (let i = period - 1; i < src.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += src[i - period + 1 + j] * (j + 1);
      out[i] = sum / denom;
    }
    return out;
  }

  /* ── Hull MA ── */
  function hma(data, period = 14) {
    const half = Math.round(period / 2), sqp = Math.round(Math.sqrt(period));
    const wma1 = wma(data, half);
    const wma2 = wma(data, period);
    // raw HMA = 2*wma(half) - wma(period)
    const rawData = data.map((d, i) => ({
      ...d,
      close: wma1[i] !== null && wma2[i] !== null ? 2 * wma1[i] - wma2[i] : d.close
    }));
    return wma(rawData, sqp);
  }

  /* ── Ichimoku (partial: tenkan, kijun) ── */
  function ichimoku(data, tenkan = 9, kijun = 26) {
    const n = data.length;
    const tenkanLine = nullArr(n), kijunLine = nullArr(n);
    const hlAvg = (data, period, i) => {
      const slice = data.slice(Math.max(0, i - period + 1), i + 1);
      return (Math.max(...slice.map(d => d.high)) + Math.min(...slice.map(d => d.low))) / 2;
    };
    for (let i = 0; i < n; i++) {
      if (i >= tenkan - 1) tenkanLine[i] = hlAvg(data, tenkan, i);
      if (i >= kijun  - 1) kijunLine[i]  = hlAvg(data, kijun,  i);
    }
    return { tenkan: tenkanLine, kijun: kijunLine };
  }

  /* ── OBV (On Balance Volume) ── */
  function obv(data) {
    const out = nullArr(data.length);
    out[0] = data[0].volume;
    for (let i = 1; i < data.length; i++) {
      if (data[i].close > data[i - 1].close)      out[i] = out[i - 1] + data[i].volume;
      else if (data[i].close < data[i - 1].close) out[i] = out[i - 1] - data[i].volume;
      else                                         out[i] = out[i - 1];
    }
    return out;
  }

  /* ── CCI ── */
  function cci(data, period = 20) {
    const out = nullArr(data.length);
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const tp     = slice.map(d => (d.high + d.low + d.close) / 3);
      const mean   = tp.reduce((s, v) => s + v, 0) / period;
      const md     = tp.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
      out[i] = md === 0 ? 0 : (tp[tp.length - 1] - mean) / (0.015 * md);
    }
    return out;
  }

  /* ── Williams %R ── */
  function williamsR(data, period = 14) {
    const out = nullArr(data.length);
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const hiH = Math.max(...slice.map(d => d.high));
      const loL = Math.min(...slice.map(d => d.low));
      const rng = hiH - loL;
      out[i] = rng === 0 ? -50 : ((hiH - data[i].close) / rng) * -100;
    }
    return out;
  }

  return { sma, ema, rsi, macd, bbands, vwap, atr, stoch, wma, hma, ichimoku, obv, cci, williamsR };
})();

/* ═══════════════════════════════════════════════════════════
   INDICATOR ENGINE — compile & run user scripts
═══════════════════════════════════════════════════════════ */
const IndicatorEngine = (() => {
  /* ── Presets ── */
  const PRESETS = {
    sma_cross: {
      name: 'SMA Crossover (20/50)', category: 'Trend',
      description: 'BUY when SMA20 crosses above SMA50',
      code: `const fast=sma(20),slow=sma(50);
if(i===0)return;
const pf=sma(20,i-1),ps=sma(50,i-1);
if(fast!==null&&slow!==null&&pf!==null&&ps!==null){
  if(pf<=ps&&fast>slow){signal='BUY';label='Cross↑';}
  else if(pf>=ps&&fast<slow){signal='SELL';label='Cross↓';}
}`
    },
    rsi_levels: {
      name: 'RSI Overbought/Oversold', category: 'Momentum',
      description: 'BUY <30, SELL >70',
      code: `const r=rsi(14);
if(r===null)return;
if(r<30){signal='BUY';label='OS '+r.toFixed(0);}
else if(r>70){signal='SELL';label='OB '+r.toFixed(0);}`
    },
    bb_breakout: {
      name: 'Bollinger Band Breakout', category: 'Volatility',
      description: 'BUY above upper, SELL below lower',
      code: `const bands=bb(20,2);
if(bands.upper===null)return;
if(close>bands.upper){signal='BUY';label='BB↑';}
else if(close<bands.lower){signal='SELL';label='BB↓';}`
    },
    macd_cross: {
      name: 'MACD Signal Crossover', category: 'Momentum',
      description: 'BUY/SELL on MACD cross',
      code: `const m=macd(12,26,9);
if(m.macd===null||m.signal===null||i===0)return;
const prev=macd(12,26,9,i-1);
if(prev.macd===null)return;
if(m.macd>m.signal&&prev.macd<=prev.signal){signal='BUY';label='MACD↑';}
if(m.macd<m.signal&&prev.macd>=prev.signal){signal='SELL';label='MACD↓';}`
    },
    vwap_cross: {
      name: 'VWAP Cross', category: 'Volume',
      description: 'Price crosses VWAP line',
      code: `const v=vwap();
if(!prevClose||i===0)return;
const pv=vwap(i-1);
if(prevClose<pv&&close>v){signal='BUY';label='VWAP↑';}
else if(prevClose>pv&&close<v){signal='SELL';label='VWAP↓';}`
    },
    ema_ribbon: {
      name: 'EMA Ribbon (9/21/55)', category: 'Trend',
      description: 'BUY when price above all EMAs',
      code: `const e9=ema(9),e21=ema(21),e55=ema(55);
if(e9===null||e21===null||e55===null)return;
if(close>e9&&close>e21&&close>e55&&e9>e21){signal='BUY';label='↑Ribbon';}
else if(close<e9&&close<e21&&close<e55&&e9<e21){signal='SELL';label='↓Ribbon';}`
    },
    rsi_divergence: {
      name: 'RSI Divergence', category: 'Momentum',
      description: 'RSI makes higher low while price makes lower low',
      code: `if(i<5)return;
const r=rsi(14),rPrev=rsi(14,i-3);
if(r===null||rPrev===null)return;
const pLow=data[i-3]?.low,cLow=low;
if(cLow<pLow&&r>rPrev+2){signal='BUY';label='RSI Div';}
const pHi=data[i-3]?.high,cHi=high;
if(cHi>pHi&&r<rPrev-2){signal='SELL';label='RSI Div';}`
    },
    cci_signal: {
      name: 'CCI Signal (±100)', category: 'Oscillator',
      description: 'BUY when CCI crosses above -100, SELL above +100',
      code: `const c=cci(20);
if(c===null||i===0)return;
const pc=cci(20,i-1);
if(pc===null)return;
if(pc<-100&&c>=-100){signal='BUY';label='CCI↑';}
else if(pc>100&&c<=100){signal='SELL';label='CCI↓';}`
    },
    ichimoku_cloud: {
      name: 'Ichimoku TK Cross', category: 'Trend',
      description: 'Tenkan/Kijun crossover',
      code: `const ich=ichimoku(9,26);
if(ich.tenkan===null||ich.kijun===null||i===0)return;
const pt=ichimoku(9,26,i-1);
if(ich.tenkan>ich.kijun&&pt.tenkan<=pt.kijun){signal='BUY';label='TK↑';}
else if(ich.tenkan<ich.kijun&&pt.tenkan>=pt.kijun){signal='SELL';label='TK↓';}`
    },
    obv_trend: {
      name: 'OBV Trend Confirm', category: 'Volume',
      description: 'OBV rising with price = BUY',
      code: `if(i<10)return;
const ob=obv(),pob=obv(i-5);
if(ob===null||pob===null)return;
const ps=sma(20,i-5),cs=sma(20);
if(ob>pob&&cs>ps){signal='BUY';label='OBV↑';}
else if(ob<pob&&cs<ps){signal='SELL';label='OBV↓';}`
    }
  };

  /* ── Compile & run user code against a dataset ── */
  function compile(userCode, data) {
    if (!data || !data.length) return { signals: [], overlays: {}, error: null };

    const _smaC = {}, _emaC = {}, _rsiC = {}, _atrC = {}, _bbC = {};
    const _macdC = {}, _stochC = {}, _cciC = {}, _wrC = {}, _obvArr = { v: null };
    let _vwapArr = null, _hmaC = {}, _ichC = {};
    const usedSma = new Set(), usedEma = new Set();
    let usedBb = false, usedVwap = false, usedObv = false;

    const getSma  = p => { if (!_smaC[p])  _smaC[p]  = Indicators.sma(data, p);  usedSma.add(p); return _smaC[p]; };
    const getEma  = p => { if (!_emaC[p])  _emaC[p]  = Indicators.ema(data, p);  usedEma.add(p); return _emaC[p]; };
    const getRsi  = p => { if (!_rsiC[p])  _rsiC[p]  = Indicators.rsi(data, p);  return _rsiC[p]; };
    const getAtr  = p => { if (!_atrC[p])  _atrC[p]  = Indicators.atr(data, p);  return _atrC[p]; };
    const getHma  = p => { if (!_hmaC[p])  _hmaC[p]  = Indicators.hma(data, p);  return _hmaC[p]; };
    const getCci  = p => { if (!_cciC[p])  _cciC[p]  = Indicators.cci(data, p);  return _cciC[p]; };
    const getWr   = p => { if (!_wrC[p])   _wrC[p]   = Indicators.williamsR(data, p); return _wrC[p]; };
    const getObv  = () => { if (!_obvArr.v) { _obvArr.v = Indicators.obv(data); usedObv = true; } return _obvArr.v; };
    const getBb   = (p, m) => { const k = `${p}_${m}`; if (!_bbC[k]) { _bbC[k] = Indicators.bbands(data, p, m); usedBb = true; } return _bbC[k]; };
    const getMacd = (f, s, g) => { const k = `${f}_${s}_${g}`; if (!_macdC[k]) _macdC[k] = Indicators.macd(data, f, s, g); return _macdC[k]; };
    const getVwap = () => { if (!_vwapArr) { _vwapArr = Indicators.vwap(data); usedVwap = true; } return _vwapArr; };
    const getStoch = (k, d) => { const key = `${k}_${d}`; if (!_stochC[key]) _stochC[key] = Indicators.stoch(data, k, d); return _stochC[key]; };
    const getIch   = (t, k) => { const key = `${t}_${k}`; if (!_ichC[key]) _ichC[key] = Indicators.ichimoku(data, t, k); return _ichC[key]; };

    const idxOf = (arr, atI, barI) => {
      const idx = (atI !== undefined && atI >= 0) ? atI : barI;
      return arr[Math.min(idx, arr.length - 1)] ?? null;
    };

    /* Sandbox function string */
    const wrappedCode = `(function(bar_i,data,_getSma,_getEma,_getRsi,_getAtr,_getBb,_getMacd,_getVwap,_getStoch,_getHma,_getCci,_getWr,_getObv,_getIch,_idxOf){
const i=bar_i,close=data[bar_i].close,open=data[bar_i].open,high=data[bar_i].high,low=data[bar_i].low,volume=data[bar_i].volume,prevClose=bar_i>0?data[bar_i-1].close:null;
function sma(p,atI){return _idxOf(_getSma(p),atI,bar_i);}
function ema(p,atI){return _idxOf(_getEma(p),atI,bar_i);}
function rsi(p,atI){return _idxOf(_getRsi(p||14),atI,bar_i);}
function atr(p,atI){return _idxOf(_getAtr(p||14),atI,bar_i);}
function vwap(atI){return _idxOf(_getVwap(),atI,bar_i);}
function bb(p,mult,atI){mult=mult||2;const res=_getBb(p,mult),idx=(atI!==undefined&&atI>=0)?atI:bar_i;return{upper:res.upper[idx]??null,mid:res.mid[idx]??null,lower:res.lower[idx]??null};}
function macd(f,s,sig,atI){const res=_getMacd(f||12,s||26,sig||9),idx=(atI!==undefined&&atI>=0)?atI:bar_i;return{macd:res.macd[idx]??null,signal:res.signal[idx]??null,histogram:res.histogram[idx]??null};}
function stoch(k,d,atI){const res=_getStoch(k||14,d||3),idx=(atI!==undefined&&atI>=0)?atI:bar_i;return{k:res.k[idx]??null,d:res.d[idx]??null};}
function hma(p,atI){return _idxOf(_getHma(p||14),atI,bar_i);}
function cci(p,atI){return _idxOf(_getCci(p||20),atI,bar_i);}
function williamsR(p,atI){return _idxOf(_getWr(p||14),atI,bar_i);}
function obv(atI){return _idxOf(_getObv(),atI,bar_i);}
function ichimoku(t,k,atI){const res=_getIch(t||9,k||26),idx=(atI!==undefined&&atI>=0)?atI:bar_i;return{tenkan:res.tenkan[idx]??null,kijun:res.kijun[idx]??null};}
let signal='NEUTRAL',label='';
${userCode}
return{signal,label};
})`;

    const signals = [];
    let compileError = null;
    try {
      const fn = new Function('return ' + wrappedCode)();
      for (let i = 0; i < data.length; i++) {
        try {
          signals.push(fn(i, data, getSma, getEma, getRsi, getAtr, getBb, getMacd, getVwap, getStoch, getHma, getCci, getWr, getObv, getIch, idxOf) || { signal: 'NEUTRAL', label: '' });
        } catch {
          signals.push({ signal: 'NEUTRAL', label: '' });
        }
      }
    } catch (err) {
      compileError = err.message;
    }

    const overlays = {
      smaLines:  [...usedSma].map(p => ({ period: p, label: `SMA${p}`, values: _smaC[p] || [] })),
      emaLines:  [...usedEma].map(p => ({ period: p, label: `EMA${p}`, values: _emaC[p] || [] })),
      bbands:    usedBb  ? Object.values(_bbC) : [],
      vwapLine:  usedVwap ? _vwapArr : null,
      obvLine:   usedObv  ? _obvArr.v : null
    };

    return { signals, overlays, error: compileError };
  }

  /* ── Backtest a compiled result ── */
  function backtest(signals, data) {
    if (!signals || !signals.length || !data || !data.length) return null;
    let trades = [], inTrade = false, entry = null, entryIdx = -1;
    for (let i = 0; i < Math.min(signals.length, data.length); i++) {
      const sig = signals[i];
      if (!inTrade && sig?.signal === 'BUY') {
        inTrade = true; entry = data[i].close; entryIdx = i;
      } else if (inTrade && sig?.signal === 'SELL') {
        const exit = data[i].close, pnl = ((exit - entry) / entry) * 100;
        trades.push({ entryIdx, exitIdx: i, entry, exit, pnlPct: +pnl.toFixed(3) });
        inTrade = false; entry = null; entryIdx = -1;
      }
    }
    if (!trades.length) return { trades: [], winRate: 0, avgPnl: 0, totalPnl: 0 };
    const wins    = trades.filter(t => t.pnlPct > 0).length;
    const winRate = +(wins / trades.length * 100).toFixed(1);
    const totalPnl = +trades.reduce((s, t) => s + t.pnlPct, 0).toFixed(3);
    const avgPnl   = +(totalPnl / trades.length).toFixed(3);
    return { trades, winRate, avgPnl, totalPnl };
  }

  return { compile, backtest, getPresets: () => PRESETS };
})();

window.Indicators     = Indicators;
window.IndicatorEngine = IndicatorEngine;
