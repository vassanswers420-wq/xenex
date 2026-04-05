'use strict';

const ChartRenderer = (() => {
  const OVERLAY_COLORS = ['#f59e0b','#a78bfa','#34d399','#fb923c','#60a5fa','#f472b6','#e879f9','#22d3ee'];

  /* ══════════════════════════════════════════════════
     MAIN DRAW
  ══════════════════════════════════════════════════ */
  function draw(win) {
    const { canvas, ctx } = win;
    const dpr  = window.devicePixelRatio || 1;
    const rect  = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
    }

    const W  = rect.width;
    const H  = rect.height;
    const AP = 58;
    const C  = window.ThemeManager.C;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const slice = win.data.slice(Math.floor(win.viewStart), Math.ceil(win.viewEnd));
    if (!slice.length) { ctx.restore(); return; }

    const vis   = win.viewEnd - win.viewStart;
    const candW = (W - AP) / vis;
    const bodyW = Math.max(1, candW * 0.6);
    const sIdx  = Math.floor(win.viewStart);
    const eIdx  = Math.ceil(win.viewEnd);

    /* Price range */
    let lo = Infinity, hi = -Infinity;
    slice.forEach(d => { lo = Math.min(lo, d.low); hi = Math.max(hi, d.high); });

    win.indicators.forEach(ind => {
      if (!ind.enabled || !ind.overlays) return;
      const ov = ind.overlays;
      const chk = arr => {
        if (!arr) return;
        for (let i = sIdx; i < eIdx && i < arr.length; i++) {
          if (arr[i] != null && !isNaN(arr[i])) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); }
        }
      };
      (ov.smaLines || []).forEach(l => chk(l.values));
      (ov.emaLines || []).forEach(l => chk(l.values));
      (ov.bbands   || []).forEach(b => { chk(b.upper); chk(b.lower); });
      if (ov.vwapLine) chk(ov.vwapLine);
    });

    const rng = hi - lo || 1;
    lo -= rng * 0.05; hi += rng * 0.05;

    /* ── Apply price axis zoom (scale) and pan (offset) ── */
    const scale  = win.priceScale  ?? 1.0;
    const offset = win.priceOffset ?? 0;
    const mid    = (hi + lo) / 2 + offset;
    const half   = (hi - lo) / 2 / scale;
    lo = mid - half;
    hi = mid + half;

    win.lo = lo; win.hi = hi;

    const priceY = p => 14 + (1 - (p - lo) / (hi - lo)) * (H - 38);
    const xOf    = i => AP + (i - win.viewStart + 0.5) * candW;

    drawGrid(ctx, W, H, AP, lo, hi, C, priceY);

    /* ── Price axis zoom hint (shows when zoomed/panned) ── */
    if (scale !== 1.0 || offset !== 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(240,165,0,0.18)';
      ctx.fillRect(0, 0, AP - 1, H);
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(240,165,0,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${scale.toFixed(1)}×`, AP / 2, H - 28);
      ctx.restore();
    }
    drawXAxis(ctx, W, H, AP, slice, vis, C, sIdx, xOf);
    if (win.showVolume) drawVolume(ctx, W, H, AP, slice, vis, C, candW, sIdx, xOf);

    switch (win.chartType) {
      case 'line':    drawLine(ctx, slice, C, priceY, xOf, sIdx);            break;
      case 'area':    drawArea(ctx, slice, C, priceY, xOf, sIdx, H);         break;
      case 'heatmap': drawHeatmap(ctx, W, H, AP, slice, vis, C, priceY, xOf, candW, sIdx); break;
      case 'ohlc':    drawOHLC(ctx, slice, C, priceY, xOf, sIdx, candW);     break;
      default:        drawCandles(ctx, slice, candW, bodyW, C, priceY, xOf, sIdx); break;
    }

    drawIndicatorOverlays(ctx, win, W, H, AP, vis, sIdx, eIdx, candW, lo, hi, priceY, xOf);
    drawTools(ctx, win, W, H, AP, vis, priceY, xOf);
    drawLiveLine(ctx, win, W, H, AP, priceY, lo, hi);

    if (win.mX >= AP && win.mX < W && win.mY >= 0 && win.mY < H) {
      drawCrosshair(ctx, win, W, H, AP, vis, priceY, xOf, lo, hi, C);
    }

    /* ── Price axis hover glow + scroll hint ── */
    if (win.mX >= 0 && win.mX < AP && win.mY >= 0 && win.mY < H) {
      ctx.save();
      ctx.fillStyle = 'rgba(240,165,0,0.07)';
      ctx.fillRect(0, 0, AP - 1, H);
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = 'rgba(240,165,0,0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↕', AP / 2, win.mY);
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(240,165,0,0.4)';
      ctx.fillText('scroll=zoom', AP / 2, win.mY + 14);
      ctx.fillText('drag=pan', AP / 2, win.mY + 23);
      ctx.fillText('dbl=reset', AP / 2, win.mY + 32);
      ctx.restore();
    }

    const active = win.indicators.filter(x => x.enabled && x.code && x.code.trim());
    if (active.length) {
      const hasErr = active.some(x => x.error);
      ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = hasErr ? '#ef5350' : '#f0a500';
      ctx.fillText(hasErr ? '⚡ERR' : `⚡${active.length}`, W - 4, 4);
    }

    drawSessionMarker(ctx, win, W, H, AP, priceY, xOf, C);
    ctx.restore();
  }

  /* ══════════════════════════════════════════════════
     SUB-DRAW FUNCTIONS
  ══════════════════════════════════════════════════ */
  function drawGrid(ctx, W, H, AP, lo, hi, C, priceY) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '9px monospace';
    for (let i = 0; i <= 6; i++) {
      const p = hi - (hi - lo) * (i / 6);
      const y = 14 + (H - 38) * (i / 6);
      ctx.fillStyle = C.text2;
      ctx.fillText(p >= 1000 ? p.toFixed(1) : p.toFixed(2), AP - 5, y);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawXAxis(ctx, W, H, AP, slice, vis, C, sIdx, xOf) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '9px monospace'; ctx.fillStyle = C.text2;
    const nxt = Math.min(slice.length, 8);
    for (let i = 0; i <= nxt; i++) {
      const idx = Math.floor(i * (slice.length - 1) / Math.max(nxt, 1));
      if (!slice[idx]) continue;
      const gi = sIdx + idx;
      const x  = xOf(gi);
      const dt = new Date(slice[idx].time);
      const lbl = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      ctx.fillText(lbl, x, H - 18);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, H - 26); ctx.stroke();
    }
  }

  function drawVolume(ctx, W, H, AP, slice, vis, C, candW, startIndex, xOf) {
    let maxVol = 1;
    slice.forEach(d => { if (d.volume > maxVol) maxVol = d.volume; });
    const volH = (H - 38) * 0.15;
    slice.forEach((d, i) => {
      const x  = xOf(startIndex + i);
      const bh = (d.volume / maxVol) * volH;
      ctx.fillStyle = d.close >= d.open
        ? `rgba(${hexToRgb(C.up)},0.25)` : `rgba(${hexToRgb(C.dn)},0.25)`;
      ctx.fillRect(x - candW * 0.4, H - 26 - bh, candW * 0.8, bh);
    });
  }

  function drawCandles(ctx, slice, candW, bodyW, C, priceY, xOf, startIndex) {
    slice.forEach((d, i) => {
      const x  = xOf(startIndex + i);
      const yO = priceY(d.open), yH = priceY(d.high), yL = priceY(d.low), yC = priceY(d.close);
      const clr = d.close >= d.open ? C.up : C.dn;
      ctx.strokeStyle = clr; ctx.lineWidth = Math.max(0.5, candW * 0.08);
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, Math.min(yO, yC)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, Math.max(yO, yC)); ctx.lineTo(x, yL); ctx.stroke();
      ctx.fillStyle = clr;
      ctx.fillRect(x - bodyW / 2, Math.min(yO, yC), bodyW, Math.max(1, Math.abs(yC - yO)));
    });
  }

  function drawOHLC(ctx, slice, C, priceY, xOf, startIndex, candW) {
    slice.forEach((d, i) => {
      const x  = xOf(startIndex + i);
      const yO = priceY(d.open), yH = priceY(d.high), yL = priceY(d.low), yC = priceY(d.close);
      const clr = d.close >= d.open ? C.up : C.dn;
      ctx.strokeStyle = clr; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - candW * 0.3, yO); ctx.lineTo(x, yO); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, yC); ctx.lineTo(x + candW * 0.3, yC); ctx.stroke();
    });
  }

  function drawLine(ctx, slice, C, priceY, xOf, startIndex) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath();
    slice.forEach((d, i) => {
      const x = xOf(startIndex + i), y = priceY(d.close);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawArea(ctx, slice, C, priceY, xOf, startIndex, H) {
    ctx.beginPath();
    slice.forEach((d, i) => {
      const x = xOf(startIndex + i), y = priceY(d.close);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(startIndex + slice.length - 1), H);
    ctx.lineTo(xOf(startIndex), H);
    ctx.closePath();
    ctx.fillStyle = C.areaFill; ctx.fill();
  }

  function drawHeatmap(ctx, W, H, AP, slice, vis, C, priceY, xOf, candW, startIndex) {
    const maxVol = slice.reduce((m, d) => Math.max(m, d.volume), 0) || 1;
    slice.forEach((d, i) => {
      const x  = xOf(startIndex + i);
      const yO = priceY(d.open), yC = priceY(d.close);
      const yCenter = (yO + yC) / 2;
      const vi = Math.pow(d.volume / maxVol, 0.5);
      const radius = candW * 2 + vi * candW * 4;
      const g = ctx.createRadialGradient(x, yCenter, 0, x, yCenter, radius);
      const a = 0.5 + vi * 0.35;
      const [r, gv, b] = hexToRgbArr(d.close >= d.open ? C.up : C.dn);
      g.addColorStop(0,   `rgba(${r},${gv},${b},${a.toFixed(2)})`);
      g.addColorStop(0.5, `rgba(${r},${gv},${b},${(a * 0.4).toFixed(2)})`);
      g.addColorStop(1,   `rgba(${r},${gv},${b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, yCenter, radius, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* ══════════════════════════════════════════════════
     INDICATOR OVERLAYS
  ══════════════════════════════════════════════════ */
  function drawIndicatorOverlays(ctx, win, W, H, AP, vis, sIdx, eIdx, candW, lo, hi, priceY, xOf) {
    if (!win.indicators?.length) return;
    const C = window.ThemeManager.C;
    ctx.save();
    let colorIdx = 0;

    const drawPolyline = (values, dash) => {
      if (!values?.length) return;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      for (let i = sIdx; i < eIdx && i < values.length; i++) {
        const val = values[i];
        if (val === null || val === undefined || isNaN(val)) { started = false; continue; }
        const y = priceY(val);
        const x = xOf(i);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
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
      ctx.fillStyle = color; ctx.font = '8px monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(text, W - 4, priceY(lastV));
    };

    win.indicators.forEach(ind => {
      if (!ind.enabled) return;
      const ov = ind.overlays;
      if (!ov) return;

      /* Only draw SMA/EMA/BB overlays if this indicator has no signals
         (pure overlay indicators like SMA Cross). Signal-based indicators
         like MomentumLaser use these internally for logic only — skip them. */
      const hasAnySignal = ind.signals?.some(s => s?.signal && s.signal !== 'NEUTRAL');

      /* SMA lines */
      if (!hasAnySignal) (ov.smaLines || []).forEach(line => {
        if (!line?.values?.length) return;
        const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        drawPolyline(line.values);
        edgeLabel(line.values, line.label || 'SMA', col);
      });

      /* EMA lines */
      if (!hasAnySignal) (ov.emaLines || []).forEach(line => {
        if (!line?.values?.length) return;
        const col = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        drawPolyline(line.values, [5, 3]);
        edgeLabel(line.values, line.label || 'EMA', col);
      });

      /* Bollinger Bands */
      if (!hasAnySignal) (ov.bbands || []).forEach(bb => {
        if (!bb?.upper) return;
        ctx.beginPath();
        let started = false;
        for (let i = sIdx; i < eIdx && i < bb.upper.length; i++) {
          if (bb.upper[i] == null) { started = false; continue; }
          const x = xOf(i);
          if (!started) { ctx.moveTo(x, priceY(bb.upper[i])); started = true; }
          else ctx.lineTo(x, priceY(bb.upper[i]));
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
      if (!hasAnySignal && ov.vwapLine?.length) {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.6;
        drawPolyline(ov.vwapLine, [6, 3]);
        edgeLabel(ov.vwapLine, 'VWAP', '#f59e0b');
      }

      /* OBV — rescaled to price range */
      if (!hasAnySignal && ov.obvLine?.length) {
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
            if (!started) { ctx.moveTo(x, scaleO(ov.obvLine[i])); started = true; }
            else ctx.lineTo(x, scaleO(ov.obvLine[i]));
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
      }

      /* ── BUY/SELL arrows ── */
      if (ind.signals?.length) {
        const C2 = window.ThemeManager.C;
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        for (let i = sIdx; i < eIdx && i < win.data.length && i < ind.signals.length; i++) {
          const sig = ind.signals[i];
          if (!sig?.signal || sig.signal === 'NEUTRAL') continue;
          const d = win.data[i];
          const x = xOf(i);
          const isBuy  = sig.signal === 'BUY';
          const arrowY = isBuy ? priceY(d.low) + 18 : priceY(d.high) - 18;
          ctx.fillStyle    = isBuy ? C2.up : C2.dn;
          ctx.textBaseline = 'middle';
          ctx.fillText(isBuy ? '▲' : '▼', x, arrowY);
          if (sig.label) {
            ctx.font = '7px monospace';
            ctx.fillText(sig.label, x, arrowY + (isBuy ? 11 : -11));
            ctx.font = 'bold 11px monospace';
          }
        }
      }

      /* ════════════════════════════════════════════
         TARGET BOX — draws only the target zone box
         for any indicator that emits BUY/SELL signals.
         No beam, no glow, no pulse ring.
      ════════════════════════════════════════════ */
      if (ind.signals?.length) {
        const LASER_BARS = 12;

        for (let i = sIdx; i < eIdx && i < win.data.length && i < ind.signals.length; i++) {
          const sig = ind.signals[i];
          if (!sig?.signal || sig.signal === 'NEUTRAL') continue;

          const isBuy = sig.signal === 'BUY';
          const d     = win.data[i];

          /* inline ATR for target distance */
          let atrVal = 0, atrCount = 0;
          for (let j = Math.max(0, i - 14); j <= i; j++) {
            const prev = j > 0 ? win.data[j - 1].close : win.data[j].close;
            atrVal += Math.max(
              win.data[j].high - win.data[j].low,
              Math.abs(win.data[j].high - prev),
              Math.abs(win.data[j].low  - prev)
            );
            atrCount++;
          }
          const atrPx    = atrCount > 0 ? atrVal / atrCount : (d.high - d.low);
          const tgtPrice = isBuy ? d.close + atrPx * 2.2 : d.close - atrPx * 2.2;
          const tgtHalf  = atrPx * 0.6;

          const tgtBarI  = Math.min(i + LASER_BARS, win.data.length - 1);
          const tgtX     = xOf(tgtBarI);
          const tgtY     = priceY(tgtPrice);
          const tgtTop   = priceY(tgtPrice + tgtHalf);
          const tgtBot   = priceY(tgtPrice - tgtHalf);
          const rectH    = Math.abs(tgtBot - tgtTop);
          const rectW    = Math.max(candW * 4, 44);

          if (tgtX < AP || tgtX > W + rectW) continue;

          const laserCol = isBuy ? '#00d97e' : '#ff4757';
          const fillA    = isBuy ? 'rgba(0,217,126,0.09)'  : 'rgba(255,71,87,0.09)';
          const bordA    = isBuy ? 'rgba(0,217,126,0.70)'  : 'rgba(255,71,87,0.70)';

          const rx_x = tgtX - rectW / 2;
          const rx_y = Math.min(tgtTop, tgtBot);

          const srcX = xOf(i);
          const srcY = isBuy ? priceY(d.low) - 22 : priceY(d.high) + 22;

          /* dotted beam line — no glow, just the core dashed line */
          ctx.save();
          ctx.strokeStyle = laserCol;
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.globalAlpha = 0.88;
          ctx.beginPath();
          ctx.moveTo(srcX, srcY);
          ctx.lineTo(rx_x, tgtY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.restore();

          /* origin dot */
          ctx.save();
          ctx.fillStyle = laserCol;
          ctx.beginPath(); ctx.arc(srcX, srcY, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

          /* target rectangle */
          ctx.save();
          ctx.fillStyle   = fillA;
          ctx.strokeStyle = bordA;
          ctx.lineWidth   = 1.4;
          roundRect(ctx, rx_x, rx_y, rectW, rectH, 4);
          ctx.fill(); ctx.stroke();

          /* target price text */
          ctx.fillStyle    = laserCol;
          ctx.font         = 'bold 9px monospace';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tgtPrice.toFixed(1), tgtX, tgtY);

          /* "TARGET" micro label above box */
          ctx.font      = '7px monospace';
          ctx.fillStyle = bordA;
          ctx.fillText('TARGET', tgtX, rx_y - 7);

          /* mid-line inside box */
          ctx.strokeStyle = bordA;
          ctx.lineWidth   = 0.5;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(rx_x + 4, tgtY);
          ctx.lineTo(rx_x + rectW - 4, tgtY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
      /* ── end target box ── */
    });

    ctx.restore();
  }

  /* ══════════════════════════════════════════════════
     DRAWING TOOLS
  ══════════════════════════════════════════════════ */
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
        if (Math.abs(t.i2 - t.i1) > 0) {
          const slope = (t.p2 - t.p1) / (t.i2 - t.i1);
          const ext   = slope * (Math.ceil(win.viewEnd) - t.i2);
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
        ctx.fillStyle = '#FFD700'; ctx.font = '9px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
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
          ctx.fillStyle = fibColors[fi]; ctx.font = '8px monospace';
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(`${(f * 100).toFixed(1)}%  ${price.toFixed(2)}`, W - 4, y);
        });
      }
    });
    ctx.restore();
  }

  /* ══════════════════════════════════════════════════
     LIVE PRICE LINE
  ══════════════════════════════════════════════════ */
  function drawLiveLine(ctx, win, W, H, AP, priceY, lo, hi) {
    const C = window.ThemeManager.C;
    if (!win.liveCandle && !win.data.length) return;
    const last = win.liveCandle || win.data[win.data.length - 1];
    const y    = priceY(last.close);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(AP, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px monospace';
    const txt = last.close.toFixed(2);
    const bw  = ctx.measureText(txt).width + 12, bh = 16;
    let by    = y - bh / 2;
    if (by < 2) by = 2; if (by + bh > H - 2) by = H - bh - 2;
    ctx.fillStyle = C.line;
    roundRect(ctx, 2, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 8, by + bh / 2);
  }

  /* ══════════════════════════════════════════════════
     CROSSHAIR
  ══════════════════════════════════════════════════ */
  function drawCrosshair(ctx, win, W, H, AP, vis, priceY, xOf, lo, hi, C) {
    const mx = win.mX, my = win.mY;
    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,240,0.3)'; ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(mx, 14); ctx.lineTo(mx, H - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(AP, my); ctx.lineTo(W, my); ctx.stroke();
    ctx.setLineDash([]);
    const price = hi - ((my - 14) / (H - 38)) * (hi - lo);
    ctx.fillStyle = 'rgba(60,80,120,0.85)'; ctx.font = '9px monospace';
    const ptxt = price.toFixed(2), pw = ctx.measureText(ptxt).width + 10;
    roundRect(ctx, 2, my - 8, pw, 16, 3); ctx.fill();
    ctx.fillStyle = '#dde3ee'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ptxt, 7, my);
    ctx.restore();
  }

  /* ══════════════════════════════════════════════════
     SESSION MARKER
  ══════════════════════════════════════════════════ */
  function drawSessionMarker(ctx, win, W, H, AP, priceY, xOf, C) {
    if (!win.data.length) return;
    const firstBar = win.data[0];
    const openDt   = new Date(firstBar.time);
    if (openDt.getHours() === 9 && openDt.getMinutes() === 15) {
      const absX = AP + (0 - win.viewStart + 0.5) * ((W - AP) / (win.viewEnd - win.viewStart));
      if (absX > AP && absX < W) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,217,126,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(absX, 14); ctx.lineTo(absX, H - 26); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,217,126,0.7)'; ctx.font = '7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('OPEN', absX, 16);
        ctx.restore();
      }
    }
  }

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */
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