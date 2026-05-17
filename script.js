const Storage = {
    save(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    load(key, fallback) { const data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; }
};
const UI = {
    toast(message) {
        const wrapper = document.getElementById('toastWrapper');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = message;
        wrapper.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }
};

let audioCtx = null;
function playSound(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}

function updateSession() {
    const h = new Date().getUTCHours();
    let s = 'Asian / Sydney';
    if (h >= 7 && h < 16) s = 'London Session';
    else if (h >= 12 && h < 21) s = 'New York Session';
    else if (h >= 21 || h < 7) s = 'Asian Session';
    document.getElementById('session').textContent = s;
}
updateSession(); setInterval(updateSession, 60000);

const Market = {
    instruments: {
        XAUUSD: { start: 2320, volatility: .7, digits: 2, pipValue: 10 },
        EURUSD: { start: 1.08, volatility: .0004, digits: 5, pipValue: 10 },
        BTCUSD: { start: 68000, volatility: 25, digits: 1, pipValue: 1 }
    },
    generate(count, start, volatility, digits) {
        const data = [];
        let price = start;
        const now = Math.floor(Date.now() / 1000);
        for (let i = count; i > 0; i--) {
            const drift = Math.sin(i / 18) * volatility * .25;
            const random = (Math.random() - .5) * volatility;
            const change = drift + random;
            const open = price;
            const close = open + change;
            const high = Math.max(open, close) + Math.random() * volatility * .4;
            const low = Math.min(open, close) - Math.random() * volatility * .4;
            data.push({
                time: now - i * 60,
                open: Number(open.toFixed(digits)),
                high: Number(high.toFixed(digits)),
                low: Number(low.toFixed(digits)),
                close: Number(close.toFixed(digits))
            });
            price = close;
        }
        return data;
    }
};

const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    layout: { background: { type: 'solid', color: '#050816' }, textColor: '#94a3b8', fontSize: 12, fontFamily: 'Inter' },
    grid: { vertLines: { color: 'rgba(255,255,255,.025)', style: 1 }, horzLines: { color: 'rgba(255,255,255,.025)', style: 1 } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { width:1, color:'rgba(14,165,233,.35)', style:3, labelBackgroundColor:'#0ea5e9' }, horzLine: { width:1, color:'rgba(14,165,233,.35)', style:3, labelBackgroundColor:'#0ea5e9' } },
    rightPriceScale: { borderColor: 'rgba(255,255,255,.08)' },
    timeScale: { borderColor: 'rgba(255,255,255,.08)', timeVisible: true, secondsVisible: false }
});

let currentInstrument = 'XAUUSD';
let instrument = Market.instruments[currentInstrument];
let chartData = Market.generate(300, instrument.start, instrument.volatility, instrument.digits);

let candleSeries = chart.addCandlestickSeries({
    upColor: '#22c55e', downColor: '#ef4444',
    borderUpColor: '#22c55e', borderDownColor: '#ef4444',
    wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    priceLineVisible: true, lastValueVisible: true
});
candleSeries.setData(chartData);

const smaSeries = chart.addLineSeries({ color: '#f97316', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
const rsiSeries = chart.addLineSeries({
    color: '#a78bfa', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    priceFormat: { type: 'custom', formatter: price => price.toFixed(2) },
    priceScaleId: 'rsi'
});
chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.4 }, visible: true, borderColor: 'rgba(255,255,255,.08)' });

let bbUpper = null, bbMiddle = null, bbLower = null;
let smaVisible = true, rsiVisible = true, bbVisible = false;

function updateSMA() {
    const period = 20;
    if (chartData.length < period) return;
    const smaData = [];
    for (let i = period-1; i < chartData.length; i++) {
        let sum = 0;
        for (let j = i-period+1; j <= i; j++) sum += chartData[j].close;
        const avg = sum / period;
        smaData.push({ time: chartData[i].time, value: Number(avg.toFixed(instrument.digits)) });
    }
    smaSeries.setData(smaData);
}

function updateRSI() {
    const period = 14;
    if (chartData.length < period) return;
    const rsiData = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = chartData[i].close - chartData[i-1].close;
        if (diff >= 0) avgGain += diff;
        else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    let rs = avgGain / (avgLoss || 1e-10);
    rsiData.push({ time: chartData[period].time, value: 100 - 100 / (1 + rs) });
    for (let i = period+1; i < chartData.length; i++) {
        const diff = chartData[i].close - chartData[i-1].close;
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgGain / (avgLoss || 1e-10);
        rsiData.push({ time: chartData[i].time, value: 100 - 100 / (1 + rs) });
    }
    rsiSeries.setData(rsiData);
}

function updateBB() {
    if (!bbVisible || !bbUpper) return;
    const period = 20, multiplier = 2;
    const smaData = [], upperData = [], lowerData = [];
    for (let i = period-1; i < chartData.length; i++) {
        const slice = chartData.slice(i-period+1, i+1).map(d => d.close);
        let sum = 0;
        slice.forEach(v => sum += v);
        const sma = sum / period;
        const variance = slice.reduce((acc, v) => acc + (v - sma)**2, 0) / period;
        const stddev = Math.sqrt(variance);
        smaData.push({ time: chartData[i].time, value: Number(sma.toFixed(instrument.digits)) });
        upperData.push({ time: chartData[i].time, value: Number((sma + multiplier * stddev).toFixed(instrument.digits)) });
        lowerData.push({ time: chartData[i].time, value: Number((sma - multiplier * stddev).toFixed(instrument.digits)) });
    }
    bbMiddle.setData(smaData);
    bbUpper.setData(upperData);
    bbLower.setData(lowerData);
}

function recalcIndicators() {
    updateSMA();
    updateRSI();
    if (bbVisible) updateBB();
}
// Initialize indicators immediately
recalcIndicators();

let chartType = 'candles';
const chartTypeBtn = document.getElementById('chartTypeBtn');
function setChartType(type) {
    chart.removeSeries(candleSeries);
    if (bbVisible) { chart.removeSeries(bbUpper); chart.removeSeries(bbMiddle); chart.removeSeries(bbLower); }
    if (type === 'candles') {
        candleSeries = chart.addCandlestickSeries({
            upColor:'#22c55e', downColor:'#ef4444', borderUpColor:'#22c55e', borderDownColor:'#ef4444',
            wickUpColor:'#22c55e', wickDownColor:'#ef4444', priceLineVisible:true, lastValueVisible:true
        });
        candleSeries.setData(chartData);
    } else if (type === 'line') {
        candleSeries = chart.addLineSeries({ color:'#38bdf8', lineWidth:2 });
        candleSeries.setData(chartData.map(d => ({ time: d.time, value: d.close })));
    } else if (type === 'area') {
        candleSeries = chart.addAreaSeries({
            lineColor:'#38bdf8', topColor:'rgba(56,189,248,0.3)', bottomColor:'rgba(56,189,248,0.0)', lineWidth:2
        });
        candleSeries.setData(chartData.map(d => ({ time: d.time, value: d.close })));
    } else if (type === 'heikinashi') {
        const haData = [];
        for (let i = 0; i < chartData.length; i++) {
            const d = chartData[i];
            if (i === 0) { haData.push({ ...d }); continue; }
            const prev = haData[i-1];
            const haClose = (d.open + d.high + d.low + d.close) / 4;
            const haOpen = (prev.open + prev.close) / 2;
            const haHigh = Math.max(d.high, haOpen, haClose);
            const haLow = Math.min(d.low, haOpen, haClose);
            haData.push({
                time: d.time,
                open: Number(haOpen.toFixed(instrument.digits)),
                high: Number(haHigh.toFixed(instrument.digits)),
                low: Number(haLow.toFixed(instrument.digits)),
                close: Number(haClose.toFixed(instrument.digits))
            });
        }
        candleSeries = chart.addCandlestickSeries({
            upColor:'#22c55e', downColor:'#ef4444', borderUpColor:'#22c55e', borderDownColor:'#ef4444',
            wickUpColor:'#22c55e', wickDownColor:'#ef4444', priceLineVisible:true, lastValueVisible:true
        });
        candleSeries.setData(haData);
    }
    chartType = type;
    chartTypeBtn.textContent = '📊 ' + type.charAt(0).toUpperCase() + type.slice(1);
    if (bbVisible) addBollingerBands();
}
chartTypeBtn.addEventListener('click', () => {
    const types = ['candles','heikinashi','line','area'];
    const idx = types.indexOf(chartType);
    setChartType(types[(idx+1)%types.length]);
});

document.getElementById('addIndicatorBtn').addEventListener('click', () => {
    document.getElementById('indicatorModal').classList.add('active');
});
document.getElementById('closeIndicatorModal').addEventListener('click', () => {
    document.getElementById('indicatorModal').classList.remove('active');
});
document.querySelectorAll('.indicator-item').forEach(item => {
    item.addEventListener('click', () => {
        const ind = item.dataset.ind;
        if (ind === 'sma') smaVisible = !smaVisible;
        if (ind === 'rsi') rsiVisible = !rsiVisible;
        if (ind === 'bb') {
            bbVisible = !bbVisible;
            if (bbVisible) addBollingerBands();
            else removeBollingerBands();
        }
        document.getElementById('indicatorModal').classList.remove('active');
        updateIndicatorsVisibility();
    });
});
function addBollingerBands() {
    if (bbUpper) return;
    bbUpper = chart.addLineSeries({ color:'rgba(56,189,248,0.7)', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
    bbMiddle = chart.addLineSeries({ color:'rgba(255,255,255,0.3)', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
    bbLower = chart.addLineSeries({ color:'rgba(56,189,248,0.7)', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
    updateBB();
}
function removeBollingerBands() {
    if (bbUpper) { chart.removeSeries(bbUpper); chart.removeSeries(bbMiddle); chart.removeSeries(bbLower); bbUpper = bbMiddle = bbLower = null; }
}
function updateIndicatorsVisibility() {
    smaSeries.applyOptions({ visible: smaVisible });
    rsiSeries.applyOptions({ visible: rsiVisible });
    if (bbUpper) { bbUpper.applyOptions({ visible: bbVisible }); bbMiddle.applyOptions({ visible: bbVisible }); bbLower.applyOptions({ visible: bbVisible }); }
    if (bbVisible) updateBB();
}

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let drawings = Storage.load('drawings', []);
let activeTool = null;
let isDrawing = false;
let startCoords = null;
let currentDrawing = null;

function resizeCanvas() {
    const container = document.getElementById('chartContainer');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    redrawCanvas();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function chartPosFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x, y };
}
function priceFromY(y) {
    const priceScale = chart.priceScale('right');
    return priceScale.coordinateToPrice(y);
}
function timeFromX(x) {
    const timeScale = chart.timeScale();
    return timeScale.coordinateToTime(x);
}
function snapToOHLC(x, y) {
    const time = timeFromX(x);
    const price = priceFromY(y);
    if (!time || !price) return { time, price };
    const bar = chartData.find(d => d.time === time);
    if (!bar) return { time, price };
    const ohlc = [bar.open, bar.high, bar.low, bar.close];
    let closest = bar.close;
    let minDist = Infinity;
    ohlc.forEach(p => {
        const dist = Math.abs(chart.priceScale('right').priceToCoordinate(p) - y);
        if (dist < minDist && dist < 20) { minDist = dist; closest = p; }
    });
    return { time, price: closest };
}
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawings.forEach(d => drawShape(d));
    if (currentDrawing && activeTool && startCoords) {
        drawShape({ ...currentDrawing, isTemp: true });
    }
}
function drawShape(shape) {
    ctx.save();
    ctx.strokeStyle = shape.color || '#0ea5e9';
    ctx.fillStyle = shape.fill || 'rgba(14,165,233,0.1)';
    ctx.lineWidth = shape.width || 2;
    if (shape.type === 'hline') {
        const y = chart.priceScale('right').priceToCoordinate(shape.price);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    } else if (shape.type === 'vline') {
        const x = chart.timeScale().timeToCoordinate(shape.time);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    } else if (shape.type === 'trendline' || shape.type === 'ray') {
        const x1 = chart.timeScale().timeToCoordinate(shape.p1.time);
        const y1 = chart.priceScale('right').priceToCoordinate(shape.p1.price);
        let x2 = chart.timeScale().timeToCoordinate(shape.p2.time);
        let y2 = chart.priceScale('right').priceToCoordinate(shape.p2.price);
        if (shape.type === 'ray') {
            const slope = (y2 - y1) / (x2 - x1 || 1);
            x2 = canvas.width;
            y2 = y1 + slope * (x2 - x1);
        }
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (shape.type === 'rect') {
        const x1 = chart.timeScale().timeToCoordinate(shape.p1.time);
        const y1 = chart.priceScale('right').priceToCoordinate(shape.p1.price);
        const x2 = chart.timeScale().timeToCoordinate(shape.p2.time);
        const y2 = chart.priceScale('right').priceToCoordinate(shape.p2.price);
        ctx.fillRect(x1, y1, x2-x1, y2-y1);
        ctx.strokeRect(x1, y1, x2-x1, y2-y1);
    } else if (shape.type === 'ellipse') {
        const x1 = chart.timeScale().timeToCoordinate(shape.p1.time);
        const y1 = chart.priceScale('right').priceToCoordinate(shape.p1.price);
        const x2 = chart.timeScale().timeToCoordinate(shape.p2.time);
        const y2 = chart.priceScale('right').priceToCoordinate(shape.p2.price);
        const cx = (x1+x2)/2, cy = (y1+y2)/2, rx = Math.abs(x2-x1)/2, ry = Math.abs(y2-y1)/2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
}

function startDrawing(e) {
    if (!activeTool) return;
    isDrawing = true;
    canvas.style.pointerEvents = 'auto';   // only capture while drawing
    const pos = chartPosFromEvent(e);
    const snapped = (activeTool !== 'crosshair') ? snapToOHLC(pos.x, pos.y) : { time: timeFromX(pos.x), price: priceFromY(pos.y) };
    startCoords = snapped;
    if (activeTool === 'hline' || activeTool === 'vline' || activeTool === 'alertline') {
        finishDrawing({ time: snapped.time, price: snapped.price });
        isDrawing = false;
    } else {
        currentDrawing = { type: activeTool, p1: snapped, p2: snapped };
    }
    e.preventDefault();
}
function moveDrawing(e) {
    if (!isDrawing || !activeTool) return;
    const pos = chartPosFromEvent(e);
    const snapped = snapToOHLC(pos.x, pos.y);
    if (['trendline','ray','rect','ellipse'].includes(activeTool)) {
        currentDrawing.p2 = snapped;
    }
    redrawCanvas();
}
function finishDrawing(endCoords) {
    if (!activeTool) return;
    let drawing = null;
    if (['hline','vline','alertline'].includes(activeTool)) {
        drawing = { type: activeTool === 'alertline' ? 'hline' : activeTool, price: endCoords.price, time: endCoords.time, id: Date.now(), color:'#0ea5e9', width:2, fill:'rgba(14,165,233,0.1)' };
        if (activeTool === 'alertline') drawing.alert = true;
    } else {
        if (!currentDrawing) return;
        drawing = { ...currentDrawing, id: Date.now(), color:'#0ea5e9', width:2, fill:'rgba(14,165,233,0.1)' };
    }
    drawings.push(drawing);
    Storage.save('drawings', drawings);
    renderDrawingsList();
    currentDrawing = null;
    startCoords = null;
    isDrawing = false;
    canvas.style.pointerEvents = 'none';   // release overlay
    redrawCanvas();
}
function clearAllDrawings() {
    drawings = [];
    Storage.save('drawings', drawings);
    renderDrawingsList();
    redrawCanvas();
}
function renderDrawingsList() {
    const list = document.getElementById('drawingsList');
    if (drawings.length === 0) list.innerHTML = '<small>No drawings</small>';
    else list.innerHTML = drawings.map((d,i) => `<div>${d.type}${d.alert?'🔔':''} <button onclick="deleteDrawing(${i})">✕</button></div>`).join('');
}
window.deleteDrawing = function(index) {
    drawings.splice(index, 1);
    Storage.save('drawings', drawings);
    renderDrawingsList();
    redrawCanvas();
};

document.querySelectorAll('.draw-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.id === 'clearDrawingsBtn') { clearAllDrawings(); return; }
        const tool = btn.dataset.tool;
        document.querySelectorAll('.draw-btn').forEach(b => b.classList.remove('active'));
        if (activeTool === tool) {
            activeTool = null;
        } else {
            activeTool = tool;
            btn.classList.add('active');
        }
        // DO NOT set canvas.pointerEvents here – it stays none until mouse down
    });
});

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', moveDrawing);
canvas.addEventListener('mouseup', () => { if (isDrawing) finishDrawing(); });
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', moveDrawing, { passive: false });
canvas.addEventListener('touchend', () => { if (isDrawing) finishDrawing(); });

function checkAlertLines(currentPrice) {
    drawings.forEach(d => {
        if (d.type === 'hline' && d.alert && d.price) {
            const prevPrice = d.lastPrice || currentPrice;
            if ((prevPrice < d.price && currentPrice >= d.price) || (prevPrice > d.price && currentPrice <= d.price)) {
                UI.toast(`Alert! Price crossed ${d.price.toFixed(instrument.digits)}`);
                playSound(1500, 0.2);
            }
            d.lastPrice = currentPrice;
        }
    });
}

const quickTradePopup = document.getElementById('quickTradePopup');
const quickPriceEl = document.getElementById('quickPrice');
let quickTradePrice = 0;
chart.subscribeClick((param) => {
    if (activeTool) return;
    if (!param.point) return;
    const price = param.point ? chart.priceScale('right').coordinateToPrice(param.point.y) : null;
    if (!price) return;
    quickTradePrice = Number(price.toFixed(instrument.digits));
    quickPriceEl.textContent = quickTradePrice;
    quickTradePopup.style.display = 'flex';
    const container = document.getElementById('chartContainer');
    const rect = container.getBoundingClientRect();
    quickTradePopup.style.left = (param.point.x + 20) + 'px';
    quickTradePopup.style.top = (param.point.y - 30) + 'px';
});
quickTradePopup.querySelector('.quick-buy').addEventListener('click', () => {
    openTradeWithPrice('buy', quickTradePrice);
    quickTradePopup.style.display = 'none';
});
quickTradePopup.querySelector('.quick-sell').addEventListener('click', () => {
    openTradeWithPrice('sell', quickTradePrice);
    quickTradePopup.style.display = 'none';
});
document.addEventListener('click', (e) => {
    if (!quickTradePopup.contains(e.target)) quickTradePopup.style.display = 'none';
});

const contextMenu = document.getElementById('contextMenu');
let longPressTimer;
canvas.addEventListener('touchstart', (e) => {
    if (activeTool) return;
    const pos = chartPosFromEvent(e);
    longPressTimer = setTimeout(() => {
        contextMenu.style.display = 'block';
        contextMenu.style.left = (e.touches[0].clientX) + 'px';
        contextMenu.style.top = (e.touches[0].clientY) + 'px';
        contextMenu.dataset.price = priceFromY(pos.y);
        contextMenu.dataset.time = timeFromX(pos.x);
    }, 500);
}, { passive: false });
canvas.addEventListener('touchend', () => clearTimeout(longPressTimer));
canvas.addEventListener('touchmove', () => clearTimeout(longPressTimer));
document.addEventListener('click', (e) => { if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none'; });
contextMenu.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', () => {
        const price = parseFloat(contextMenu.dataset.price);
        if (item.dataset.action === 'trade') {
            quickTradePrice = price;
            quickPriceEl.textContent = quickTradePrice.toFixed(instrument.digits);
            quickTradePopup.style.display = 'flex';
            const container = document.getElementById('chartContainer');
            const rect = container.getBoundingClientRect();
            quickTradePopup.style.left = (parseInt(contextMenu.style.left) - rect.left + 40) + 'px';
            quickTradePopup.style.top = (parseInt(contextMenu.style.top) - rect.top - 60) + 'px';
        } else if (item.dataset.action === 'alert') {
            drawings.push({ type:'hline', price, time: contextMenu.dataset.time, id: Date.now(), color:'#f97316', width:1, alert: true });
            Storage.save('drawings', drawings);
            renderDrawingsList();
            redrawCanvas();
            UI.toast(`Alert set at ${price.toFixed(instrument.digits)}`);
        } else if (item.dataset.action === 'draw') {
            activeTool = 'hline';
            UI.toast('Draw mode activated – tap to place line');
        }
        contextMenu.style.display = 'none';
    });
});

const balanceElement = document.getElementById('balance');
const positionInfo = document.getElementById('positionInfo');
const closeBtn = document.getElementById('closeBtn');
const buyBtn = document.getElementById('buyBtn');
const sellBtn = document.getElementById('sellBtn');
const historyList = document.getElementById('historyList');
let balance = Storage.load('balance', 50000);
let position = null;
let tradeHistory = Storage.load('tradeHistory', []);
balanceElement.textContent = `$${balance.toLocaleString()}`;
renderHistory();

function updateUnrealizedPnL() {
    if (!position) return;
    const currentPrice = chartData[chartData.length-1].close;
    const entry = position.entry;
    const lotSize = position.lotSize || 0.01;
    const pipValue = instrument.pipValue;
    let pips;
    if (currentInstrument === 'XAUUSD') pips = (currentPrice - entry) * 10;
    else if (currentInstrument === 'EURUSD') pips = (currentPrice - entry) * 10000;
    else pips = currentPrice - entry;
    const profit = (position.type === 'buy' ? pips : -pips) * lotSize * pipValue;
    positionInfo.innerHTML = `<strong>${position.type.toUpperCase()} ${lotSize} lot</strong><br>Entry: ${entry}<br>Unrealized: $${profit.toFixed(2)}`;
}

function openTrade(type) { openTradeWithPrice(type, chartData[chartData.length-1].close); }
function openTradeWithPrice(type, price) {
    if (position) { UI.toast('Close current trade first'); return; }
    const lotSize = parseFloat(document.getElementById('lotSize').value) || 0.01;
    position = { type, entry: price, lotSize };
    closeBtn.style.display = 'block';
    updateUnrealizedPnL();
    UI.toast(`${type.toUpperCase()} ${lotSize} lot at ${price}`);
    playSound(800,0.15);
}
function closeTrade() {
    if (!position) return;
    const exitPrice = chartData[chartData.length-1].close;
    const entry = position.entry;
    const lotSize = position.lotSize;
    const pipValue = instrument.pipValue;
    let pips;
    if (currentInstrument === 'XAUUSD') pips = (exitPrice - entry) * 10;
    else if (currentInstrument === 'EURUSD') pips = (exitPrice - entry) * 10000;
    else pips = exitPrice - entry;
    const profit = (position.type === 'buy' ? pips : -pips) * lotSize * pipValue;
    balance += profit;
    balance = Math.round(balance * 100) / 100;
    Storage.save('balance', balance);
    balanceElement.textContent = `$${balance.toLocaleString()}`;
    tradeHistory.push({
        type: position.type, entry, exit: exitPrice, lotSize,
        profit: profit.toFixed(2), time: new Date().toLocaleString()
    });
    if (tradeHistory.length > 50) tradeHistory.shift();
    Storage.save('tradeHistory', tradeHistory);
    renderHistory();
    position = null;
    closeBtn.style.display = 'none';
    positionInfo.innerHTML = 'No open position';
    UI.toast(`Trade closed. P&L: $${profit.toFixed(2)}`);
    playSound(600,0.2);
}
function renderHistory() {
    if (tradeHistory.length === 0) { historyList.innerHTML = '<small>No trades yet</small>'; return; }
    historyList.innerHTML = tradeHistory.slice().reverse().map(t =>
        `<div style="margin-bottom:0.3rem; border-bottom:1px solid rgba(255,255,255,.05); padding:0.2rem 0;">
            <span style="color:${t.profit>=0?'var(--green)':'var(--red)'}">${t.type.toUpperCase()} ${t.lotSize} lot</span>
            <span style="float:right;">$${t.profit}</span>
            <br><small>${t.time}</small>
        </div>`
    ).join('');
}
buyBtn.addEventListener('click', () => openTrade('buy'));
sellBtn.addEventListener('click', () => openTrade('sell'));
closeBtn.addEventListener('click', closeTrade);

let pendingOrders = [];
const pendingOrdersListEl = document.getElementById('pendingOrdersList');
const placePendingBtn = document.getElementById('placePendingBtn');
function renderPendingOrders() {
    if (pendingOrders.length === 0) { pendingOrdersListEl.innerHTML = '<small>No pending orders</small>'; return; }
    pendingOrdersListEl.innerHTML = pendingOrders.map((o,i) =>
        `<div class="pending-order">
            <span>${o.type.toUpperCase()} ${o.side.toUpperCase()} @ ${o.price} (${o.lotSize} lot)</span>
            <button onclick="cancelPendingOrder(${i})">✕</button>
        </div>`
    ).join('');
}
window.cancelPendingOrder = function(index) {
    pendingOrders.splice(index, 1);
    renderPendingOrders();
};
placePendingBtn.addEventListener('click', () => {
    const type = document.getElementById('pendingType').value;
    const price = parseFloat(document.getElementById('pendingPrice').value);
    const side = document.getElementById('pendingSide').value;
    const lotSize = parseFloat(document.getElementById('lotSize').value) || 0.01;
    if (isNaN(price) || price <= 0) { UI.toast('Invalid price'); return; }
    pendingOrders.push({ id: Date.now(), type, price, side, lotSize });
    UI.toast(`Pending ${type} ${side} at ${price} placed`);
    renderPendingOrders();
    playSound(1000,0.1);
});
function checkPendingOrders() {
    if (pendingOrders.length === 0) return;
    const currentPrice = chartData[chartData.length-1].close;
    const toExecute = [];
    pendingOrders.forEach((order, index) => {
        let execute = false;
        if (order.type === 'limit') {
            if (order.side === 'buy' && currentPrice <= order.price) execute = true;
            if (order.side === 'sell' && currentPrice >= order.price) execute = true;
        } else if (order.type === 'stop') {
            if (order.side === 'buy' && currentPrice >= order.price) execute = true;
            if (order.side === 'sell' && currentPrice <= order.price) execute = true;
        }
        if (execute) toExecute.push({ order, index });
    });
    toExecute.forEach(({ order, index }) => {
        pendingOrders.splice(index, 1);
        if (!position) {
            openTradeWithPrice(order.side, order.price);
            UI.toast(`Pending ${order.type} ${order.side} filled at ${order.price}`);
            playSound(1200,0.1);
        } else {
            UI.toast('Pending order skipped (position open)');
        }
    });
    renderPendingOrders();
}

function tick() {
    const last = chartData[chartData.length-1];
    const trendBias = Math.sin(Date.now()/20000)*.4;
    const volSpike = Math.random()<.03 ? instrument.volatility*4 : instrument.volatility;
    const move = ((Math.random()-.5+trendBias)*volSpike);
    const updated = { ...last, close: Number((last.close+move).toFixed(instrument.digits)) };
    updated.high = Math.max(updated.high, updated.close);
    updated.low = Math.min(updated.low, updated.close);
    chartData[chartData.length-1] = updated;
    candleSeries.update(updated);
    if (chartType !== 'candles' && chartType !== 'heikinashi') {
        candleSeries.update({ time: updated.time, value: updated.close });
    }
    recalcIndicators();
    updateUnrealizedPnL();
    checkPendingOrders();
    checkAlertLines(updated.close);
}
setInterval(tick, 1200);

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch(e.key.toLowerCase()) {
        case 'b': openTrade('buy'); break;
        case 's': openTrade('sell'); break;
        case 'c': closeTrade(); break;
    }
});

document.querySelectorAll('.example-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
        const example = this.nextElementSibling;
        example.style.display = example.style.display === 'block' ? 'none' : 'block';
    });
});

const pipPair = document.getElementById('pipPair');
const pipLot = document.getElementById('pipLot');
const pipResult = document.getElementById('pipResult');
function updatePipCalc() {
    const pair = pipPair.value;
    const lot = parseFloat(pipLot.value) || 0;
    let pipVal;
    if (pair === 'EURUSD') pipVal = lot * 10;
    else if (pair === 'XAUUSD') pipVal = lot * 1;
    else pipVal = lot * 1;
    pipResult.textContent = `1 pip ≈ $${pipVal.toFixed(2)}`;
}
pipPair.addEventListener('change', updatePipCalc);
pipLot.addEventListener('input', updatePipCalc);
updatePipCalc();

const riskBalance = document.getElementById('riskBalance');
const riskPercent = document.getElementById('riskPercent');
const riskSL = document.getElementById('riskSL');
const riskResult = document.getElementById('riskResult');
function updateRiskCalc() {
    const bal = parseFloat(riskBalance.value) || 0;
    const pct = parseFloat(riskPercent.value) || 0;
    const sl = parseFloat(riskSL.value) || 0;
    if (sl === 0) { riskResult.textContent = 'Enter Stop Loss'; return; }
    const riskAmount = bal * (pct/100);
    const lots = riskAmount / (sl * 10);
    riskResult.textContent = `Max position: ${lots.toFixed(2)} lots`;
}
riskBalance.addEventListener('input', updateRiskCalc);
riskPercent.addEventListener('input', updateRiskCalc);
riskSL.addEventListener('input', updateRiskCalc);
updateRiskCalc();

const modalOverlay = document.getElementById('riskModal');
const openRiskCalc = document.getElementById('openRiskCalc');
const closeRiskModal = document.getElementById('closeRiskModal');
const modalBalance = document.getElementById('modalBalance');
const modalRiskPercent = document.getElementById('modalRiskPercent');
const modalStopPips = document.getElementById('modalStopPips');
const modalResult = document.getElementById('modalResult');
const applyRiskLot = document.getElementById('applyRiskLot');
openRiskCalc.addEventListener('click', () => modalOverlay.classList.add('active'));
closeRiskModal.addEventListener('click', () => modalOverlay.classList.remove('active'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('active'); });
function updateModalResult() {
    const bal = parseFloat(modalBalance.value) || 0;
    const pct = parseFloat(modalRiskPercent.value) || 0;
    const sl = parseFloat(modalStopPips.value) || 0;
    if (sl === 0) { modalResult.textContent = 'Enter Stop Loss'; return; }
    const riskAmount = bal * (pct/100);
    const lots = riskAmount / (sl * 10);
    modalResult.textContent = `Recommended lots: ${lots.toFixed(2)}`;
}
modalBalance.addEventListener('input', updateModalResult);
modalRiskPercent.addEventListener('input', updateModalResult);
modalStopPips.addEventListener('input', updateModalResult);
updateModalResult();
applyRiskLot.addEventListener('click', () => {
    const bal = parseFloat(modalBalance.value) || 0;
    const pct = parseFloat(modalRiskPercent.value) || 0;
    const sl = parseFloat(modalStopPips.value) || 0;
    if (sl === 0) return;
    const riskAmount = bal * (pct/100);
    const lots = riskAmount / (sl * 10);
    document.getElementById('lotSize').value = lots.toFixed(2);
    modalOverlay.classList.remove('active');
    UI.toast(`Lot size set to ${lots.toFixed(2)}`);
});

document.getElementById('instrumentSelect').addEventListener('change', function(e) {
    currentInstrument = e.target.value;
    instrument = Market.instruments[currentInstrument];
    chartData = Market.generate(300, instrument.start, instrument.volatility, instrument.digits);
    candleSeries.setData(chartData);
    recalcIndicators();
    if (bbVisible) { removeBollingerBands(); addBollingerBands(); }
});

window.addEventListener('resize', () => {
    chart.applyOptions({ width: document.getElementById('chart').clientWidth });
    resizeCanvas();
});
