/* ═══════════════════════════════════════════════════════════
   TixWatcher — Data Provider v2.3
   ═══════════════════════════════════════════════════════════
   Key changes vs v2.2:
   • Removed global background-update timer. Each ChartPanel
     drives its own syncTimer. Shared timer was invalidating
     cache mid-tick and causing getLastPrice divergence.
   • getData() returns a DEEP COPY. Each chart owns its array;
     no shared-object mutations bleed between charts that load
     the same symbol.
   • getLastPrice() reads from the SAME cache as getData —
     one pipeline, zero price divergence between calls.
   ═══════════════════════════════════════════════════════════ */

const DataProvider = (() => {
  const CACHE_TTL = 12000;   // 12 s — longer than 5 s sync so cache stays warm

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

  /* ── Seeded PRNG (mulberry32) ─────────────────────────────
     Same symbol + same calendar-day → identical sequence.
     Historical candles are stable across re-fetches.          */
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

  /* ── Cache — stores CANONICAL arrays (never mutated) ──────  */
  const cache   = new Map();
  const pending = new Map();

  function getCached(sym) {
    const c = cache.get(sym);
    return (c && Date.now() - c.timestamp < CACHE_TTL) ? c.data : null;
  }
  function setCache(sym, data) { cache.set(sym, { timestamp: Date.now(), data }); }

  /* Deep-clone a single bar so each chart owns its objects */
  function cloneBar(d) {
    return { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
  }

  /* ── getData — returns a FRESH COPY every time ────────────
     Cached canonical array is never handed out directly.
     Each chart mutates only its own copy.                     */
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

  /* ── getLastPrice — reads from SAME cache as getData ──────
     Never opens a second fetch pipeline; price is always
     consistent with what getData most recently returned.      */
  async function getLastPrice(symbol) {
    symbol = symbol.toUpperCase();

    // Hot path: cache is warm → zero network call
    const cached = getCached(symbol);
    if (cached && cached.length) return cached[cached.length - 1].close;

    // Cold path: fetch fresh, prime cache for subsequent getData calls too
    try {
      const live = await fetchFromYahoo(symbol);
      if (live.length) { setCache(symbol, live); return live[live.length - 1].close; }
    } catch { /* fall through */ }

    const mock = generateRealisticData(symbol);
    setCache(symbol, mock);
    return mock.length ? mock[mock.length - 1].close : null;
  }

  /* ── subscribe/unsubscribe — lifecycle bookkeeping ────────
     No background timer here. Each ChartPanel owns its own
     syncTimer and controls its own fetch cadence.            */
  const subscribedSymbols = new Set();
  function subscribe(sym)   { subscribedSymbols.add(sym.toUpperCase()); }
  function unsubscribe(sym) { subscribedSymbols.delete(sym.toUpperCase()); }

  async function getSymbols() {
    return SYMBOLS.map(s => ({ symbol: s, name: s }));
  }

  return { getSymbols, getData, getLastPrice, subscribe, unsubscribe, SYMBOLS };
})();

window.DataProvider = DataProvider;