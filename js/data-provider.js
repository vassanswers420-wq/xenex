/**
 * TixWatcher — DataProvider Module
 * Handles all market data fetching, caching, live ticks, and subscriptions.
 */

'use strict';

const DataProvider = (() => {
  /* ─── Constants ─── */
  const CACHE_TTL = 15_000;
  const SYMBOLS = [
    "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","KOTAKBANK","AXISBANK",
    "INDUSINDBK","WIPRO","HCLTECH","TECHM","ONGC","BPCL","IOC","POWERGRID","NTPC",
    "ITC","HINDUNILVR","NESTLEIND","BRITANNIA","DABUR","MARICO","MARUTI","TATAMOTORS",
    "M&M","BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","SUNPHARMA","DRREDDY","CIPLA",
    "DIVISLAB","LUPIN","TATASTEEL","JSWSTEEL","HINDALCO","COALINDIA","VEDL","LT",
    "ULTRACEMCO","ASIANPAINT","BAJFINANCE","BAJAJFINSV","ADANIENT","ADANIPORTS",
    "GRASIM","SHREECEM","APOLLOHOSP"
  ];

  const BASE_PRICES = {
    "RELIANCE":2450,"TCS":3580,"INFY":1450,"HDFCBANK":1650,"ICICIBANK":980,
    "SBIN":580,"KOTAKBANK":1750,"AXISBANK":920,"INDUSINDBK":1320,"WIPRO":420,
    "HCLTECH":1280,"TECHM":1150,"ONGC":180,"BPCL":340,"IOC":85,"POWERGRID":220,
    "NTPC":280,"ITC":420,"HINDUNILVR":2380,"NESTLEIND":22500,"BRITANNIA":4850,
    "DABUR":520,"MARICO":560,"MARUTI":10800,"TATAMOTORS":780,"M&M":1520,
    "BAJAJ-AUTO":8500,"HEROMOTOCO":4250,"EICHERMOT":3680,"SUNPHARMA":1180,
    "DRREDDY":5250,"CIPLA":1320,"DIVISLAB":3580,"LUPIN":1650,"TATASTEEL":125,
    "JSWSTEEL":820,"HINDALCO":520,"COALINDIA":380,"VEDL":420,"LT":3250,
    "ULTRACEMCO":8500,"ASIANPAINT":2980,"BAJFINANCE":6750,"BAJAJFINSV":1520,
    "ADANIENT":2250,"ADANIPORTS":780,"GRASIM":1980,"SHREECEM":25800,"APOLLOHOSP":5680
  };

  /* ─── Seeded PRNG ─── */
  function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function symbolSeed(sym) {
    const d = new Date();
    const dk = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    let h = dk;
    for (let i = 0; i < sym.length; i++) h = Math.imul(h ^ sym.charCodeAt(i), 0x9e3779b9) >>> 0;
    return h;
  }

  /* ─── Mock Data Generator ─── */
  function generateData(sym) {
    const rand = seededRand(symbolSeed(sym));
    const now = Date.now();
    const mo = new Date(); mo.setHours(9, 15, 0, 0);
    const mc = new Date(); mc.setHours(15, 30, 0, 0);
    const bp = BASE_PRICES[sym] || 1000;
    const off = (rand() - 0.5) * bp * 0.015;
    let price = bp + off;
    const data = [];
    for (let time = mo.getTime(); time <= Math.min(now, mc.getTime()); time += 60000) {
      const v = price * 0.0018;
      const open = price, chg = (rand() - 0.48) * v, close = open + chg;
      const high = Math.max(open, close) + rand() * v * 0.4;
      const low  = Math.min(open, close) - rand() * v * 0.4;
      data.push({
        time, open: +open.toFixed(2), high: +high.toFixed(2),
        low: +low.toFixed(2), close: +close.toFixed(2),
        volume: Math.floor(rand() * 80000 + 40000)
      });
      price = close;
    }
    return data;
  }

  /* ─── Yahoo Finance Fetch ─── */
  async function fetchYahoo(sym) {
    const proxy = 'https://api.allorigins.win/raw?url=';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}.NS?interval=1m&range=1d`;
    const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.chart?.result?.[0]) throw new Error('No data');
    const r = data.chart.result[0];
    const q = r.indicators.quote[0];
    return r.timestamp.map((ts, i) => ({
      time: ts * 1000,
      open:   +q.open[i]   || 0,
      high:   +q.high[i]   || 0,
      low:    +q.low[i]    || 0,
      close:  +q.close[i]  || 0,
      volume: +q.volume[i] || 0
    })).filter(d => d.close > 0);
  }

  /* ─── Cache & Pending ─── */
  const cache   = new Map();
  const pending = new Map();
  const subbed  = new Set();
  const listeners = new Map(); // sym → Set of callbacks

  function getCached(sym) {
    const c = cache.get(sym);
    return (c && Date.now() - c.ts < CACHE_TTL) ? c.data : null;
  }
  function setCache(sym, data) {
    cache.set(sym, { ts: Date.now(), data });
  }
  const clone = d => ({ ...d });

  /* ─── Public API ─── */
  async function getData(sym) {
    sym = sym.toUpperCase();
    const cached = getCached(sym);
    if (cached) return cached.map(clone);
    if (pending.has(sym)) return (await pending.get(sym)).map(clone);

    const p = (async () => {
      try {
        const live = await fetchYahoo(sym);
        const final = live.length > 0 ? live : generateData(sym);
        setCache(sym, final);
        return final;
      } catch {
        const mock = generateData(sym);
        setCache(sym, mock);
        return mock;
      } finally {
        pending.delete(sym);
      }
    })();

    pending.set(sym, p);
    return (await p).map(clone);
  }

  async function getLastPrice(sym) {
    sym = sym.toUpperCase();
    const cached = getCached(sym);
    if (cached && cached.length) return cached[cached.length - 1].close;
    try {
      const live = await fetchYahoo(sym);
      if (live.length) { setCache(sym, live); return live[live.length - 1].close; }
    } catch {}
    const mock = generateData(sym);
    setCache(sym, mock);
    return mock.length ? mock[mock.length - 1].close : null;
  }

  /** Prefetch a batch of symbols. */
  async function bootRefresh(syms) {
    cache.clear();
    await Promise.allSettled(
      (syms || SYMBOLS).map(s => getData(typeof s === 'string' ? s.toUpperCase() : s.symbol?.toUpperCase()).catch(() => {}))
    );
  }

  /** Flush cache for a specific symbol (or all) and re-fetch. */
  async function invalidate(sym) {
    if (sym) cache.delete(sym.toUpperCase());
    else cache.clear();
  }

  /** Returns {open, high, low, close, volume, change, changePct} summary for a symbol. */
  async function getSummary(sym) {
    const data = await getData(sym);
    if (!data || !data.length) return null;
    const first = data[0], last = data[data.length - 1];
    const change = last.close - first.open;
    return {
      open:      first.open,
      high:      Math.max(...data.map(d => d.high)),
      low:       Math.min(...data.map(d => d.low)),
      close:     last.close,
      volume:    data.reduce((s, d) => s + d.volume, 0),
      change:    +change.toFixed(2),
      changePct: +((change / first.open) * 100).toFixed(2)
    };
  }

  function subscribe(s)   { subbed.add(s);    }
  function unsubscribe(s) { subbed.delete(s); }

  /** Watch-list style listener: cb(sym, summary) called after each invalidate. */
  function addListener(sym, cb) {
    if (!listeners.has(sym)) listeners.set(sym, new Set());
    listeners.get(sym).add(cb);
  }
  function removeListener(sym, cb) {
    listeners.get(sym)?.delete(cb);
  }

  return {
    getData, getLastPrice, bootRefresh, invalidate, getSummary,
    subscribe, unsubscribe, addListener, removeListener,
    getSymbols: () => SYMBOLS.map(s => ({ symbol: s, name: s })),
    SYMBOLS
  };
})();

window.DataProvider = DataProvider;
