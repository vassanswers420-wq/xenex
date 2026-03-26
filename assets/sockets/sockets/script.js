const themes = {
    dark: {
        bg: "#050505",
        grid: "#222",
        text: "#aaa",
        candleUp: "#00ff66",
        candleDown: "#ff4444"
    },
	midnight: {
		bg: "#ffffff",          // pure white background
		grid: "#afadad",        // light grid lines
		text: "#333333",        // dark readable text
		candleUp: "#16a34a",    // clean green (not neon)
		candleDown: "#dc2626"   // clean red
	},
    graphite: {
        bg: "#1a1a1a",
        grid: "#333",
        text: "#ccc",
        candleUp: "#66ff99",
        candleDown: "#ff6666"
    },
    dusk: {
        bg: "#1a0f1a",
        grid: "#332244",
        text: "#cc99ff",
        candleUp: "#66ffcc",
        candleDown: "#ff6699"
    }
};
let currentTheme = 'dark';
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const symbolSelect = document.getElementById('symbolSelect');
const tooltip = document.getElementById('tooltip');

let candles=[], offsetX=0, offsetY=0, candleWidth=8, isDragging=false, dragStartX=0, dragStartY=0, blinkVisible=true;
let smtBlink = 0;
let hoveredCandleIndex=null;
let autoScrollEnabled = true;
document.getElementById('autoScrollToggle').checked = true;
let idleTimer = null;
let priceZoom = 1; // vertical zoom factor
const idleDelay = 2000; // 5 seconds
let allCandles = []; // raw 1-min candles
let currentTF = 1;   // default timeframe
let alpBlink = 0;

const smaToggle = document.getElementById('smaToggle');
const smaPeriod = document.getElementById('smaPeriod');
const emaToggle = document.getElementById('emaToggle');
const emaPeriod = document.getElementById('emaPeriod');
const vwapToggle = document.getElementById('vwapToggle');


// ----------------------------
// Fetch symbols
async function loadSymbols(){
    try{
        const res = await fetch('https://nse-market-engine.vassanswers420.workers.dev/symbols');
        const symbols = await res.json();
        symbolSelect.innerHTML = '';
        symbols.forEach(s => { 
            const opt = document.createElement('option'); opt.value=s; opt.textContent=s;
            symbolSelect.appendChild(opt);
        });
        loadCandles(symbols[0]);
    }catch(e){ console.error(e); }
}

// ----------------------------
// Fetch candles
async function loadCandles(symbol){
    try{
        const res = await fetch(`https://nse-market-engine.vassanswers420.workers.dev?symbol=${symbol}`);
        allCandles = (await res.json()).map(c => ({
			...c,
			open: +c.open,
			high: +c.high,
			low: +c.low,
			close: +c.close,
			volume: +c.volume,
			time: +c.time
		}));
		currentTF = parseInt(document.getElementById('tfSelect').value) || 1;
		candles = aggregateCandles();     // build candles array for selected TF

        // Auto-scroll to newest candle in the MIDDLE of canvas
        const spacing = candleWidth * 1.5;
        const lastIndex = candles.length - 1;

        // Compute targetOffset so last candle is centered
        const targetOffset = canvas.width/2 - (80 + lastIndex * spacing); 
        smoothScrollTo(targetOffset, 700); // 700ms animation
    }catch(e){ console.error(e); }
}
function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - document.querySelector("header").offsetHeight;
    drawChart();
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", resizeCanvas);


// --- Aggregate candles function ---
function aggregateCandles() {
    const tf = currentTF;

    if (tf === 1) return allCandles;

    const aggregated = [];
    let current = null;
    let count = 0;

    for (let i = 0; i < allCandles.length; i++) {
        const c = allCandles[i];

        if (!current) {
            current = {
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                time: c.time,
                volume: c.volume
            };
            count = 1;
        } else {
            current.high = Math.max(current.high, c.high);
            current.low = Math.min(current.low, c.low);
            current.close = c.close;
            current.volume += c.volume;
            count++;
        }

        if (count === tf) {
            aggregated.push(current);
            current = null;
            count = 0;
        }
    }

    if (current) {
        aggregated.push(current);
    }

    return aggregated;
}

// --- Live update interval (only once) ---
setInterval(() => {
    if(currentTF > 1){
        candles = aggregateCandles();
        drawChart();
    }
}, 1000);

// --- TF selector listener ---
const tfSelect = document.getElementById('tfSelect');
tfSelect.addEventListener('change', e => {

    currentTF = parseInt(e.target.value) || 1;

    candles = aggregateCandles();

    // 🔥 AUTO CENTER ON LATEST CANDLE
    scrollToLatestCandle();

});
// ----------------------------
// Gear menus
const gear = document.getElementById('gear'), settingsMenu = document.getElementById('settingsMenu');
gear.addEventListener('click', ()=>settingsMenu.classList.toggle('show'));
document.addEventListener('click', e=>{ if(!settingsMenu.contains(e.target) && !gear.contains(e.target)) settingsMenu.classList.remove('show'); });

// ----------------------------
// Theme change
document.getElementById('themeSelect').addEventListener('change', e=>{
    currentTheme=e.target.value; drawChart();
});

// ----------------------------
// Symbol change
symbolSelect.addEventListener('change', e=>loadCandles(e.target.value));

// ----------------------------
// Drag & Zoom
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    canvas.style.cursor = 'grabbing';
});canvas.addEventListener('mouseup', ()=>{ isDragging=false; canvas.style.cursor=hoveredCandleIndex!==null?'crosshair':'grab'; });
canvas.addEventListener('mouseleave', ()=>{ isDragging=false; canvas.style.cursor='grab'; hoveredCandleIndex=null; tooltip.style.display='none'; drawChart(); });
canvas.addEventListener('mousemove', e => {
	const padding = {top:50, bottom:50, left:80, right:20};
	const volumeHeight = 50;
	const chartHeight = canvas.height - padding.top - padding.bottom - volumeHeight;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

	if (isDragging) {

		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		offsetX += dx;

		// apply vertical drag
		// scale drag relative to zoom
		offsetY += dy / priceZoom;

		// calculate visible range
		// calculate full price range
		const priceMin = Math.min(...candles.map(c => c.low));
		const priceMax = Math.max(...candles.map(c => c.high));
		const fullRange = priceMax - priceMin;

		// visible range after zoom
		const visibleRange = fullRange / priceZoom;

		const maxOffsetY = chartHeight * priceZoom;
		offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

		dragStartX = e.clientX;
		dragStartY = e.clientY;

		drawChart();
		return;
	}
    // --- Hover candle ---
    const spacing=candleWidth*1.5;
    const firstVisible=Math.max(0, Math.floor(-offsetX/spacing));
    const lastVisible=Math.min(candles.length, Math.ceil((canvas.width - 80 - offsetX)/spacing));
    let nearestDist=Infinity, nearestIndex=null;

    for(let i=firstVisible;i<lastVisible;i++){
        const x=80 + i*spacing + offsetX;
        const dist=Math.abs(x-mouseX);
        if(dist<nearestDist){ nearestDist=dist; nearestIndex=i; }
    }
    if(nearestIndex!==null && nearestDist<spacing){
        hoveredCandleIndex=nearestIndex;
        const c=candles[nearestIndex];
        const d=new Date(c.time*1000);
        tooltip.innerHTML=`<strong>${symbolSelect.value}</strong><br>Time: ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}<br>O:${c.open}<br>H:${c.high}<br>L:${c.low}<br>C:${c.close}`;
        tooltip.style.left=(e.clientX+15)+'px';
        tooltip.style.top=(e.clientY+15)+'px';
        tooltip.style.display='block';
    } else { hoveredCandleIndex=null; tooltip.style.display='none'; }
    drawChart();
});
canvas.addEventListener('wheel', e => {

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const padding = {left:80,right:20};

    // --- If cursor over price axis ---
    if(mouseX < padding.left){

		const priceZoomFactor = 1.03; // 3% per tick
		if(e.deltaY < 0){
			priceZoom = Math.min(priceZoom * priceZoomFactor, 10);
		}else{
			priceZoom = Math.max(priceZoom / priceZoomFactor, 0.5);
		}

        drawChart();
        return;
    }

    // --- Normal time zoom ---
    const oldSpacing = candleWidth * 1.5;

	const zoomFactor = 1.05; // 5% per scroll tick
	if (e.deltaY < 0) {
		candleWidth = Math.min(candleWidth * zoomFactor, 30);
	} else {
		candleWidth = Math.max(candleWidth / zoomFactor, 2);
	}

    const newSpacing = candleWidth * 1.5;

    offsetX = mouseX - ((mouseX - offsetX) * newSpacing / oldSpacing);

    drawChart();

});
/* =========================
   MOBILE TOUCH DRAG SUPPORT
========================= */

canvas.addEventListener("touchstart", e=>{
    const touch = e.touches[0];
    isDragging = true;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
});
canvas.addEventListener("touchmove", e=>{
    e.preventDefault();

    if(e.touches.length === 1){
        const touch = e.touches[0];

        const dx = touch.clientX - dragStartX;
        const dy = touch.clientY - dragStartY;

        const dragDamping = 0.9;
		offsetX += dx * dragDamping;
		offsetY += dy * dragDamping;

        dragStartX = touch.clientX;
        dragStartY = touch.clientY;

        drawChart();
    }

	if(e.touches.length === 2){

		const t1 = e.touches[0];
		const t2 = e.touches[1];

		const dx = t1.clientX - t2.clientX;
		const dy = t1.clientY - t2.clientY;

		const distance = Math.sqrt(dx*dx + dy*dy);

		const rect = canvas.getBoundingClientRect();
		const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;

		if(lastPinchDistance){

			const scale = distance / lastPinchDistance;

			const horizontalStrength = Math.abs(dx);
			const verticalStrength = Math.abs(dy);

			// -------- PRICE ZOOM --------
			if(verticalStrength > horizontalStrength){

				const zoomSpeed = 0.2;

				if(scale > 1){
					priceZoom *= 1 + (scale - 1) * zoomSpeed;
				}else{
					priceZoom /= 1 + (1 - scale) * zoomSpeed;
				}

				priceZoom = Math.min(Math.max(priceZoom,0.5),10);

			}
			// -------- TIME ZOOM --------
			else{

				const oldSpacing = candleWidth * 1.5;

				const zoomSpeed = 0.2;
				candleWidth *= 1 + (scale - 1) * zoomSpeed;

				candleWidth = Math.min(Math.max(candleWidth,2),30);

				const newSpacing = candleWidth * 1.5;

				offsetX = centerX - ((centerX - offsetX) * newSpacing / oldSpacing);
			}

			drawChart();
		}

		lastPinchDistance = distance;
	}
});

canvas.addEventListener("touchend", ()=>{
    isDragging = false;
});
let lastPinchDistance = null;



canvas.addEventListener("touchend", ()=>{
    lastPinchDistance = null;
});

// Indicator event listeners
[smaToggle,smaPeriod,emaToggle,emaPeriod,vwapToggle].forEach(el=>el.addEventListener('input', drawChart));
setInterval(()=>{ if(symbolSelect.value) loadCandles(symbolSelect.value); }, 60000);

// ----------------------------
// Indicators calculation
function calculateSMA(period){ const sma=[]; for(let i=0;i<candles.length;i++){ if(i<period-1){sma.push(null); continue;} let sum=0; for(let j=0;j<period;j++) sum+=candles[i-j].close; sma.push(sum/period);} return sma; }
function calculateEMA(period){ const ema=[]; const k=2/(period+1); let prev=candles[0]?.close||0; for(let i=0;i<candles.length;i++){ prev=i===0?candles[i].close:candles[i].close*k + prev*(1-k); ema.push(prev);} return ema; }
function calculateVWAP(){ let cumPV=0, cumVol=0; const vwap=[]; candles.forEach(c=>{ const tp=(c.high+c.low+c.close)/3; cumPV+=tp*c.volume; cumVol+=c.volume; vwap.push(cumPV/cumVol);}); return vwap; }
function drawIndicator(values,color){
    if(!values || values.length===0) return;
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath();
    const spacing=candleWidth*1.5, padding={top:50,bottom:50,left:80,right:20}, volumeHeight=50;
    const chartHeight=canvas.height-padding.top-padding.bottom-volumeHeight;
	const maxOffsetY = chartHeight;
	offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));
    const priceMax=Math.max(...candles.map(c=>c.high)), priceMin=Math.min(...candles.map(c=>c.low));
	const visibleRange = (priceMax - priceMin) / priceZoom;

	const scaleY = price =>
		padding.top +
		(priceMax - price) * chartHeight / visibleRange +
		offsetY;
    let firstVisible=Math.max(0,Math.floor(-offsetX/spacing)), lastVisible=Math.min(candles.length, Math.ceil((canvas.width-padding.left-offsetX)/spacing));
    values.forEach((val,i)=>{
        if(val===null || i<firstVisible || i>lastVisible) return;
        const x=padding.left+i*spacing+offsetX, y=scaleY(val);
        if(i===firstVisible || values[i-1]===null) ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
    });
    ctx.stroke();
}

// ----------------------------
// autoscroll
function smoothScrollTo(targetOffset, duration = 500) {
    const startOffset = offsetX;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1); // progress 0 → 1
        // easeOutQuad easing for smooth effect
        const easedT = 1 - (1 - t) * (1 - t);
        offsetX = startOffset + (targetOffset - startOffset) * easedT;
        drawChart();
        if (t < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
// ----------------------------
// FULL drawChart
function drawChart(){
	if(!candles || candles.length===0) return;
    const theme=themes[currentTheme], padding={top:50,bottom:50,left:80,right:20}, volumeHeight=50;
    const chartHeight=canvas.height-padding.top-padding.bottom-volumeHeight, chartWidth=canvas.width-padding.left-padding.right;
	const maxOffsetY = chartHeight;
	offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));   
   const spacing=candleWidth*1.5;
	smtBlink += 0.1;
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0,0,canvas.width,canvas.height);

    // Price & volume ranges
    let priceMin = Math.min(...candles.map(c=>c.low));
	let priceMax = Math.max(...candles.map(c=>c.high));

	if(priceMax - priceMin < 0.0001){
		priceMax += 1;
		priceMin -= 1;
	}
    const volMax=Math.max(...candles.map(c=>c.volume||0));
	const visibleRange = (priceMax - priceMin) / priceZoom;

	const scaleY = price =>
		padding.top +
		(priceMax - price) * chartHeight / visibleRange +
		offsetY;
    const scaleVol=vol=> (vol||0)*volumeHeight/volMax;

	// Grid & price labels (dynamic with zoom & pan)

	ctx.strokeStyle = theme.grid;
	ctx.lineWidth = 0.5;

	ctx.fillStyle = theme.text;
	ctx.textAlign = 'right';
	ctx.font = '12px Arial';

	// adjust for vertical pan
	const visibleMax = priceMax + (offsetY / chartHeight) * visibleRange;
	const visibleMin = visibleMax - visibleRange;

	const steps = 8;
	const step = visibleRange / steps;

	for(let i=0;i<=steps;i++){

		const priceValue = visibleMin + step * i;
		const y = padding.top + (visibleMax - priceValue) * chartHeight / visibleRange;

		ctx.beginPath();
		ctx.moveTo(padding.left, y);
		ctx.lineTo(canvas.width - padding.right, y);
		ctx.stroke();

		ctx.fillText(priceValue.toFixed(2), padding.left - 10, y + 3);
	}
    ctx.strokeStyle=theme.text; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padding.left-5,padding.top); ctx.lineTo(padding.left-5,canvas.height-padding.bottom); ctx.stroke();

	// --- Clipping (keep this part) ---
	const chartTop = padding.top;
	const chartBottom = canvas.height - padding.bottom - volumeHeight;
	const chartLeft = padding.left;
	const chartRight = canvas.width - padding.right;

	ctx.save();
	ctx.beginPath();
	ctx.rect(chartLeft, chartTop, chartRight - chartLeft, chartBottom - chartTop);
	ctx.clip();

	// --- NEW CLEAN SYSTEM ---
	const scales = {
    scaleX: i => padding.left + i * spacing + offsetX,
    scaleY: scaleY
};
	const range = getVisibleRange(chartWidth, spacing);

	drawCandles(ctx, scales, range, theme);

	ctx.restore();
	// Flashing stroke for the latest candle
	if(candles.length > 0 && blinkVisible) {
		const latestIndex = candles.length - 1;
		const c = candles[latestIndex];
		const x = padding.left + latestIndex * spacing + offsetX;
		const yOpen = scaleY(c.open), yClose = scaleY(c.close);

		ctx.strokeStyle = '#8B0000'; // dark red flash
		ctx.lineWidth = 2;
		ctx.strokeRect(x - candleWidth / 2 - 2, Math.min(yOpen, yClose) - 2, candleWidth + 4, Math.max(Math.abs(yClose - yOpen), 1) + 4);
	}
    ctx.strokeStyle=theme.grid; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(padding.left,canvas.height-padding.bottom-volumeHeight); ctx.lineTo(canvas.width-padding.right,canvas.height-padding.bottom-volumeHeight); ctx.stroke();

	// Time labels (allow labels even for offscreen candles)
	ctx.fillStyle = theme.text;
	ctx.textAlign = 'center';
	ctx.font = '10px Arial';

	let lastX = -Infinity;
	let lastDay = null;
	const minLabelSpacing = 50;

	for (let i = 0; i < candles.length; i++) {

		const c = candles[i];

		if (!c.time) continue; // ✅ FIX

		const x = padding.left + i * spacing + offsetX;

		if (x < padding.left - 20 || x > canvas.width - padding.right + 20) continue;
		if (x - lastX < minLabelSpacing) continue;

		const d = new Date(c.time * 1000);
		if (isNaN(d)) continue; // ✅ FIX

		const dayKey = d.toDateString();

		let label;

		if (dayKey !== lastDay) {
			label = `${d.getDate()}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
			lastDay = dayKey;
		} else {
			label = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
		}

		lastX = x;

		ctx.fillText(label, x, canvas.height - padding.bottom + 15);
	}

	// Indicators
	if(smaToggle.checked) drawIndicator(calculateSMA(parseInt(smaPeriod.value)),'#FFD700');
	if(emaToggle.checked) drawIndicator(calculateEMA(parseInt(emaPeriod.value)),'#1E90FF');
	if(vwapToggle.checked) drawIndicator(calculateVWAP(),'#00FFFF');

	updateSupportResistance();
	drawSMTFlash();
	drawALPZone();
    // Hover marker
    if(hoveredCandleIndex!==null && blinkVisible){
        const x=padding.left+hoveredCandleIndex*spacing+offsetX;
        const c=candles[hoveredCandleIndex];
        const y=scaleY(c.high)-8;
        ctx.fillStyle='red'; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
    }
}


// --- Blink interval
setInterval(()=>{ 
    blinkVisible = !blinkVisible;
    alpBlink += 0.15;   // animation for ALP zone
    drawChart(); 
},500);

// Initialize
loadSymbols();

const autoScrollToggle = document.getElementById('autoScrollToggle');
autoScrollToggle.addEventListener('change', e => {
    autoScrollEnabled = e.target.checked;
    if(autoScrollEnabled) resetIdleTimer();
});


// Call resetIdleTimer on user actions:
canvas.addEventListener('mousemove', resetIdleTimer);
canvas.addEventListener('mousedown', resetIdleTimer);
canvas.addEventListener('wheel', resetIdleTimer);
symbolSelect.addEventListener('change', resetIdleTimer);
document.getElementById('themeSelect').addEventListener('change', resetIdleTimer);
function scrollToLatestCandle() {

    if(candles.length === 0) return;

    const spacing = candleWidth * 1.5;
    const lastIndex = candles.length - 1;

    const padding = { top:50, bottom:50, left:80, right:20 };
    const volumeHeight = 50;

    const chartHeight = canvas.height - padding.top - padding.bottom - volumeHeight;

    const last = candles[lastIndex];

    const priceMin = Math.min(...candles.map(c=>c.low));
    const priceMax = Math.max(...candles.map(c=>c.high));

    const candleMiddlePrice = (last.high + last.low) / 2;

    const visibleRange = (priceMax - priceMin) / priceZoom;

    const targetOffsetX = canvas.width/2 - (padding.left + lastIndex * spacing);

    const targetOffsetY =
        canvas.height/2 -
        (
            padding.top +
            (priceMax - candleMiddlePrice) * chartHeight / visibleRange
        );

    smoothScrollToXY(targetOffsetX, targetOffsetY, 700);
}
function resetIdleTimer() {
    if(idleTimer) clearTimeout(idleTimer);
    if(!autoScrollEnabled) return;
    idleTimer = setTimeout(() => {
        scrollToLatestCandle(); // reuse smoothScrollTo
    }, idleDelay);
}
function smoothScrollToXY(targetX, targetY, duration = 500) {
    const startX = offsetX;
    const startY = offsetY;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const easedT = 1 - (1 - t) * (1 - t); // easeOutQuad

        offsetX = startX + (targetX - startX) * easedT;
        offsetY = startY + (targetY - startY) * easedT;
        drawChart();

        if(t < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}





function calculateSupportResistance(data, maxLevels = 3, tolerance = 0.002) {

    let levels = [];

    // detect pivots
    for (let i = 2; i < data.length - 2; i++) {

        let high = data[i].high;
        let low = data[i].low;

        if (
				high > data[i-1].high &&
				high > data[i-2].high &&
				high > data[i+1].high &&
				high > data[i+2].high
				) {
            levels.push({price: high, touches: 0});
        }

        if (
			low < data[i-1].low &&
			low < data[i-2].low &&
			low < data[i+1].low &&
			low < data[i+2].low
			) {
            levels.push({price: low, touches: 0});
        }
    }

    // count touches
    levels.forEach(level => {

        data.forEach(candle => {

            let tol = level.price * tolerance;

            if (
                candle.high >= level.price - tol &&
                candle.low <= level.price + tol
            ) {
                level.touches++;
            }

        });

    });

    // sort strongest first
    levels.sort((a,b)=>b.touches - a.touches);

    // return only strongest
    return levels.slice(0, maxLevels);
}


function getSRSettings(){

return {

enabled: document.getElementById("srToggle").checked,

maxLevels: parseInt(
document.getElementById("srLevels").value
),

minTouches: parseInt(
document.getElementById("srTouches").value
),

tolerance: parseFloat(
document.getElementById("srTolerance").value
)

};

}
function getSMTSettings(){

return {

enabled: document.getElementById("smtToggle").checked,

lookback: parseInt(
document.getElementById("smtLookback").value
)

};

}
function updateSupportResistance(){

const settings = getSRSettings();

if(!settings.enabled) return;

let levels = calculateSupportResistance(
candles,
50,
settings.tolerance
);

// 🔹 MERGE duplicates
levels = mergeCloseLevels(levels, settings.tolerance);

// 🔹 remove weak levels
levels = levels.filter(
l => l.touches >= settings.minTouches
);

// 🔹 strongest first
levels.sort((a,b)=>b.touches - a.touches);

// 🔹 limit count
levels = levels.slice(0, settings.maxLevels);

drawSR(levels);

}
function drawSR(levels){

    const padding = {top:50, bottom:50, left:80, right:20};
    const volumeHeight = 50;
    const chartHeight = canvas.height - padding.top - padding.bottom - volumeHeight;

    const priceMin = Math.min(...candles.map(c=>c.low));
    const priceMax = Math.max(...candles.map(c=>c.high));

	const visibleRange = (priceMax - priceMin) / priceZoom;

	const scaleY = price =>
		padding.top +
		(priceMax - price) * chartHeight / visibleRange +
		offsetY;

    ctx.save();

	ctx.lineWidth = 1.5;
	ctx.setLineDash([6,6]);

	levels.forEach(level => {

		const y = scaleY(level.price);

		const lastPrice = candles[candles.length - 1].close;

		// Detect support or resistance
		const isResistance = level.price > lastPrice;

		const lineColor = isResistance ? "#ff4444" : "#00ff66";

		ctx.strokeStyle = lineColor;

		ctx.beginPath();
		ctx.moveTo(padding.left, y);
		ctx.lineTo(canvas.width - padding.right, y);
		ctx.stroke();

		ctx.fillStyle = lineColor;
		ctx.font = "11px Arial";
		ctx.textAlign = "left";

		const label = level.price.toFixed(2) + " (" + level.touches + ")";
		const textWidth = ctx.measureText(label).width;

		ctx.fillText(
			label,
			canvas.width - padding.right - textWidth - 5,
			y - 6
		);
	});

    ctx.setLineDash([]);
    ctx.restore();
}
function mergeCloseLevels(levels, tolerance){

    let merged = [];

    levels.forEach(level => {

        let found = false;

        for(let m of merged){

            let tol = m.price * tolerance * 2;

            if(Math.abs(level.price - m.price) < tol){

                // merge levels
                m.price = (m.price * m.touches + level.price * level.touches) / (m.touches + level.touches);
                m.touches += level.touches;

                found = true;
                break;
            }

        }

        if(!found){
            merged.push({...level});
        }

    });

    return merged;
}
function calculateSMT(){

const settings = getSMTSettings();
if(!settings.enabled) return null;

const lookback = settings.lookback;

if(candles.length < lookback) return null;

const recent = candles.slice(-lookback);

const first = recent[0].close;
const last = recent[recent.length-1].close;

const high = Math.max(...recent.map(c=>c.high));
const low = Math.min(...recent.map(c=>c.low));

let direction = null;
let target = null;

if(last > first){
    direction = "UP";
    target = high;
}
else{
    direction = "DOWN";
    target = low;
}

return {
direction,
target
};

}
function getSMTDirection(){

const settings = getSMTSettings();

if(!settings.enabled) return null;

if(candles.length < settings.lookback) return null;

const recent = candles.slice(-settings.lookback);

const first = recent[0].close;
const last = recent[recent.length-1].close;

return last > first ? "UP" : "DOWN";

}
function drawSMTFlash(){

const direction = getSMTDirection();
if(!direction) return;

const padding = {top:50, bottom:50, left:80, right:20};
const volumeHeight = 50;
const spacing = candleWidth * 1.5;

const chartHeight = canvas.height - padding.top - padding.bottom - volumeHeight;

const priceMin = Math.min(...candles.map(c=>c.low));
const priceMax = Math.max(...candles.map(c=>c.high));

const visibleRange = (priceMax - priceMin) / priceZoom;

const scaleY = price =>
    padding.top +
    (priceMax - price) * chartHeight / visibleRange +
    offsetY;

const lastIndex = candles.length - 1;
const last = candles[lastIndex];

const candleX = padding.left + lastIndex * spacing + offsetX;
const candleY = scaleY((last.open + last.close)/2);

/* --- calculate trend slope --- */

const lookback = 8;
let slope = 0;

if(candles.length > lookback){

    const prev = candles[lastIndex - lookback];
    const prevY = scaleY(prev.close);

    slope = (candleY - prevY) / (lookback * spacing);

}

/* --- beam direction --- */

const beamLength = canvas.width * 2;
const beamWidth = candleWidth * 40;
let angle = Math.atan(-slope);

if(direction === "UP"){
    angle = -Math.abs(angle);   // tilt upward-right
}else{
    angle = Math.abs(angle);    // tilt downward-right
}

/* --- animation pulse --- */

const pulse = (Math.sin(smtBlink) + 1) / 2;

ctx.save();

ctx.translate(candleX, candleY);
ctx.rotate(angle);

ctx.globalAlpha = 0.2 + pulse * 0.3;

const color = direction === "UP" ? "#00ffaa" : "#ff7a00";

ctx.fillStyle = color;
ctx.shadowColor = color;
ctx.shadowBlur = 30;

/* --- infinite beam --- */

ctx.beginPath();

ctx.moveTo(0,0);

if(direction === "UP"){

    // project forward & up
    ctx.lineTo(beamLength,-beamWidth/2);
    ctx.lineTo(beamLength,beamWidth/2);

}else{

    // project forward & down
    ctx.lineTo(beamLength,-beamWidth/2);
    ctx.lineTo(beamLength,beamWidth/2);

}
ctx.closePath();
ctx.fill();

ctx.restore();

}
// Check if tutorial was already shown
if(!localStorage.getItem('tutorialShown')){
    document.getElementById('tutorialOverlay').style.display = 'flex';
}

// Close button
document.getElementById('tutorialClose').addEventListener('click', ()=>{
    document.getElementById('tutorialOverlay').style.display = 'none';
    localStorage.setItem('tutorialShown', 'true'); // remember for next time
});


// Listen for messages from parent (e.g., new candles, SR, indicator changes)
window.addEventListener("message", (event) => {
    const data = event.data;
    if(!data || !data.type) return;

    switch(data.type) {
        case "updateCandles":
            if(Array.isArray(data.candles)) {
                allCandles = data.candles;
                aggregateCandles(); // rebuild based on current TF
            }
            break;

        case "updateSR":
            // Update SR settings if provided
            if(data.srSettings) {
                document.getElementById("srToggle").checked = !!data.srSettings.enabled;
                document.getElementById("srLevels").value = data.srSettings.maxLevels || 3;
                document.getElementById("srTouches").value = data.srSettings.minTouches || 2;
                document.getElementById("srTolerance").value = data.srSettings.tolerance || 0.002;
            }
            drawChart();
            break;

        case "updateIndicators":
            // Example: toggle SMA/EMA/VWAP
            if(data.indicators) {
                smaToggle.checked = !!data.indicators.sma;
                smaPeriod.value = data.indicators.smaPeriod || smaPeriod.value;
                emaToggle.checked = !!data.indicators.ema;
                emaPeriod.value = data.indicators.emaPeriod || emaPeriod.value;
                vwapToggle.checked = !!data.indicators.vwap;
            }
            drawChart();
            break;

        case "setTimeframe":
            if(data.tf) {
                currentTF = parseInt(data.tf);
                tfSelect.value = currentTF;
                aggregateCandles();
            }
            break;

        case "scrollToLatest":
            scrollToLatestCandle();
            break;
    }
});
function calculateALP(){

const settings = {
enabled: document.getElementById("alpToggle").checked,
lookback: parseInt(document.getElementById("alpLookback").value)
};

if(!settings.enabled) return null;
if(candles.length < settings.lookback) return null;

const recent = candles.slice(-settings.lookback);

const high = Math.max(...recent.map(c=>c.high));
const low = Math.min(...recent.map(c=>c.low));

const midpoint = (high + low) / 2;

const last = candles[candles.length-1].close;

let direction;

if(last > midpoint){
    direction = "DOWN";
}else{
    direction = "UP";
}

return {
direction,
price: midpoint
};

}


function drawALPZone(){

const alp = calculateALP();

if(!alp) return;

const padding = {top:50, bottom:50, left:80, right:20};
const volumeHeight = 50;

const chartHeight = canvas.height - padding.top - padding.bottom - volumeHeight;

const priceMin = Math.min(...candles.map(c=>c.low));
const priceMax = Math.max(...candles.map(c=>c.high));

const visibleRange = (priceMax - priceMin) / priceZoom;

const scaleY = price =>
    padding.top +
    (priceMax - price) * chartHeight / visibleRange +
    offsetY;
const y = scaleY(alp.price);

const zoneHeight = 14;

const pulse = (Math.sin(alpBlink) + 1)/2;

ctx.save();

const color = alp.direction === "UP"
? `rgba(0,170,255,${0.25 + pulse*0.35})`
: `rgba(255,170,0,${0.25 + pulse*0.35})`;

ctx.fillStyle = color;
ctx.shadowColor = color;
ctx.shadowBlur = 25;

ctx.fillRect(
80,
y - zoneHeight/2,
canvas.width - 100,
zoneHeight
);

ctx.restore();

}



function drawCandles(ctx, scales, range, theme) {
    const { scaleX, scaleY } = scales;

    for (let i = range.start; i < range.end; i++) {
        const c = candles[i];

        const x = scaleX(i);
        const yOpen = scaleY(c.open);
        const yClose = scaleY(c.close);
        const yHigh = scaleY(c.high);
        const yLow = scaleY(c.low);

        const color = c.close >= c.open ? theme.candleUp : theme.candleDown;

        drawSingleCandle(ctx, x, yOpen, yClose, yHigh, yLow, color);
    }
}

function drawSingleCandle(ctx, x, yOpen, yClose, yHigh, yLow, color) {
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

    // Wick
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(
        x - candleWidth / 2,
        bodyTop,
        candleWidth,
        bodyHeight
    );
}

function getVisibleRange(chartWidth, spacing) {
    const start = Math.max(0, Math.floor(-offsetX / spacing));
	const end = Math.min(
		candles.length,
		Math.ceil((chartWidth - offsetX) / spacing) + 2
	);
    return { start, end };
}