/* ═══════════════════════════════════════════════════════════
   TixWatcher — Data Provider v2.4
   ═══════════════════════════════════════════════════════════
   Changes vs v2.3:
   • bootRefresh(symbols[]) — parallel-fetches all symbols
     at startup, warming the cache before any chart renders.
     Returns a Promise that resolves when all fetches settle.
   • getData() + getLastPrice() unchanged contract.
   • CACHE_TTL bumped to 15s to ride out the boot burst.
   ═══════════════════════════════════════════════════════════ */

const DataProvider = (() => {
  const CACHE_TTL = 15000;

  const SYMBOLS = [
    "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN",
    "KOTAKBANK","AXISBANK","INDUSINDBK","WIPRO","HCLTECH","TECHM",
    "ONGC","BPCL","IOC","POWERGRID","NTPC","ITC","HINDUNILVR",
    "NESTLEIND","BRITANNIA","DABUR","MARICO","MARUTI","TATAMOTORS",
    "M&M","BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","SUNPHARMA",
    "DRREDDY","CIPLA","DIVISLAB","LUPIN","TATASTEEL","JSWSTEEL",
    "HINDALCO","COALINDIA","VEDL","LT","ULTRACEMCO","ASIANPAINT",
    "BAJFINANCE","BAJAJFINSV","ADANIENT","ADANIPORTS","GRASIM",
    "SHREECEM","APOLLOHOSP"
  ];

  const BASE_PRICES = {
    "RELIANCE":2450,"TCS":3580,"INFY":1450,"HDFCBANK":1650,
    "ICICIBANK":980,"SBIN":580,"KOTAKBANK":1750,"AXISBANK":920,
    "INDUSINDBK":1320,"WIPRO":420,"HCLTECH":1280,"TECHM":1150,
    "ONGC":180,"BPCL":340,"IOC":85,"POWERGRID":220,
    "NTPC":280,"ITC":420,"HINDUNILVR":2380,"NESTLEIND":22500,
    "BRITANNIA":4850,"DABUR":520,"MARICO":560,"MARUTI":10800,
    "TATAMOTORS":780,"M&M":1520,"BAJAJ-AUTO":8500,"HEROMOTOCO":4250,
    "EICHERMOT":3680,"SUNPHARMA":1180,"DRREDDY":5250,"CIPLA":1320,
    "DIVISLAB":3580,"LUPIN":1650,"TATASTEEL":125,"JSWSTEEL":820,
    "HINDALCO":520,"COALINDIA":380,"VEDL":420,"LT":3250,
    "ULTRACEMCO":8500,"ASIANPAINT":2980,"BAJFINANCE":6750,
    "BAJAJFINSV":1520,"ADANIENT":2250,"ADANIPORTS":780,
    "GRASIM":1980,"SHREECEM":25800,"APOLLOHOSP":5680
  };

  /* ── Seeded PRNG (mulberry32) ─────────────────────────────  */
  function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function symbolSeed(symbol) {
    const d = new Date();
    const dayKey = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    let h = dayKey;
    for (let i = 0; i < symbol.length; i++) {
      h = Math.imul(h ^ symbol.charCodeAt(i), 0x9e3779b9) >>> 0;
    }
    return h;
  }

  function generateRealisticData(symbol) {
    const rand = seededRand(symbolSeed(symbol));
    const now         = Date.now();
    const marketOpen  = new Date(); marketOpen.setHours(9, 15, 0, 0);
    const marketClose = new Date(); marketClose.setHours(15, 30, 0, 0);
    const basePrice   = BASE_PRICES[symbol] || 1000;
    const dayOffset   = (rand() - 0.5) * basePrice * 0.015;
    let price = basePrice + dayOffset;

    const data  = [];
    const start = marketOpen.getTime();
    const end   = Math.min(now, marketClose.getTime());

    for (let time = start; time <= end; time += 60000) {
      const v     = price * 0.0018;
      const open  = price;
      const chg   = (rand() - 0.48) * v;
      const close = open + chg;
      const high  = Math.max(open, close) + rand() * v * 0.4;
      const low   = Math.min(open, close) - rand() * v * 0.4;
      data.push({
        time,
        open:   +open.toFixed(2),
        high:   +high.toFixed(2),
        low:    +low.toFixed(2),
        close:  +close.toFixed(2),
        volume: Math.floor(rand() * 80000 + 40000)
      });
      price = close;
    }
    return data;
  }

  /* ── Yahoo Finance via CORS proxy ─────────────────────────  */
  async function fetchFromYahoo(symbol) {
    const proxy = 'https://api.allorigins.win/raw?url=';
    const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1m&range=1d`;
    const res   = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
    const data  = await res.json();
    if (!data.chart?.result?.[0]) throw new Error('No data');
    const r = data.chart.result[0];
    const q = r.indicators.quote[0];
    return r.timestamp
      .map((ts, i) => ({
        time:   ts * 1000,
        open:   +q.open[i]   || 0,
        high:   +q.high[i]   || 0,
        low:    +q.low[i]    || 0,
        close:  +q.close[i]  || 0,
        volume: +q.volume[i] || 0
      }))
      .filter(d => d.close > 0);
  }

  /* ── Cache ────────────────────────────────────────────────  */
  const cache   = new Map();
  const pending = new Map();

  function getCached(sym) {
    const c = cache.get(sym);
    return (c && Date.now() - c.timestamp < CACHE_TTL) ? c.data : null;
  }
  function setCache(sym, data) { cache.set(sym, { timestamp: Date.now(), data }); }

  /** Invalidate a specific symbol so next getData() forces a fresh fetch */
  function invalidate(sym) { cache.delete(sym.toUpperCase()); }

  /** Invalidate all cached symbols */
  function invalidateAll() { cache.clear(); }

  function cloneBar(d) {
    return { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
  }

  /* ── getData ──────────────────────────────────────────────  */
  async function getData(symbol) {
    if (!symbol) throw new Error('Symbol required');
    symbol = symbol.toUpperCase();

    const cached = getCached(symbol);
    if (cached) return cached.map(cloneBar);

    if (pending.has(symbol)) return (await pending.get(symbol)).map(cloneBar);

    const p = (async () => {
      try {
        const live  = await fetchFromYahoo(symbol);
        const final = live.length > 0 ? live : generateRealisticData(symbol);
        setCache(symbol, final);
        return final;
      } catch {
        const mock = generateRealisticData(symbol);
        setCache(symbol, mock);
        return mock;
      } finally {
        pending.delete(symbol);
      }
    })();

    pending.set(symbol, p);
    return (await p).map(cloneBar);
  }

  /* ── getLastPrice ─────────────────────────────────────────  */
  async function getLastPrice(symbol) {
    symbol = symbol.toUpperCase();

    const cached = getCached(symbol);
    if (cached && cached.length) return cached[cached.length - 1].close;

    try {
      const live = await fetchFromYahoo(symbol);
      if (live.length) { setCache(symbol, live); return live[live.length - 1].close; }
    } catch { /* fall through */ }

    const mock = generateRealisticData(symbol);
    setCache(symbol, mock);
    return mock.length ? mock[mock.length - 1].close : null;
  }

  /* ── bootRefresh ──────────────────────────────────────────
     Called once at startup. Parallel-fetches all requested
     symbols, warming the cache. Resolves when all settle
     (never rejects — individual failures silently fall back
     to generated data).                                       */
  async function bootRefresh(symbolList) {
    invalidateAll();
    const targets = (symbolList || SYMBOLS).map(s =>
      typeof s === 'string' ? s.toUpperCase() : s.symbol?.toUpperCase()
    ).filter(Boolean);

    // Fire all fetches concurrently; ignore individual errors
    await Promise.allSettled(targets.map(sym => getData(sym)));
  }

  /* ── subscribe/unsubscribe ────────────────────────────────  */
  const subscribedSymbols = new Set();
  function subscribe(sym)   { subscribedSymbols.add(sym.toUpperCase()); }
  function unsubscribe(sym) { subscribedSymbols.delete(sym.toUpperCase()); }

  async function getSymbols() {
    return SYMBOLS.map(s => ({ symbol: s, name: s }));
  }

  return {
    getSymbols, getData, getLastPrice,
    subscribe, unsubscribe,
    bootRefresh, invalidate, invalidateAll,
    SYMBOLS
  };
})();

window.DataProvider = DataProvider;