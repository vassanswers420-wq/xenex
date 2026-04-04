/**
 * TixWatcher — ChartRenderer Module
 * All canvas drawing logic. Zero business-logic leakage into index.html.
 */

'use strict';

const ChartRenderer = (() => {
  /* ── Color helpers ── */
  const OVERLAY_COLORS = ['#f59e0b','#a78bfa','#34d399','#fb923c','#60a5fa','#f472b6','#e879f9','#22d3ee'];

  /* ─────────────────────────────────────────────────────────
     MAIN DRAW
  ───────────────────────────────────────────────────────── */
  function draw(win) {
	const { canvas, ctx } = win;

	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();

	// ✅ Fix: sync canvas resolution with DPR
	if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
	  canvas.width  = rect.width  * dpr;
	  canvas.height = rect.height * dpr;
	}

	// use CSS size for layout math
	const W = rect.width;
	const H = rect.height;

	const AP  = 58; // axis padding left
	const C   = window.ThemeManager.C;

	// ✅ reset transform before scaling
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.scale(dpr, dpr);

	// clear AFTER scaling
	ctx.clearRect(0, 0, W, H);

	ctx.save();

	/* Background */
	ctx.fillStyle = C.bg;
	ctx.fillRect(0, 0, W, H);

	const slice = win.data.slice(Math.floor(win.viewStart), Math.ceil(win.viewEnd));
	if (!slice.length) { ctx.restore(); return; }

	const vis   = win.viewEnd - win.viewStart;
	const candW = (W - AP) / vis;
	const bodyW = Math.max(1, candW * 0.6);
	const sIdx  = Math.floor(win.viewStart);
	const eIdx  = Math.ceil(win.viewEnd);

    /* ── Price range ── */
    let lo = Infinity, hi = -Infinity;
    slice.forEach(d => { lo = Math.min(lo, d.low); hi = Math.max(hi, d.high); });

    /* Include indicator overlay values in range */
    win.indicators.forEach(ind => {
      if (!ind.enabled || !ind.overlays) return;
      const ov = ind.overlays;
      const chk = arr => { if (!arr) return; for (let i = sIdx; i < eIdx && i < arr.length; i++) { if (arr[i] != null && !isNaN(arr[i])) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } } };
      (ov.smaLines || []).forEach(l => chk(l.values));
      (ov.emaLines || []).forEach(l => chk(l.values));
      (ov.bbands   || []).forEach(b => { chk(b.upper); chk(b.lower); });
      if (ov.vwapLine) chk(ov.vwapLine);
    });

    const rng = hi - lo || 1;
    lo -= rng * 0.05; hi += rng * 0.05;
    win.lo = lo; win.hi = hi;

    /* ── Helpers ── */
    const priceY = p  => 14 + (1 - (p - lo) / (hi - lo)) * (H - 38);
    const xOf    = i  => AP + (i - win.viewStart + 0.5) * candW;

    /* ── Grid & Y-axis ── */
    drawGrid(ctx, W, H, AP, lo, hi, C, priceY);

    /* ── X-axis ── */
    drawXAxis(ctx, W, H, AP, slice, vis, C, sIdx, xOf);
    /* ── Volume bars ── */
    if (win.showVolume) {
	  drawVolume(ctx, W, H, AP, slice, vis, C, candW, sIdx, xOf);
	}

    /* ── Chart body ── */
    switch (win.chartType) {
		case 'line':    drawLine(ctx, slice, C, priceY, xOf, sIdx); break;

		case 'area':    drawArea(ctx, slice, C, priceY, xOf, sIdx, H); break;

		case 'heatmap': drawHeatmap(ctx, W, H, AP, slice, vis, C, priceY, xOf, candW, sIdx); break;

		case 'ohlc':    drawOHLC(ctx, slice, C, priceY, xOf, sIdx, candW); break;

		default:        drawCandles(ctx, slice, candW, bodyW, C, priceY, xOf, sIdx); break;
    }

    /* ── Indicator overlays ── */
    drawIndicatorOverlays(ctx, win, W, H, AP, vis, sIdx, eIdx, candW, lo, hi, priceY, xOf);

    /* ── Drawing tools ── */
    drawTools(ctx, win, W, H, AP, vis, priceY, xOf);

    /* ── Live price line ── */
    drawLiveLine(ctx, win, W, H, AP, priceY, lo, hi);

    /* ── Crosshair & Tooltip ── */
    if (win.mX >= AP && win.mX < W && win.mY >= 0 && win.mY < H) {
      drawCrosshair(ctx, win, W, H, AP, vis, priceY, xOf, lo, hi, C);
    }

    /* ── Indicator badge ── */
    const active = win.indicators.filter(x => x.enabled && x.code && x.code.trim());
    if (active.length) {
      const hasErr = active.some(x => x.error);
      ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = hasErr ? '#ef5350' : '#f0a500';
      ctx.fillText(hasErr ? '⚡ERR' : `⚡${active.length}`, W - 4, 4);
    }

    /* ── Session markers ── */
    drawSessionMarker(ctx, win, W, H, AP, priceY, xOf, C);

    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────
     SUB-DRAW FUNCTIONS
  ───────────────────────────────────────────────────────── */

  function drawGrid(ctx, W, H, AP, lo, hi, C, priceY) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '9px monospace';
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = hi - (hi - lo) * t;
      const y = 14 + (H - 38) * t;
      ctx.fillStyle = C.text2;
      ctx.fillText(p >= 1000 ? p.toFixed(1) : p.toFixed(2), AP - 5, y);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

	function drawXAxis(ctx, W, H, AP, slice, vis, C, sIdx, xOf) {
	  ctx.textAlign = 'center'; 
	  ctx.textBaseline = 'top';
	  ctx.font = '9px monospace'; 
	  ctx.fillStyle = C.text2;

	  const nxt = Math.min(slice.length, 8);

	  for (let i = 0; i <= nxt; i++) {
		const idx = Math.floor(i * (slice.length - 1) / Math.max(nxt, 1));
		if (!slice[idx]) continue;

		const gi = sIdx + idx;
		const x = xOf(gi);

		const dt = new Date(slice[idx].time);
		const lbl = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;

		ctx.fillText(lbl, x, H - 18);

		ctx.strokeStyle = C.grid; 
		ctx.lineWidth = 0.3;

		ctx.beginPath(); 
		ctx.moveTo(x, 14); 
		ctx.lineTo(x, H - 26); 
		ctx.stroke();
	  }
	}

	function drawVolume(ctx, W, H, AP, slice, vis, C, candW, startIndex, xOf) {
	  let maxVol = 1;
		for (let i = 0; i < slice.length; i++) {
		  if (slice[i].volume > maxVol) maxVol = slice[i].volume;
		}
	  const volH = (H - 38) * 0.15;

	  slice.forEach((d, i) => {
		const gi = startIndex + i; // ✅
		const x = xOf(gi);

		const bh = (d.volume / maxVol) * volH;

		ctx.fillStyle = d.close >= d.open
		  ? `rgba(${hexToRgb(C.up)},0.25)`
		  : `rgba(${hexToRgb(C.dn)},0.25)`;

		ctx.fillRect(x - candW * 0.4, H - 26 - bh, candW * 0.8, bh);
	  });
	}

	function drawCandles(ctx, slice, candW, bodyW, C, priceY, xOf, startIndex) {
	  slice.forEach((d, i) => {
		const globalIndex = startIndex + i; // ✅ FIX

		const x  = xOf(globalIndex);
		const yO = priceY(d.open);
		const yH = priceY(d.high);
		const yL = priceY(d.low);
		const yC = priceY(d.close);

		const clr = d.close >= d.open ? C.up : C.dn;

		ctx.strokeStyle = clr;
		ctx.lineWidth = Math.max(0.5, candW * 0.08);

		ctx.beginPath();
		ctx.moveTo(x, yH);
		ctx.lineTo(x, Math.min(yO, yC));
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(x, Math.max(yO, yC));
		ctx.lineTo(x, yL);
		ctx.stroke();

		ctx.fillStyle = clr;
		ctx.fillRect(
		  x - bodyW / 2,
		  Math.min(yO, yC),
		  bodyW,
		  Math.max(1, Math.abs(yC - yO))
		);
	  });
	}

	function drawOHLC(ctx, slice, C, priceY, xOf, startIndex, candW) {
	  slice.forEach((d, i) => {
		const gi = startIndex + i;
		const x = xOf(gi);

		const yO = priceY(d.open);
		const yH = priceY(d.high);
		const yL = priceY(d.low);
		const yC = priceY(d.close);

		const clr = d.close >= d.open ? C.up : C.dn;

		ctx.strokeStyle = clr;
		ctx.lineWidth = 1;

		// vertical line
		ctx.beginPath();
		ctx.moveTo(x, yH);
		ctx.lineTo(x, yL);
		ctx.stroke();

		// open tick (left)
		ctx.beginPath();
		ctx.moveTo(x - candW * 0.3, yO);
		ctx.lineTo(x, yO);
		ctx.stroke();

		// close tick (right)
		ctx.beginPath();
		ctx.moveTo(x, yC);
		ctx.lineTo(x + candW * 0.3, yC);
		ctx.stroke();
	  });
	}

	function drawLine(ctx, slice, C, priceY, xOf, startIndex) {
	  ctx.strokeStyle = C.line;
	  ctx.lineWidth = 2;
	  ctx.beginPath();

	  slice.forEach((d, i) => {
		const gi = startIndex + i;
		const x = xOf(gi);
		const y = priceY(d.close);

		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	  });

	  ctx.stroke();
	}

	function drawArea(ctx, slice, C, priceY, xOf, startIndex, H) {
	  ctx.beginPath();

	  slice.forEach((d, i) => {
		const gi = startIndex + i;
		const x = xOf(gi);
		const y = priceY(d.close);

		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	  });

	  // close area
	  const lastX = xOf(startIndex + slice.length - 1);
	  const firstX = xOf(startIndex);

	  ctx.lineTo(lastX, H);
	  ctx.lineTo(firstX, H);
	  ctx.closePath();

	  ctx.fillStyle = C.areaFill;
	  ctx.fill();
	}

	function drawHeatmap(ctx, W, H, AP, slice, vis, C, priceY, xOf, candW, startIndex) {
	  const maxVol = slice.reduce((m, d) => Math.max(m, d.volume), 0) || 1;

	  slice.forEach((d, i) => {
		const gi = startIndex + i; // ✅ FIX
		const x = xOf(gi);

		const yO = priceY(d.open);
		const yC = priceY(d.close);
		const yCenter = (yO + yC) / 2;

		const vi = Math.pow(d.volume / maxVol, 0.5);
		const radius = candW * 2 + vi * candW * 4;

		const g = ctx.createRadialGradient(x, yCenter, 0, x, yCenter, radius);

		const a = 0.5 + vi * 0.35;
		const [r, gv, b] = d.close >= d.open ? hexToRgbArr(C.up) : hexToRgbArr(C.dn);

		g.addColorStop(0,   `rgba(${r},${gv},${b},${a.toFixed(2)})`);
		g.addColorStop(0.5, `rgba(${r},${gv},${b},${(a * 0.4).toFixed(2)})`);
		g.addColorStop(1,   `rgba(${r},${gv},${b},0)`);

		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(x, yCenter, radius, 0, Math.PI * 2);
		ctx.fill();
	  });
	}

  /* ─── Indicator Overlays ─── */
  function drawIndicatorOverlays(ctx, win, W, H, AP, vis, sIdx, eIdx, candW, lo, hi, priceY, xOf) {
    if (!win.indicators?.length) return;
    const C = window.ThemeManager.C;

    ctx.save();
    let colorIdx = 0;
	const y = priceY(val);
    const drawPolyline = (values, dash) => {
      if (!values?.length) return;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      for (let i = sIdx; i < eIdx && i < values.length; i++) {
        const val = values[i];
        if (val === null || val === undefined || isNaN(val)) { started = false; continue; }
        y = priceY(val);
        // Use absolute xOf with bar-index offset
        const x = xOf(i);
        if (!started) { ctx.moveTo(absX, y); started = true; } else ctx.lineTo(absX, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const edgeLabel = (values, text, color) => {
      let lastV = null;
      for (let i = Math.min(eIdx, values.length) - 1; i >= sIdx; i--) {
        if (values[i] != null && !isNaN(values[i])) { lastV = values[i]; break; }
      }
      if (lastV === null) return;
      ctx.fillStyle = color; ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(text, W - 4, priceY(lastV));
    };

    win.indicators.forEach(ind => {
      if (!ind.enabled) return;
      const ov = ind.overlays;
      if (!ov) return;

      /* SMA */
      (ov.smaLines || []).forEach(line => {
        if (!line?.values?.length) return;
        const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        drawPolyline(line.values);
        edgeLabel(line.values, line.label || 'SMA', col);
      });

      /* EMA */
      (ov.emaLines || []).forEach(line => {
        if (!line?.values?.length) return;
        const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        drawPolyline(line.values, [5, 3]);
        edgeLabel(line.values, line.label || 'EMA', col);
      });

      /* Bollinger Bands */
      (ov.bbands || []).forEach(bb => {
        if (!bb?.upper) return;
        /* Fill band */
        ctx.beginPath();
        let started = false;
        for (let i = sIdx; i < eIdx && i < bb.upper.length; i++) {
          if (bb.upper[i] == null) { started = false; continue; }
          const absX = xOf(i); // ✅ CLEAN + CONSISTENT
          if (!started) { ctx.moveTo(absX, priceY(bb.upper[i])); started = true; }
          else ctx.lineTo(absX, priceY(bb.upper[i]));
        }
        for (let i = Math.min(eIdx, bb.lower.length) - 1; i >= sIdx; i--) {
          if (bb.lower[i] == null) continue;
          ctx.lineTo(xOf(i), priceY(bb.lower[i]));
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(139,92,246,0.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(139,92,246,0.7)'; ctx.lineWidth = 1;
        drawPolyline(bb.upper); drawPolyline(bb.lower);
        ctx.strokeStyle = 'rgba(139,92,246,0.35)'; drawPolyline(bb.mid, [4, 4]);
        edgeLabel(bb.upper, 'BB', 'rgba(139,92,246,0.9)');
      });

      /* VWAP */
      if (ov.vwapLine?.length) {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.6;
        drawPolyline(ov.vwapLine, [6, 3]);
        edgeLabel(ov.vwapLine, 'VWAP', '#f59e0b');
      }

      /* OBV — rescale to price range for display */
      if (ov.obvLine?.length) {
        const slice2 = ov.obvLine.slice(sIdx, eIdx).filter(v => v != null);
        if (slice2.length) {
          const minO = Math.min(...slice2), maxO = Math.max(...slice2);
          const scaleO = v => priceY(lo + (v - minO) / (maxO - minO + 1) * (hi - lo));
          ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 2]);
          ctx.beginPath(); let started = false;
          for (let i = sIdx; i < eIdx && i < ov.obvLine.length; i++) {
            if (ov.obvLine[i] == null) { started = false; continue; }
            const x = xOf(i);
            if (!started) { ctx.moveTo(absX, scaleO(ov.obvLine[i])); started = true; }
            else ctx.lineTo(absX, scaleO(ov.obvLine[i]));
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
      }

      /* Signals (BUY/SELL arrows) */
      if (ind.signals?.length) {
        const C2 = window.ThemeManager.C;
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        for (let i = sIdx; i < eIdx && i < win.data.length && i < ind.signals.length; i++) {
          const sig = ind.signals[i];
          if (!sig?.signal || sig.signal === 'NEUTRAL') continue;
          const d = win.data[i], absX = AP + (i - win.viewStart + 0.5) * candW;
          const isBuy = sig.signal === 'BUY';
          const arrowY = isBuy ? priceY(d.low) + 18 : priceY(d.high) - 18;
          ctx.fillStyle = isBuy ? C2.up : C2.dn;
          ctx.textBaseline = 'middle';
          ctx.fillText(isBuy ? '▲' : '▼', absX, arrowY);
          if (sig.label) {
            ctx.font = '7px monospace';
            ctx.fillText(sig.label, absX, arrowY + (isBuy ? 11 : -11));
            ctx.font = 'bold 11px monospace';
          }
        }
      }
    });

    ctx.restore();
  }

  /* ─── Drawing Tools ─── */
  function drawTools(ctx, win, W, H, AP, vis, priceY, xOf) {
    ctx.save();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5;
    const all = win.tempTool ? [...win.tools, win.tempTool] : win.tools;
    all.forEach(t => {
      const absX1 = AP + (t.i1 - win.viewStart + 0.5) * ((W - AP) / vis);
      const absX2 = AP + (t.i2 - win.viewStart + 0.5) * ((W - AP) / vis);
      if (t.type === 'trendline') {
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(absX1, priceY(t.p1)); ctx.lineTo(absX2, priceY(t.p2)); ctx.stroke();
        ctx.setLineDash([]);
        /* Extend line */
        if (Math.abs(t.i2 - t.i1) > 0) {
          const slope = (t.p2 - t.p1) / (t.i2 - t.i1);
          const ext = slope * (Math.ceil(win.viewEnd) - t.i2);
          ctx.strokeStyle = 'rgba(255,215,0,0.25)'; ctx.lineWidth = 1;
          ctx.setLineDash([2, 6]);
          ctx.beginPath(); ctx.moveTo(absX2, priceY(t.p2)); ctx.lineTo(W, priceY(t.p2 + ext)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5;
        }
      } else if (t.type === 'hline') {
        ctx.setLineDash([5, 5]);
        const y = priceY(t.price);
        ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFD700'; ctx.font = '9px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(t.price.toFixed(2), W - 4, y);
      } else if (t.type === 'rect') {
        ctx.setLineDash([]);
        const y1 = priceY(t.p1), y2 = priceY(t.p2);
        ctx.strokeStyle = 'rgba(255,215,0,0.8)';
        ctx.strokeRect(Math.min(absX1, absX2), Math.min(y1, y2), Math.abs(absX2 - absX1), Math.abs(y2 - y1));
        ctx.fillStyle = 'rgba(255,215,0,0.06)';
        ctx.fillRect(Math.min(absX1, absX2), Math.min(y1, y2), Math.abs(absX2 - absX1), Math.abs(y2 - y1));
      } else if (t.type === 'fib') {
        const pLow = Math.min(t.p1, t.p2), pHigh = Math.max(t.p1, t.p2), range = pHigh - pLow;
        const fibs = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
        const fibColors = ['rgba(255,215,0,0.9)','rgba(255,200,0,0.7)','rgba(255,185,0,0.7)','rgba(255,165,0,0.85)','rgba(255,185,0,0.7)','rgba(255,200,0,0.7)','rgba(255,215,0,0.9)'];
        fibs.forEach((f, fi) => {
          const price = pLow + range * (1 - f);
          const y = priceY(price);
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = fibColors[fi]; ctx.lineWidth = f === 0.618 ? 1.5 : 0.8;
          ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = fibColors[fi]; ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(`${(f * 100).toFixed(1)}%  ${price.toFixed(2)}`, W - 4, y);
        });
      }
    });
    ctx.restore();
  }

  /* ─── Live Price Line ─── */
  function drawLiveLine(ctx, win, W, H, AP, priceY, lo, hi) {
    const C = window.ThemeManager.C;
    if (!win.liveCandle && !win.data.length) return;
    const last = win.liveCandle || win.data[win.data.length - 1];
    const y = priceY(last.close);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px monospace';
    const txt = last.close.toFixed(2);
    const bw = ctx.measureText(txt).width + 12, bh = 16;
    let by = y - bh / 2;
    if (by < 2) by = 2; if (by + bh > H - 2) by = H - bh - 2;
    ctx.fillStyle = C.line;
    roundRect(ctx, 2, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 8, by + bh / 2);
  }

  /* ─── Crosshair ─── */
  function drawCrosshair(ctx, win, W, H, AP, vis, priceY, xOf, lo, hi, C) {
    const mx = win.mX, my = win.mY;
    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,240,0.3)'; ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(mx, 14); ctx.lineTo(mx, H - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(AP, my); ctx.lineTo(W, my); ctx.stroke();
    ctx.setLineDash([]);
    /* Price label at crosshair Y */
    const price = hi - ((my - 14) / (H - 38)) * (hi - lo);
    ctx.fillStyle = 'rgba(60,80,120,0.85)'; ctx.font = '9px monospace';
    const ptxt = price.toFixed(2), pw = ctx.measureText(ptxt).width + 10;
    roundRect(ctx, 2, my - 8, pw, 16, 3); ctx.fill();
    ctx.fillStyle = '#dde3ee'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ptxt, 7, my);
    ctx.restore();
  }

  /* ─── Session open/close markers ─── */
  function drawSessionMarker(ctx, win, W, H, AP, priceY, xOf, C) {
    if (!win.data.length) return;
    const firstBar = win.data[0];
    const openDt = new Date(firstBar.time);
    if (openDt.getHours() === 9 && openDt.getMinutes() === 15) {
      const absX = AP + (0 - win.viewStart + 0.5) * ((W - AP) / (win.viewEnd - win.viewStart));
      if (absX > AP && absX < W) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,217,126,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(absX, 14); ctx.lineTo(absX, H - 26); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(0,217,126,0.7)'; ctx.font = '7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('OPEN', absX, 16);
        ctx.restore();
      }
    }
  }

  /* ─── Helpers ─── */
  function hexToRgb(hex) {
    const r = hexToRgbArr(hex);
    return r ? `${r[0]},${r[1]},${r[2]}` : '128,128,128';
  }
  function hexToRgbArr(hex) {
    const h = (hex || '#888').replace('#', '');
    if (h.length === 3) return h.split('').map(c => parseInt(c + c, 16));
    if (h.length < 6)   return [128, 128, 128];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  return { draw, OVERLAY_COLORS };
})();

window.ChartRenderer = ChartRenderer;
