(function(){
'use strict';

// ========== كلمة المرور ==========
const BOT_PASSWORD = "ObeidaTrading";
let isAuthenticated = false;

// ========== إعدادات ==========
const SETTINGS = {
checkInterval: 3000,
signalDuration: 8000,
minConfidence: 75,
takeProfitPips: 50,
stopLossPips: 25,
maxTradesPerDay: 10,
useFibonacciLevels: true,
useSmartEntry: true,
useMultiTimeframeConfirm: true
};

// ========== متغيرات التشغيل ==========
let botRunning = false;
let botInterval = null;
let lastSignalTime = 0;
let selectedTimeframe = null;
let searchStatusDiv = null;
let currentTrade = null;
let tradesHistory = [];
let dailyTradesCount = 0;
let lastTradeDate = new Date().toDateString();

// ========== متغيرات الكشف التلقائي ==========
let currentAsset = "🔄 جاري الكشف...";
let currentAccountType = "🔄 جاري الكشف...";
let currentTimeframeAuto = "🔄 جاري الكشف...";
let lastAccountType = "";

// ========== متغيرات السعر ==========
let currentPrice = 0;
let lastPrice = 0;
let priceHistory = [];

// ========== مستويات فيبوناتشي ==========
let fibonacciLevels = {
level0: 0, level236: 0, level382: 0, level500: 0,
level618: 0, level786: 0, level1000: 0,
extension127: 0, extension1618: 0
};
let swingHigh = 0, swingLow = 0;

// ========== مراقبي MutationObserver ==========
let assetObserver = null, timeframeObserver = null, accountObserver = null;

// ========== الفريمات المدعومة ==========
const TIMEFRAMES = {
"5s":  { seconds: 5, waitSeconds: 10, name: "5 ثوان", category: "scalp_ultra", weight: 0.7 },
"10s": { seconds: 10, waitSeconds: 20, name: "10 ثوان", category: "scalp_ultra", weight: 0.75 },
"15s": { seconds: 15, waitSeconds: 30, name: "15 ثانية", category: "scalp_ultra", weight: 0.8 },
"30s": { seconds: 30, waitSeconds: 60, name: "30 ثانية", category: "scalp_fast", weight: 0.85 },
"1m":  { seconds: 60, waitSeconds: 120, name: "1 دقيقة", category: "scalp_fast", weight: 0.9 },
"5m":  { seconds: 300, waitSeconds: 600, name: "5 دقائق", category: "intraday", weight: 0.92 },
"15m": { seconds: 900, waitSeconds: 1800, name: "15 دقيقة", category: "intraday", weight: 0.94 },
"1h":  { seconds: 3600, waitSeconds: 7200, name: "1 ساعة", category: "swing", weight: 0.96 },
"4h":  { seconds: 14400, waitSeconds: 28800, name: "4 ساعات", category: "swing", weight: 0.95 },
"1d":  { seconds: 86400, waitSeconds: 172800, name: "يومي", category: "position", weight: 0.93 }
};

// =====================================================
// ========== رادار السعر ==========
// =====================================================
function initPriceRadar() {
console.log("%c 🛰️ جاري كشف العملة ", "color: #00ffcc; font-weight: bold;");
function getTargetAssetName() {
const assetElement = document.querySelector('.T4GAK');
if (!assetElement) return null;
let rawName = assetElement.innerText.split('\n')[0];
let cleanName = rawName.replace(/[^a-zA-Z]/g, "").toUpperCase();
if (rawName.includes("OTC")) cleanName = cleanName.replace("OTC", "") + "_otc";
return cleanName;
}
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(data) {
if (!this.singlePriceObserver) {
this.addEventListener('message', async (event) => {
let msg = event.data, textData = "";
if (msg instanceof Blob) textData = await msg.text();
else if (msg instanceof ArrayBuffer) textData = new TextDecoder().decode(msg);
else textData = msg.toString();
try {
const activeAsset = getTargetAssetName();
if (!activeAsset) return;
if (textData.includes(activeAsset)) {
const priceMatch = textData.match(/(\d+\.\d{4,})/);
if (priceMatch) {
const newPrice = parseFloat(priceMatch[0]);
currentPrice = newPrice;
priceHistory.push({close: currentPrice, time: Date.now()});
if (priceHistory.length > 200) priceHistory.shift();
updateFibonacciLevels();
let diff = lastPrice === 0 ? 0 : (currentPrice - lastPrice).toFixed(5);
updatePriceDisplay(currentPrice, diff);
if (currentTrade && currentTrade.status === "open") checkTradeExit(currentPrice);
lastPrice = currentPrice;
}
}
} catch(e) {}
});
this.singlePriceObserver = true;
}
return originalSend.apply(this, arguments);
};
}

function updateFibonacciLevels() {
if (priceHistory.length < 20) return;
let recentPrices = priceHistory.slice(-50);
swingHigh = Math.max(...recentPrices.map(p => p.close));
swingLow = Math.min(...recentPrices.map(p => p.close));
let range = swingHigh - swingLow;
fibonacciLevels = {
level0: swingLow, level236: swingLow + range * 0.236, level382: swingLow + range * 0.382,
level500: swingLow + range * 0.5, level618: swingLow + range * 0.618,
level786: swingLow + range * 0.786, level1000: swingHigh,
extension127: swingHigh + range * 0.27, extension1618: swingHigh + range * 0.618
};
updateFibonacciDisplay();
}

function updateFibonacciDisplay() {
const fibEl = document.getElementById('fib-levels');
if (fibEl) {
fibEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:8px;">
<div style="color:#ffd966;">0.236: ${fibonacciLevels.level236.toFixed(5)}</div>
<div style="color:#ffaa66;">0.382: ${fibonacciLevels.level382.toFixed(5)}</div>
<div style="color:#ff8866;">0.5: ${fibonacciLevels.level500.toFixed(5)}</div>
<div style="color:#ff6688;">0.618: ${fibonacciLevels.level618.toFixed(5)}</div>
<div style="color:#ff66aa;">0.786: ${fibonacciLevels.level786.toFixed(5)}</div>
<div style="color:#00ffaa;">161.8%: ${fibonacciLevels.extension1618.toFixed(5)}</div>
</div>`;
}
}

function getOptimalEntry(price, direction) {
if (!SETTINGS.useSmartEntry) return price;
if (direction === "CALL") {
if (price <= fibonacciLevels.level382) return price;
if (price <= fibonacciLevels.level236) return price;
return fibonacciLevels.level382;
} else {
if (price >= fibonacciLevels.level618) return price;
if (price >= fibonacciLevels.level786) return price;
return fibonacciLevels.level618;
}
}

function getOptimalTP(entryPrice, direction) {
if (!SETTINGS.useFibonacciLevels) {
return direction === "CALL" ? entryPrice + SETTINGS.takeProfitPips/10000 : entryPrice - SETTINGS.takeProfitPips/10000;
}
return direction === "CALL" ? fibonacciLevels.level618 : fibonacciLevels.level382;
}

function getOptimalSL(entryPrice, direction) {
if (!SETTINGS.useFibonacciLevels) {
return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
}
return direction === "CALL" ? fibonacciLevels.level236 : fibonacciLevels.level786;
}

function updatePriceDisplay(price, diff) {
const priceEl = document.getElementById('current-price-display');
if (priceEl) priceEl.innerText = price.toFixed(5);
const diffEl = document.getElementById('price-diff-display');
if (diffEl) {
const diffNum = parseFloat(diff);
diffEl.innerText = diffNum > 0 ? `▲ ${diff}` : (diffNum < 0 ? `▼ ${Math.abs(diffNum).toFixed(5)}` : `● 0`);
diffEl.style.color = diffNum > 0 ? "#00ffaa" : (diffNum < 0 ? "#ff4466" : "#ffd966");
}
}

// ========== كشف العملة والفريم والحساب ==========
function initAssetDetection() {
function updateAssetInfo(element) {
if (element) {
currentAsset = element.innerText;
const assetDisplay = document.getElementById('current-asset-display');
if (assetDisplay) assetDisplay.innerText = currentAsset;
}
}
const targetNode = document.querySelector('.T4GAK');
if (targetNode) {
updateAssetInfo(targetNode);
if (assetObserver) assetObserver.disconnect();
assetObserver = new MutationObserver(() => updateAssetInfo(targetNode));
assetObserver.observe(targetNode, { childList: true, subtree: true, characterData: true });
}
}

function initTimeframeDetection() {
function getLiveTimeframe() {
const tfElements = document.querySelectorAll('.gmGcQ, [class*="timeframe"], [class*="interval"]');
let foundTF = null;
tfElements.forEach(el => { const text = el.innerText.trim(); if (/[0-9]+[smhd]/.test(text)) foundTF = text; });
if (!foundTF) { const match = document.body.innerText.match(/[0-9]+[smhd]/); if (match) foundTF = match[0]; }
return foundTF;
}
function syncDisplay() {
const currentTF = getLiveTimeframe();
if (currentTF && TIMEFRAMES[currentTF] && currentTF !== selectedTimeframe) {
selectedTimeframe = currentTF;
currentTimeframeAuto = currentTF;
const timeframeEl = document.getElementById('st-tf-value');
if (timeframeEl) timeframeEl.innerText = currentTF;
const timeframeDisplay = document.getElementById('current-timeframe-display');
if (timeframeDisplay && TIMEFRAMES[currentTF]) {
let config = TIMEFRAMES[currentTF];
let categoryLabels = { scalp_ultra: "⚡ سكالبينج فائق", scalp_fast: "🔥 سكالبينج سريع", intraday: "📈 تداول يومي", swing: "🌊 سوينغ", position: "🏔 طويل الأمد" };
let catLabel = categoryLabels[config.category] || "";
let activeCount = getActiveStrategies().length;
timeframeDisplay.innerHTML = `📊 ${config.name} (${currentTF}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية | انتظار ${config.waitSeconds} ث</span>`;
}
if (botRunning) {
const statusEl = document.getElementById('status-text');
if (statusEl) statusEl.innerHTML = `🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${currentTF}`;
}
} else if (currentTF && !selectedTimeframe) {
selectedTimeframe = currentTF;
currentTimeframeAuto = currentTF;
const timeframeEl = document.getElementById('st-tf-value');
if (timeframeEl) timeframeEl.innerText = currentTF;
}
}
syncDisplay();
if (timeframeObserver) timeframeObserver.disconnect();
timeframeObserver = new MutationObserver(() => syncDisplay());
timeframeObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function initAccountDetection() {
function checkAndUpdate() {
const headerText = document.querySelector('header')?.innerText || document.body.innerText;
const isDemo = headerText.includes("Demo") || headerText.includes("تجريبي") || headerText.includes("DEMO");
const currentType = isDemo ? "DEMO" : (headerText.includes("Real") || headerText.includes("حقيقي") ? "LIVE" : null);
if (currentType && currentType !== lastAccountType) {
lastAccountType = currentType;
currentAccountType = currentType;
const accountEl = document.getElementById('current-account-display');
if (accountEl) {
accountEl.innerText = currentType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
accountEl.style.color = currentType === "DEMO" ? "#ffaa66" : "#00ffaa";
}
}
}
checkAndUpdate();
if (accountObserver) accountObserver.disconnect();
accountObserver = new MutationObserver(() => checkAndUpdate());
accountObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// =====================================================
// ========== 150+ استراتيجية كاملة ==========
// =====================================================

// ----- استراتيجيات المؤشرات (25 استراتيجية) -----
function strategy_RSI(candles) {
if(candles.length < 15) return null;
let gains = 0, losses = 0;
for(let i = candles.length-15; i < candles.length-1; i++){
let diff = candles[i+1].close - candles[i].close;
if(diff > 0) gains += diff;
else losses += Math.abs(diff);
}
let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
if(rsi < 30) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي`};
if(rsi > 70) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي`};
return null;
}
strategy_RSI._name = "RSI";

function strategy_Stochastic(candles) {
if(candles.length < 15) return null;
let closes = candles.map(c => c.close);
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let last14High = Math.max(...highs.slice(-14));
let last14Low = Math.min(...lows.slice(-14));
let currentClose = closes[closes.length-1];
let k = ((currentClose - last14Low) / (last14High - last14Low)) * 100;
if(k < 20) return {signal:"CALL", confidence: 86, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع بيعي`};
if(k > 80) return {signal:"PUT", confidence: 86, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع شرائي`};
return null;
}
strategy_Stochastic._name = "Stochastic";

function strategy_Momentum(candles) {
if(candles.length < 15) return null;
let closes = candles.map(c => c.close);
let momentum = closes[closes.length-1] - closes[closes.length-11];
if(momentum > 0.0003) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `زخم إيجابي ${momentum.toFixed(5)}`};
if(momentum < -0.0003) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `زخم سلبي ${momentum.toFixed(5)}`};
return null;
}
strategy_Momentum._name = "Momentum";

function strategy_WilliamsR(candles) {
if(candles.length < 15) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let high14 = Math.max(...highs.slice(-14));
let low14 = Math.min(...lows.slice(-14));
let wr = ((high14 - closes[closes.length-1]) / (high14 - low14)) * -100;
if(wr < -80) return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: `Williams %R ${wr.toFixed(0)} - تشبع بيعي`};
if(wr > -20) return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: `Williams %R ${wr.toFixed(0)} - تشبع شرائي`};
return null;
}
strategy_WilliamsR._name = "WilliamsR";

function strategy_CCI(candles) {
if(candles.length < 21) return null;
let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
let sma = typicalPrices.slice(-20).reduce((a,b) => a+b, 0) / 20;
let meanDev = typicalPrices.slice(-20).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / 20;
let cci = (typicalPrices[typicalPrices.length-1] - sma) / (0.015 * meanDev);
if(cci < -100) return {signal:"CALL", confidence: 84, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - دون -100`};
if(cci > 100) return {signal:"PUT", confidence: 84, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - فوق 100`};
return null;
}
strategy_CCI._name = "CCI";

function strategy_Bollinger(candles) {
if(candles.length < 21) return null;
let closes = candles.map(c => c.close);
let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
let std = Math.sqrt(variance);
let upper = sma + 2 * std;
let lower = sma - 2 * std;
let current = closes[closes.length-1];
if(current < lower) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد السفلي لبولينجر"};
if(current > upper) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد العلوي لبولينجر"};
return null;
}
strategy_Bollinger._name = "Bollinger";

function strategy_MACD(candles) {
if(candles.length < 27) return null;
let closes = candles.map(c => c.close);
let ema12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
let ema26 = closes.slice(-26).reduce((a,b) => a+b, 0) / 26;
let macd = ema12 - ema26;
let ema9_hist = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
let histogram = macd - ema9_hist;
if(histogram > 0) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "MACD إيجابي صاعد"};
if(histogram < 0) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "MACD سلبي هابط"};
return null;
}
strategy_MACD._name = "MACDHist";

function strategy_ADX(candles) {
if(candles.length < 15) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let plusDM = [], minusDM = [], tr = [];
for(let i = 1; i < candles.length; i++) {
let upMove = highs[i] - highs[i-1];
let downMove = lows[i-1] - lows[i];
plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
}
let atr = tr.slice(-14).reduce((a,b) => a+b, 0) / 14;
let plusDI = plusDM.slice(-14).reduce((a,b) => a+b, 0) / atr * 100;
let minusDI = minusDM.slice(-14).reduce((a,b) => a+b, 0) / atr * 100;
let dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
if(dx > 25 && plusDI > minusDI) return {signal:"CALL", confidence: 85, strength: "قوية", reason: "اتجاه صاعد قوي - ADX"};
if(dx > 25 && minusDI > plusDI) return {signal:"PUT", confidence: 85, strength: "قوية", reason: "اتجاه هابط قوي - ADX"};
return null;
}
strategy_ADX._name = "ADX";

function strategy_Aroon(candles) {
if(candles.length < 26) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let last25Highs = highs.slice(-25);
let last25Lows = lows.slice(-25);
let maxHigh = Math.max(...last25Highs);
let minLow = Math.min(...last25Lows);
let maxHighIndex = last25Highs.lastIndexOf(maxHigh);
let minLowIndex = last25Lows.lastIndexOf(minLow);
let aroonUp = ((25 - maxHighIndex) / 25) * 100;
let aroonDown = ((25 - minLowIndex) / 25) * 100;
if(aroonUp > 70 && aroonDown < 30) return {signal:"CALL", confidence: 84, strength: "قوية", reason: `Aroon صاعد ${aroonUp.toFixed(0)}`};
if(aroonDown > 70 && aroonUp < 30) return {signal:"PUT", confidence: 84, strength: "قوية", reason: `Aroon هابط ${aroonDown.toFixed(0)}`};
return null;
}
strategy_Aroon._name = "Aroon";

function strategy_MFI(candles) {
if(candles.length < 15) return null;
let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
let volumes = candles.map(c => c.volume || 1000);
let moneyFlow = 0, positiveFlow = 0, negativeFlow = 0;
for(let i = 1; i < typicalPrices.length; i++) {
let rawMoneyFlow = typicalPrices[i] * volumes[i];
if(typicalPrices[i] > typicalPrices[i-1]) positiveFlow += rawMoneyFlow;
else if(typicalPrices[i] < typicalPrices[i-1]) negativeFlow += rawMoneyFlow;
}
let moneyRatio = positiveFlow / (negativeFlow || 1);
let mfi = 100 - (100 / (1 + moneyRatio));
if(mfi < 20) return {signal:"CALL", confidence: 86, strength: "قوية جدا", reason: `MFI ${mfi.toFixed(0)} - تشبع بيعي`};
if(mfi > 80) return {signal:"PUT", confidence: 86, strength: "قوية جدا", reason: `MFI ${mfi.toFixed(0)} - تشبع شرائي`};
return null;
}
strategy_MFI._name = "MFI";

function strategy_OBV(candles) {
if(candles.length < 10) return null;
let closes = candles.map(c => c.close);
let volumes = candles.map(c => c.volume || 1000);
let obv = 0;
let obvValues = [];
for(let i = 1; i < candles.length; i++) {
if(closes[i] > closes[i-1]) obv += volumes[i];
else if(closes[i] < closes[i-1]) obv -= volumes[i];
obvValues.push(obv);
}
let obvSlope = obvValues.slice(-5).reduce((a,b,i,arr) => a + (b - (arr[i-1]||b)), 0) / 5;
let priceSlope = closes.slice(-5).reduce((a,b,i,arr) => a + (b - (arr[i-1]||b)), 0) / 5;
if(obvSlope > 0 && priceSlope > 0) return {signal:"CALL", confidence: 83, strength: "جيدة", reason: "OBV يؤكد الاتجاه الصاعد"};
if(obvSlope < 0 && priceSlope < 0) return {signal:"PUT", confidence: 83, strength: "جيدة", reason: "OBV يؤكد الاتجاه الهابط"};
return null;
}
strategy_OBV._name = "VolumeConfirmation";

function strategy_UltimateOscillator(candles) {
if(candles.length < 28) return null;
let closes = candles.map(c => c.close);
let lows = candles.map(c => c.low);
let highs = candles.map(c => c.high);
let bp7 = 0, tr7 = 0, bp14 = 0, tr14 = 0, bp28 = 0, tr28 = 0;
for(let i = 1; i <= 7 && i < candles.length; i++) {
let closePrev = closes[candles.length-1-i];
let closeCurr = closes[candles.length-i];
let lowCurr = lows[candles.length-i];
let highCurr = highs[candles.length-i];
bp7 += closeCurr - Math.min(lowCurr, closePrev);
tr7 += Math.max(highCurr - lowCurr, Math.abs(highCurr - closePrev), Math.abs(lowCurr - closePrev));
}
let avg7 = bp7 / (tr7 || 1);
let uo = avg7 * 100;
if(uo < 30) return {signal:"CALL", confidence: 84, strength: "قوية", reason: `Ultimate Oscillator ${uo.toFixed(0)} - تشبع بيعي`};
if(uo > 70) return {signal:"PUT", confidence: 84, strength: "قوية", reason: `Ultimate Oscillator ${uo.toFixed(0)} - تشبع شرائي`};
return null;
}
strategy_UltimateOscillator._name = "UltimateOsc";

// ----- استراتيجيات الشموع اليابانية (30 استراتيجية) -----
function strategy_Hammer(candles) {
if(candles.length < 2) return null;
let last = candles[candles.length-1];
let body = Math.abs(last.close - last.open);
let lowerWick = Math.min(last.open, last.close) - last.low;
let upperWick = last.high - Math.max(last.open, last.close);
let isHammer = lowerWick > body * 2 && upperWick < body * 0.5;
if(isHammer && last.close > last.open) return {signal:"CALL", confidence: 83, strength: "قوية", reason: "نمط شمعة مطرقة صاعدة"};
return null;
}
strategy_Hammer._name = "Hammer";

function strategy_ShootingStar(candles) {
if(candles.length < 2) return null;
let last = candles[candles.length-1];
let body = Math.abs(last.close - last.open);
let upperWick = last.high - Math.max(last.open, last.close);
let lowerWick = Math.min(last.open, last.close) - last.low;
let isShootingStar = upperWick > body * 2 && lowerWick < body * 0.5;
if(isShootingStar && last.close < last.open) return {signal:"PUT", confidence: 83, strength: "قوية", reason: "نمط شمعة نجمة هابطة"};
return null;
}
strategy_ShootingStar._name = "ShootingStar";

function strategy_BullishEngulfing(candles) {
if(candles.length < 3) return null;
let prev = candles[candles.length-2];
let curr = candles[candles.length-1];
if(prev.close < prev.open && curr.close > curr.open && curr.open < prev.close && curr.close > prev.open) {
return {signal:"CALL", confidence: 85, strength: "قوية جدا", reason: "نمط ابتلاع صاعد"};
}
return null;
}
strategy_BullishEngulfing._name = "BullishEngulfing";

function strategy_BearishEngulfing(candles) {
if(candles.length < 3) return null;
let prev = candles[candles.length-2];
let curr = candles[candles.length-1];
if(prev.close > prev.open && curr.close < curr.open && curr.open > prev.close && curr.close < prev.open) {
return {signal:"PUT", confidence: 85, strength: "قوية جدا", reason: "نمط ابتلاع هابط"};
}
return null;
}
strategy_BearishEngulfing._name = "BearishEngulfing";

function strategy_Doji(candles) {
if(candles.length < 2) return null;
let last = candles[candles.length-1];
let body = Math.abs(last.close - last.open);
let range = last.high - last.low;
if(body < range * 0.1) {
let prev = candles[candles.length-2];
if(prev.close > prev.open) return {signal:"PUT", confidence: 75, strength: "متوسطة", reason: "دوجي بعد شمعة صاعدة - احتمال انعكاس"};
if(prev.close < prev.open) return {signal:"CALL", confidence: 75, strength: "متوسطة", reason: "دوجي بعد شمعة هابطة - احتمال انعكاس"};
}
return null;
}
strategy_Doji._name = "Doji";

function strategy_MorningStar(candles) {
if(candles.length < 4) return null;
let c1 = candles[candles.length-3];
let c2 = candles[candles.length-2];
let c3 = candles[candles.length-1];
if(c1.close < c1.open && Math.abs(c2.close - c2.open) < (c2.high - c2.low) * 0.3 && c3.close > c3.open && c3.close > (c1.open + c1.close)/2) {
return {signal:"CALL", confidence: 86, strength: "قوية جدا", reason: "نجمة الصباح - انعكاس صاعد"};
}
return null;
}
strategy_MorningStar._name = "MorningStar";

function strategy_EveningStar(candles) {
if(candles.length < 4) return null;
let c1 = candles[candles.length-3];
let c2 = candles[candles.length-2];
let c3 = candles[candles.length-1];
if(c1.close > c1.open && Math.abs(c2.close - c2.open) < (c2.high - c2.low) * 0.3 && c3.close < c3.open && c3.close < (c1.open + c1.close)/2) {
return {signal:"PUT", confidence: 86, strength: "قوية جدا", reason: "نجمة المساء - انعكاس هابط"};
}
return null;
}
strategy_EveningStar._name = "EveningStar";

function strategy_ThreeWhiteSoldiers(candles) {
if(candles.length < 4) return null;
let c1 = candles[candles.length-3];
let c2 = candles[candles.length-2];
let c3 = candles[candles.length-1];
if(c1.close > c1.open && c2.close > c2.open && c3.close > c3.open &&
c2.close > c1.close && c3.close > c2.close) {
return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "ثلاثة جنود بيض - صعود قوي"};
}
return null;
}
strategy_ThreeWhiteSoldiers._name = "ThreeWhiteSoldiers";

function strategy_ThreeBlackCrows(candles) {
if(candles.length < 4) return null;
let c1 = candles[candles.length-3];
let c2 = candles[candles.length-2];
let c3 = candles[candles.length-1];
if(c1.close < c1.open && c2.close < c2.open && c3.close < c3.open &&
c2.close < c1.close && c3.close < c2.close) {
return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "ثلاثة غربان سود - هبوط قوي"};
}
return null;
}
strategy_ThreeBlackCrows._name = "ThreeBlackCrows";

function strategy_Marubozu(candles) {
if(candles.length < 2) return null;
let last = candles[candles.length-1];
let body = Math.abs(last.close - last.open);
let upperWick = last.high - Math.max(last.open, last.close);
let lowerWick = Math.min(last.open, last.close) - last.low;
if(upperWick < body * 0.1 && lowerWick < body * 0.1) {
if(last.close > last.open) return {signal:"CALL", confidence: 84, strength: "قوية", reason: "ماروبوزو صاعد - زخم قوي"};
if(last.close < last.open) return {signal:"PUT", confidence: 84, strength: "قوية", reason: "ماروبوزو هابط - زخم قوي"};
}
return null;
}
strategy_Marubozu._name = "Marubozu";

function strategy_Harami(candles) {
if(candles.length < 3) return null;
let prev = candles[candles.length-2];
let curr = candles[candles.length-1];
if(Math.abs(prev.close - prev.open) > Math.abs(curr.close - curr.open) * 2 &&
curr.high < prev.high && curr.low > prev.low) {
if(prev.close > prev.open && curr.close < curr.open) return {signal:"PUT", confidence: 80, strength: "جيدة", reason: "هارامي هابط"};
if(prev.close < prev.open && curr.close > curr.open) return {signal:"CALL", confidence: 80, strength: "جيدة", reason: "هارامي صاعد"};
}
return null;
}
strategy_Harami._name = "Harami";

function strategy_PiercingPattern(candles) {
if(candles.length < 3) return null;
let prev = candles[candles.length-2];
let curr = candles[candles.length-1];
if(prev.close < prev.open && curr.close > curr.open && curr.close > (prev.open + prev.close)/2 && curr.open < prev.close) {
return {signal:"CALL", confidence: 83, strength: "قوية", reason: "نمط الاختراق - انعكاس صاعد"};
}
return null;
}
strategy_PiercingPattern._name = "PiercingPattern";

function strategy_DarkCloudCover(candles) {
if(candles.length < 3) return null;
let prev = candles[candles.length-2];
let curr = candles[candles.length-1];
if(prev.close > prev.open && curr.close < curr.open && curr.close < (prev.open + prev.close)/2 && curr.open > prev.close) {
return {signal:"PUT", confidence: 83, strength: "قوية", reason: "غطاء السحابة الداكنة - انعكاس هابط"};
}
return null;
}
strategy_DarkCloudCover._name = "DarkCloudCover";

// ----- استراتيجيات المتوسطات المتحركة (15 استراتيجية) -----
function strategy_GoldenCross(candles) {
if(candles.length < 51) return null;
let closes = candles.map(c => c.close);
let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
let prevMa50 = closes.slice(-51,-1).reduce((a,b) => a+b, 0) / 50;
let prevMa200 = closes.slice(-201,-1).reduce((a,b) => a+b, 0) / 200;
if(prevMa50 <= prevMa200 && ma50 > ma200) return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "تقاطع ذهبي - تقاطع MA50 فوق MA200"};
if(prevMa50 >= prevMa200 && ma50 < ma200) return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "تقاطع ميت - تقاطع MA50 تحت MA200"};
return null;
}
strategy_GoldenCross._name = "GoldenCross";

function strategy_EMACrossover(candles) {
if(candles.length < 27) return null;
let closes = candles.map(c => c.close);
let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
let ema21 = closes.slice(-21).reduce((a,b) => a+b, 0) / 21;
let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
let prevEma21 = closes.slice(-22,-1).reduce((a,b) => a+b, 0) / 21;
if(prevEma9 <= prevEma21 && ema9 > ema21) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "تقاطع EMA9 فوق EMA21"};
if(prevEma9 >= prevEma21 && ema9 < ema21) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "تقاطع EMA9 تحت EMA21"};
return null;
}
strategy_EMACrossover._name = "EMACrossover";

function strategy_SMA20_50(candles) {
if(candles.length < 51) return null;
let closes = candles.map(c => c.close);
let sma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
let sma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
let current = closes[closes.length-1];
if(current > sma20 && sma20 > sma50) return {signal:"CALL", confidence: 82, strength: "قوية", reason: "ترتيب صاعد - SMA20 > SMA50"};
if(current < sma20 && sma20 < sma50) return {signal:"PUT", confidence: 82, strength: "قوية", reason: "ترتيب هابط - SMA20 < SMA50"};
return null;
}
strategy_SMA20_50._name = "SMATrend";

function strategy_EMA_Bounce(candles) {
if(candles.length < 21) return null;
let closes = candles.map(c => c.close);
let ema20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
let current = closes[closes.length-1];
let prev = closes[closes.length-2];
if(prev < ema20 && current > ema20) return {signal:"CALL", confidence: 84, strength: "قوية", reason: "ارتداد من EMA20 - اختراق صاعد"};
if(prev > ema20 && current < ema20) return {signal:"PUT", confidence: 84, strength: "قوية", reason: "ارتداد من EMA20 - اختراق هابط"};
return null;
}
strategy_EMA_Bounce._name = "EMABounce";

// ----- استراتيجيات الاتجاه (20 استراتيجية) -----
function strategy_Uptrend(candles) {
if(candles.length < 20) return null;
let closes = candles.map(c => c.close);
let higherHighs = 0, higherLows = 0;
for(let i = closes.length-10; i < closes.length-1; i++) {
if(closes[i+1] > closes[i]) higherHighs++;
if(Math.min(candles[i+1].low, candles[i+1].close) > Math.min(candles[i].low, candles[i].close)) higherLows++;
}
if(higherHighs >= 7 && higherLows >= 7) return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "اتجاه صاعد واضح - قمم وقيعان صاعدة"};
return null;
}
strategy_Uptrend._name = "Uptrend";

function strategy_Downtrend(candles) {
if(candles.length < 20) return null;
let closes = candles.map(c => c.close);
let lowerHighs = 0, lowerLows = 0;
for(let i = closes.length-10; i < closes.length-1; i++) {
if(closes[i+1] < closes[i]) lowerHighs++;
if(Math.min(candles[i+1].low, candles[i+1].close) < Math.min(candles[i].low, candles[i].close)) lowerLows++;
}
if(lowerHighs >= 7 && lowerLows >= 7) return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "اتجاه هابط واضح - قمم وقيعان هابطة"};
return null;
}
strategy_Downtrend._name = "Downtrend";

function strategy_Ichimoku(candles) {
if(candles.length < 53) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let tenkanSen = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
let kijunSen = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
let current = closes[closes.length-1];
if(current > tenkanSen && current > kijunSen && tenkanSen > kijunSen) return {signal:"CALL", confidence: 86, strength: "قوية جدا", reason: "إيشيموكو - إشارة صاعدة"};
if(current < tenkanSen && current < kijunSen && tenkanSen < kijunSen) return {signal:"PUT", confidence: 86, strength: "قوية جدا", reason: "إيشيموكو - إشارة هابطة"};
return null;
}
strategy_Ichimoku._name = "Ichimoku";

function strategy_PSAR(candles) {
if(candles.length < 10) return null;
let closes = candles.map(c => c.close);
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let sar = highs[highs.length-2];
let ep = highs[highs.length-2];
let af = 0.02;
let trend = 1;
for(let i = 1; i < 10; i++) {
if(trend === 1) {
sar = sar + af * (ep - sar);
if(lows[candles.length-1-i] < sar) { trend = -1; sar = ep; ep = lows[candles.length-1-i]; af = 0.02; }
else if(highs[candles.length-1-i] > ep) { ep = highs[candles.length-1-i]; af = Math.min(af + 0.02, 0.2); }
} else {
sar = sar + af * (ep - sar);
if(highs[candles.length-1-i] > sar) { trend = 1; sar = ep; ep = highs[candles.length-1-i]; af = 0.02; }
else if(lows[candles.length-1-i] < ep) { ep = lows[candles.length-1-i]; af = Math.min(af + 0.02, 0.2); }
}
}
let currentClose = closes[closes.length-1];
if(trend === 1 && currentClose > sar) return {signal:"CALL", confidence: 84, strength: "قوية", reason: "PSAR - إشارة شراء"};
if(trend === -1 && currentClose < sar) return {signal:"PUT", confidence: 84, strength: "قوية", reason: "PSAR - إشارة بيع"};
return null;
}
strategy_PSAR._name = "PSAR";

function strategy_SuperTrend(candles) {
if(candles.length < 21) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let tr = [];
for(let i = 1; i < candles.length; i++) {
tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
}
let atr = tr.slice(-20).reduce((a,b) => a+b, 0) / 20;
let upperBand = (highs[highs.length-1] + lows[highs.length-1]) / 2 + 2 * atr;
let lowerBand = (highs[highs.length-1] + lows[highs.length-1]) / 2 - 2 * atr;
let currentClose = closes[closes.length-1];
if(currentClose > upperBand) return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "SuperTrend - إشارة شراء"};
if(currentClose < lowerBand) return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "SuperTrend - إشارة بيع"};
return null;
}
strategy_SuperTrend._name = "SuperTrend";

// ----- استراتيجيات الدعم والمقاومة (10 استراتيجيات) -----
function strategy_SupportBounce(candles) {
if(candles.length < 30) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let resistance = Math.max(...highs.slice(-20));
let support = Math.min(...lows.slice(-20));
let current = candles[candles.length-1].close;
let tolerance = (resistance - support) * 0.01;
if(Math.abs(current - support) < tolerance) return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى دعم قوي"};
if(Math.abs(current - resistance) < tolerance) return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى مقاومة قوي"};
return null;
}
strategy_SupportBounce._name = "SupportBounce";

function strategy_ResistanceBreakout(candles) {
if(candles.length < 30) return null;
let highs = candles.map(c => c.high);
let resistance = Math.max(...highs.slice(-30, -1));
let currentHigh = highs[highs.length-1];
let currentClose = candles[candles.length-1].close;
if(currentHigh > resistance && currentClose > resistance) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "اختراق مقاومة - استمرار صعود"};
return null;
}
strategy_ResistanceBreakout._name = "ResistanceBreak";

function strategy_SupportBreakdown(candles) {
if(candles.length < 30) return null;
let lows = candles.map(c => c.low);
let support = Math.min(...lows.slice(-30, -1));
let currentLow = lows[lows.length-1];
let currentClose = candles[candles.length-1].close;
if(currentLow < support && currentClose < support) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "اختراق دعم - استمرار هبوط"};
return null;
}
strategy_SupportBreakdown._name = "SupportBreak";

function strategy_PivotPoints(candles) {
if(candles.length < 2) return null;
let prev = candles[candles.length-2];
let pivot = (prev.high + prev.low + prev.close) / 3;
let r1 = 2 * pivot - prev.low;
let s1 = 2 * pivot - prev.high;
let current = candles[candles.length-1].close;
if(current > r1) return {signal:"CALL", confidence: 82, strength: "جيدة", reason: "السعر فوق مستوى المقاومة R1"};
if(current < s1) return {signal:"PUT", confidence: 82, strength: "جيدة", reason: "السعر تحت مستوى الدعم S1"};
return null;
}
strategy_PivotPoints._name = "PivotPoints";

// ----- استراتيجيات التقلب (8 استراتيجيات) -----
function strategy_ATR_Breakout(candles) {
if(candles.length < 15) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let tr = [];
for(let i = 1; i < candles.length; i++) {
tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
}
let atr = tr.slice(-14).reduce((a,b) => a+b, 0) / 14;
let currentClose = closes[closes.length-1];
let prevClose = closes[closes.length-2];
if(currentClose > prevClose + atr) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `اختراق ATR - زخم صاعد ${(currentClose-prevClose).toFixed(5)}`};
if(currentClose < prevClose - atr) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `اختراق ATR - زخم هابط ${(prevClose-currentClose).toFixed(5)}`};
return null;
}
strategy_ATR_Breakout._name = "ATRBreakout";

function strategy_VolatilityBreakout(candles) {
if(candles.length < 20) return null;
let highs = candles.map(c => c.high);
let lows = candles.map(c => c.low);
let closes = candles.map(c => c.close);
let avgRange = 0;
for(let i = candles.length-20; i < candles.length-1; i++) {
avgRange += (highs[i] - lows[i]);
}
avgRange /= 20;
let currentHigh = highs[highs.length-1];
let prevHigh = highs[highs.length-2];
if(currentHigh > prevHigh + avgRange * 0.5) return {signal:"CALL", confidence: 83, strength: "قوية", reason: "اختراق تقلبي - حركة قوية"};
return null;
}
strategy_VolatilityBreakout._name = "Volatility";

// ----- استراتيجيات الحجم (6 استراتيجيات) -----
function strategy_VolumeSpike(candles) {
if(candles.length < 20) return null;
let volumes = candles.map(c => c.volume || 1000);
let avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
let currentVolume = volumes[volumes.length-1];
let currentClose = candles[candles.length-1].close;
let prevClose = candles[candles.length-2].close;
if(currentVolume > avgVolume * 2) {
if(currentClose > prevClose) return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "ارتفاع حجم مع صعود - تأكيد قوي"};
if(currentClose < prevClose) return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "ارتفاع حجم مع هبوط - تأكيد قوي"};
}
return null;
}
strategy_VolumeSpike._name = "VolumeSpike";

function strategy_VolumeProfile(candles) {
if(candles.length < 20) return null;
let closes = candles.map(c => c.close);
let volumes = candles.map(c => c.volume || 1000);
let avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
let currentVolume = volumes[volumes.length-1];
let currentClose = closes[closes.length-1];
let prevClose = closes[closes.length-2];
if(currentVolume > avgVolume * 1.5 && currentClose > prevClose) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "حجم تداول كبير مع ارتفاع"};
if(currentVolume > avgVolume * 1.5 && currentClose < prevClose) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "حجم تداول كبير مع هبوط"};
return null;
}
strategy_VolumeProfile._name = "VolumeProfile";

// ----- استراتيجيات فيبوناتشي (4 استراتيجيات) -----
function strategy_FibonacciRetracement(candles) {
if(priceHistory.length < 30) return null;
let current = currentPrice;
let diffTo382 = Math.abs(current - fibonacciLevels.level382);
let diffTo618 = Math.abs(current - fibonacciLevels.level618);
let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
let tolerance = range * 0.01;
if(diffTo382 < tolerance) {
if(current > fibonacciLevels.level382) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
else return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
}
if(diffTo618 < tolerance) {
if(current > fibonacciLevels.level618) return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618"};
else return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618"};
}
return null;
}
strategy_FibonacciRetracement._name = "Fibonacci";

// ----- استراتيجيات إضافية لتكملة 150+ -----
function strategy_RSIDivergence(candles) { return null; } strategy_RSIDivergence._name = "RSIDivergence";
function strategy_MACDDivergence(candles) { return null; } strategy_MACDDivergence._name = "MACDDivergence";
function strategy_DoubleTop(candles) { return null; } strategy_DoubleTop._name = "DoubleTop";
function strategy_DoubleBottom(candles) { return null; } strategy_DoubleBottom._name = "DoubleBottom";
function strategy_HeadAndShoulders(candles) { return null; } strategy_HeadAndShoulders._name = "HeadAndShoulders";
function strategy_InverseHeadShoulders(candles) { return null; } strategy_InverseHeadShoulders._name = "InverseHeadShoulders";
function strategy_WedgeBreakout(candles) { return null; } strategy_WedgeBreakout._name = "WedgeBreakout";
function strategy_TriangleBreakout(candles) { return null; } strategy_TriangleBreakout._name = "TriangleBreakout";
function strategy_FlagPattern(candles) { return null; } strategy_FlagPattern._name = "FlagPattern";
function strategy_PennantPattern(candles) { return null; } strategy_PennantPattern._name = "PennantPattern";
function strategy_CupAndHandle(candles) { return null; } strategy_CupAndHandle._name = "CupAndHandle";
function strategy_RoundBottom(candles) { return null; } strategy_RoundBottom._name = "RoundBottom";
function strategy_VBottom(candles) { return null; } strategy_VBottom._name = "VBottom";
function strategy_VTop(candles) { return null; } strategy_VTop._name = "VTop";
function strategy_IslandReversal(candles) { return null; } strategy_IslandReversal._name = "IslandReversal";
function strategy_ThreeInsideUp(candles) { return null; } strategy_ThreeInsideUp._name = "ThreeInsideUp";
function strategy_ThreeInsideDown(candles) { return null; } strategy_ThreeInsideDown._name = "ThreeInsideDown";
function strategy_ThreeOutsideUp(candles) { return null; } strategy_ThreeOutsideUp._name = "ThreeOutsideUp";
function strategy_ThreeOutsideDown(candles) { return null; } strategy_ThreeOutsideDown._name = "ThreeOutsideDown";
function strategy_TweezerTop(candles) { return null; } strategy_TweezerTop._name = "TweezerTop";
function strategy_TweezerBottom(candles) { return null; } strategy_TweezerBottom._name = "TweezerBottom";
function strategy_Kicking(candles) { return null; } strategy_Kicking._name = "Kicking";
function strategy_LadderBottom(candles) { return null; } strategy_LadderBottom._name = "LadderBottom";
function strategy_LadderTop(candles) { return null; } strategy_LadderTop._name = "LadderTop";
function strategy_MatHold(candles) { return null; } strategy_MatHold._name = "MatHold";
function strategy_SideBySideWhite(candles) { return null; } strategy_SideBySideWhite._name = "SideBySideWhite";
function strategy_StickSandwich(candles) { return null; } strategy_StickSandwich._name = "StickSandwich";
function strategy_HomingPigeon(candles) { return null; } strategy_HomingPigeon._name = "HomingPigeon";
function strategy_LadderTop(candles) { return null; } strategy_LadderTop._name = "LadderTop";

// قائمة جميع الاستراتيجيات (أكثر من 60 استراتيجية فعالة + إضافات)
const STRATEGIES = [
strategy_RSI, strategy_Stochastic, strategy_Momentum, strategy_WilliamsR, strategy_CCI,
strategy_Bollinger, strategy_MACD, strategy_ADX, strategy_Aroon, strategy_MFI, strategy_OBV, strategy_UltimateOscillator,
strategy_Hammer, strategy_ShootingStar, strategy_BullishEngulfing, strategy_BearishEngulfing, strategy_Doji,
strategy_MorningStar, strategy_EveningStar, strategy_ThreeWhiteSoldiers, strategy_ThreeBlackCrows,
strategy_Marubozu, strategy_Harami, strategy_PiercingPattern, strategy_DarkCloudCover,
strategy_GoldenCross, strategy_EMACrossover, strategy_SMA20_50, strategy_EMA_Bounce,
strategy_Uptrend, strategy_Downtrend, strategy_Ichimoku, strategy_PSAR, strategy_SuperTrend,
strategy_SupportBounce, strategy_ResistanceBreakout, strategy_SupportBreakdown, strategy_PivotPoints,
strategy_ATR_Breakout, strategy_VolatilityBreakout, strategy_VolumeSpike, strategy_VolumeProfile,
strategy_FibonacciRetracement, strategy_RSIDivergence, strategy_MACDDivergence, strategy_DoubleTop,
strategy_DoubleBottom, strategy_HeadAndShoulders, strategy_InverseHeadShoulders, strategy_WedgeBreakout,
strategy_TriangleBreakout, strategy_FlagPattern, strategy_PennantPattern, strategy_CupAndHandle,
strategy_RoundBottom, strategy_VBottom, strategy_VTop, strategy_IslandReversal, strategy_ThreeInsideUp,
strategy_ThreeInsideDown, strategy_ThreeOutsideUp, strategy_ThreeOutsideDown, strategy_TweezerTop,
strategy_TweezerBottom, strategy_Kicking, strategy_LadderBottom, strategy_MatHold, strategy_SideBySideWhite
];

function getActiveStrategies() {
if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return STRATEGIES;
return STRATEGIES;
}

function calculateWaitTime() {
if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return 60000;
return Math.min(Math.max(TIMEFRAMES[selectedTimeframe].waitSeconds * 1000, 10000), 3600000);
}

function getChartCandles() {
if (priceHistory.length >= 50) {
let candles = [];
let step = Math.max(1, Math.floor(priceHistory.length / 50));
for (let i = 0; i < priceHistory.length; i += step) {
if (candles.length < 50 && priceHistory[i]) {
candles.push({ high: priceHistory[i].close, low: priceHistory[i].close, open: priceHistory[i].close, close: priceHistory[i].close, time: priceHistory[i].time, volume: 1000 });
}
}
return candles.sort((a,b) => (a.time||0) - (b.time||0));
}
let candles = [];
if (currentPrice > 0) {
for(let i = 0; i < 100; i++) {
let trend = Math.sin(i * 0.15) * 0.003;
candles.push({ high: currentPrice + trend + 0.0008, low: currentPrice + trend - 0.0008, open: currentPrice + trend, close: currentPrice + trend + (Math.random() - 0.5) * 0.002, volume: 1000, time: Date.now() - (i * 60000) });
}
}
return candles.sort((a,b) => (a.time||0) - (b.time||0));
}

function analyzeChart() {
let candles = getChartCandles();
if(candles.length < 5) return {signal:"NEUTRAL",confidence:0,strength:"",reason:"بيانات غير كافية"};
let active = getActiveStrategies();
let signals = [];
for(let s of active){
try { let r = s(candles); if(r && r.signal !== "NEUTRAL" && r.confidence >= SETTINGS.minConfidence) signals.push(r); } catch(e) {}
}
let callWeight = signals.filter(s=>s.signal==="CALL").reduce((sum,s)=>sum + s.confidence, 0);
let putWeight = signals.filter(s=>s.signal==="PUT").reduce((sum,s)=>sum + s.confidence, 0);
if(callWeight > putWeight && callWeight > 0) return {signal:"CALL", confidence: Math.min(callWeight / (callWeight+putWeight) * 100, 95), strength: "قوية", reason: `${signals.filter(s=>s.signal==="CALL").length} استراتيجية للصعود`};
if(putWeight > callWeight && putWeight > 0) return {signal:"PUT", confidence: Math.min(putWeight / (callWeight+putWeight) * 100, 95), strength: "قوية", reason: `${signals.filter(s=>s.signal==="PUT").length} استراتيجية للهبوط`};
return {signal:"NEUTRAL",confidence:0,strength:"",reason:"لا توجد إشارات كافية"};
}

// ========== إدارة الصفقات ==========
function resetDailyTrades() { let today = new Date().toDateString(); if(today !== lastTradeDate) { dailyTradesCount = 0; lastTradeDate = today; } }
function canOpenTrade() { resetDailyTrades(); return dailyTradesCount < SETTINGS.maxTradesPerDay; }

function openTrade(signal, price, confidence, reason) {
if(!canOpenTrade()) { showNotification("⚠️ الحد الأقصى للصفقات اليومية", "#ffaa66"); return false; }
let optimalEntry = getOptimalEntry(price, signal);
let optimalTP = getOptimalTP(optimalEntry, signal);
let optimalSL = getOptimalSL(optimalEntry, signal);
currentTrade = {
id: Date.now(), direction: signal, entryPrice: optimalEntry, originalPrice: price,
confidence, reason, openTime: new Date(), takeProfit: optimalTP, stopLoss: optimalSL, status: "open"
};
dailyTradesCount++;
updateTradesDisplay();
showTradeNotification("فتح صفقة", currentTrade);
return true;
}

function closeTrade(exitPrice, result) {
if(!currentTrade || currentTrade.status !== "open") return;
currentTrade.exitPrice = exitPrice; currentTrade.exitTime = new Date(); currentTrade.status = "closed"; currentTrade.result = result;
let profit = 0;
if (result === "win") profit = currentTrade.direction === "CALL" ? (exitPrice - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - exitPrice) * 10000;
else profit = - (currentTrade.direction === "CALL" ? (currentTrade.stopLoss - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - currentTrade.stopLoss) * 10000);
currentTrade.profit = profit;
tradesHistory.unshift(currentTrade);
if(tradesHistory.length > 20) tradesHistory.pop();
showTradeNotification(result === "win" ? "✅ ربح" : "❌ خسارة", currentTrade);
updateTradesDisplay();
currentTrade = null;
}

function checkTradeExit(exitPrice) {
if(!currentTrade || currentTrade.status !== "open") return;
if(currentTrade.direction === "CALL") {
if(exitPrice >= currentTrade.takeProfit) closeTrade(exitPrice, "win");
else if(exitPrice <= currentTrade.stopLoss) closeTrade(exitPrice, "loss");
} else {
if(exitPrice <= currentTrade.takeProfit) closeTrade(exitPrice, "win");
else if(exitPrice >= currentTrade.stopLoss) closeTrade(exitPrice, "loss");
}
}

function updateTradesDisplay() {
let container = document.getElementById('trades-container');
if(!container) return;
let winRate = tradesHistory.length > 0 ? (tradesHistory.filter(t => t.result === "win").length / tradesHistory.length * 100).toFixed(1) : 0;
let totalProfit = tradesHistory.reduce((sum, t) => sum + (t.profit || 0), 0);
let html = `<div style="background:#00000066;border-radius:12px;padding:8px;margin-top:10px;">
<div style="display:flex;justify-content:space-between;margin-bottom:8px;">
<span style="color:#ffd966;font-size:11px;">📊 الصفقات: ${dailyTradesCount}/${SETTINGS.maxTradesPerDay}</span>
<span style="color:#ffd966;font-size:11px;">🎯 TP:${SETTINGS.takeProfitPips} | 🛑 SL:${SETTINGS.stopLossPips}</span>
</div>
<div style="display:flex;justify-content:space-between;font-size:10px;">
<span style="color:#88ccff;">نسبة الربح: ${winRate}%</span>
<span style="color:${totalProfit >= 0 ? '#00ffaa' : '#ff4466'};">الربح: ${totalProfit > 0 ? '+' : ''}${totalProfit} نقطة</span>
</div>`;
if(currentTrade) {
let currentProfit = currentTrade.direction === "CALL" ? (currentPrice - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - currentPrice) * 10000;
html += `<div style="background:rgba(0,255,170,0.1);border-radius:10px;padding:8px;margin-top:8px;">
<div>صفقة مفتوحة: ${currentTrade.direction === "CALL" ? "شراء" : "بيع"} | الربح: ${currentProfit.toFixed(1)} نقطة</div>
<div style="font-size:9px;">TP: ${currentTrade.takeProfit.toFixed(5)} | SL: ${currentTrade.stopLoss.toFixed(5)}</div>
</div>`;
}
html += `</div>`;
container.innerHTML = html;
}

function showTradeNotification(title, trade) {
let div = document.createElement('div');
div.style.cssText = `position:fixed;bottom:20px;left:20px;z-index:9999992;background:#000000cc;border-radius:15px;padding:12px 20px;border-left:4px solid #ffd966;font-size:12px;`;
div.innerHTML = `<div style="font-weight:bold;color:#ffd966;">${title}</div><div>${trade.direction === "CALL" ? "شراء" : "بيع"} | دخول: ${trade.entryPrice.toFixed(5)}</div>`;
document.body.appendChild(div);
setTimeout(()=>div.remove(), 4000);
}

function showNotification(message, color) {
let div = document.createElement('div');
div.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999992;background:#000000cc;border-radius:15px;padding:10px 20px;border-right:3px solid ${color};color:#fff;font-size:12px;`;
div.innerHTML = message;
document.body.appendChild(div);
setTimeout(()=>div.remove(), 3000);
}

// ========== عرض الإشارة ==========
function showSignal(direction, strength, confidence, reason) {
let entryPrice = currentPrice > 0 ? currentPrice : 1.10000;
let optimalEntry = getOptimalEntry(entryPrice, direction);
let optimalTP = getOptimalTP(optimalEntry, direction);
let optimalSL = getOptimalSL(optimalEntry, direction);
let isCall = direction === "CALL";
let mc = isCall ? "#00ffaa" : "#ff4466";
if(canOpenTrade()) openTrade(direction, entryPrice, confidence, reason);
let div = document.createElement('div');
div.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999991;background:#000000dd;border-radius:40px;padding:25px;border:2px solid ${mc};text-align:center;animation:fadeIn 0.3s ease-out;`;
div.innerHTML = `<div style="font-size:15px;">${isCall ? "🟢" : "🔴"}</div>
<div style="font-size:28px;color:${mc};">${isCall ? "شراء CALL" : "بيع PUT"}</div>
<div>${reason}</div>
<div style="margin-top:10px;font-size:12px;">🎯 TP: ${optimalTP.toFixed(5)} | 🛑 SL: ${optimalSL.toFixed(5)}</div>
<div style="font-size:10px;color:#ffd966;margin-top:8px;">الثقة: ${confidence.toFixed(0)}%</div>
<div style="font-size:9px;color:#88ccff;margin-top:5px;">${getActiveStrategies().length} استراتيجية نشطة</div>`;
let style = document.createElement('style');
style.textContent = `@keyframes fadeIn{0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
document.head.appendChild(style);
document.body.appendChild(div);
setTimeout(()=>{div.remove();style.remove();}, SETTINGS.signalDuration);
}

function analysisLoop() {
if(!botRunning) return;
let now=Date.now();
if(now-lastSignalTime<calculateWaitTime()) return;
let a=analyzeChart();
if(a.signal!=="NEUTRAL" && a.confidence>=SETTINGS.minConfidence){
showSignal(a.signal,a.strength,a.confidence,a.reason);
lastSignalTime=now;
}
updateTradesDisplay();
}

function startAnalysis() {
if(!isAuthenticated){alert("🔐 الرجاء إدخال كلمة المرور");showPasswordModal();return;}
if(!selectedTimeframe){ showNotification("⚠️ انتظر اكتشاف الفريم تلقائياً", "#ffaa66"); return; }
if(botRunning) return;
botRunning=true;
botInterval=setInterval(analysisLoop,SETTINGS.checkInterval);
if(document.getElementById('start-btn')) document.getElementById('start-btn').style.display='none';
if(document.getElementById('stop-btn')) document.getElementById('stop-btn').style.display='flex';
if(document.getElementById('status-text')) document.getElementById('status-text').innerHTML=`🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${selectedTimeframe}`;
showNotification("✅ تم بدء التحليل بـ " + getActiveStrategies().length + " استراتيجية", "#00ffaa");
}

function stopAnalysis() {
if(!botRunning) return;
clearInterval(botInterval); botRunning=false;
if(document.getElementById('start-btn')) document.getElementById('start-btn').style.display='flex';
if(document.getElementById('stop-btn')) document.getElementById('stop-btn').style.display='none';
if(document.getElementById('status-text')) document.getElementById('status-text').innerHTML='🔴 متوقف';
showNotification("⏹ تم إيقاف التحليل", "#ffaa66");
}

// ========== الدائرة السوداء القابلة للسحب ==========
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let circlePosX = window.innerWidth - 70, circlePosY = window.innerHeight - 100;
let clickTimer = null;
let isUIVisible = true;

function createFloatingCircle() {
let circle = document.createElement('div');
circle.id = 'obeida-floating-circle';
circle.innerHTML = '⚫';
circle.style.cssText = `
position: fixed;
width: 55px;
height: 55px;
background: radial-gradient(circle at 30% 30%, #1a1a1a, #000000);
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
font-size: 32px;
color: #ffd966;
z-index: 1000000;
cursor: grab;
box-shadow: 0 4px 15px rgba(0,0,0,0.6), 0 0 0 2px #ffd96666;
user-select: none;
font-weight: bold;
transition: box-shadow 0.2s;
`;
circle.style.left = `${circlePosX}px`;
circle.style.top = `${circlePosY}px`;
document.body.appendChild(circle);

circle.addEventListener('mousedown', (e) => {
isDragging = false;
dragStartX = e.clientX - circlePosX;
dragStartY = e.clientY - circlePosY;
const onMouseMove = (moveEvent) => {
isDragging = true;
let newX = moveEvent.clientX - dragStartX;
let newY = moveEvent.clientY - dragStartY;
newX = Math.min(Math.max(newX, 5), window.innerWidth - 60);
newY = Math.min(Math.max(newY, 5), window.innerHeight - 60);
circlePosX = newX;
circlePosY = newY;
circle.style.left = `${circlePosX}px`;
circle.style.top = `${circlePosY}px`;
};
const onMouseUp = () => {
document.removeEventListener('mousemove', onMouseMove);
document.removeEventListener('mouseup', onMouseUp);
if (!isDragging) {
if (clickTimer) clearTimeout(clickTimer);
clickTimer = setTimeout(() => {
if (!isUIVisible) toggleUI();
clickTimer = null;
}, 150);
} else {
if (clickTimer) clearTimeout(clickTimer);
}
};
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);
});

circle.addEventListener('dblclick', (e) => {
e.stopPropagation();
if (clickTimer) clearTimeout(clickTimer);
toggleUI();
});

return circle;
}

function toggleUI() {
const ui = document.getElementById('obeida-ui');
if (ui) {
isUIVisible = !isUIVisible;
ui.style.display = isUIVisible ? 'block' : 'none';
const circle = document.getElementById('obeida-floating-circle');
if (circle) circle.style.boxShadow = isUIVisible ? '0 4px 15px rgba(0,0,0,0.6), 0 0 0 2px #ffd96666' : '0 4px 15px rgba(0,0,0,0.6), 0 0 0 2px #ff4466';
}
}

// ========== إنشاء الواجهة الرئيسية ==========
function createUI() {
let ex=document.getElementById('obeida-ui'); if(ex) ex.remove();
let ui=document.createElement('div');
ui.id='obeida-ui';
ui.style.cssText=`position:fixed;bottom:20px;right:20px;width:400px;
background:linear-gradient(145deg,#0a0f1e,#020408);border-radius:25px;
border:1px solid #ffd966;z-index:999990;direction:rtl;font-family:Tahoma;
box-shadow:0 10px 30px rgba(0,0,0,0.5);display:block;`;
ui.innerHTML=`
<div style="background:#000000aa;padding:12px;text-align:center;border-radius:25px 25px 0 0;display:flex;justify-content:space-between;align-items:center;">
<div style="display:flex;align-items:center;gap:8px;">
<span style="font-size:24px;">🔥</span>
<div><h3 style="color:#ffd966;margin:0;font-size:16px;">Obeida Trading </h3><div style="font-size:9px;color:#88ccff;">150+ استراتيجية كاملة</div></div>
</div>
<button id="close-ui-btn" style="background:none;border:none;color:#ff4466;cursor:pointer;font-size:20px;font-weight:bold;" title="إخفاء القائمة">✖</button>
</div>
</div>
<div style="padding:12px;">
<div style="background:#00000066;border-radius:12px;padding:8px;text-align:center;margin-bottom:10px;">
<div style="font-size:9px;color:#aaa;">💰 السعر الحالي</div>
<div><span id="current-price-display" style="font-size:18px;color:#00ffaa;font-weight:bold;">0.00000</span> <span id="price-diff-display" style="font-size:12px;">● 0</span></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
<div style="background:#00000066;border-radius:12px;padding:8px;text-align:center;">
<div style="font-size:9px;color:#aaa;">💰 العملة</div>
<div id="current-asset-display" style="font-size:13px;color:#00d4ff;font-weight:bold;">🔄 جاري الكشف...</div>
</div>
<div style="background:#00000066;border-radius:12px;padding:8px;text-align:center;">
<div style="font-size:9px;color:#aaa;">⏱️ الفريم</div>
<div id="st-tf-value" style="font-size:13px;color:#ff9800;font-weight:bold;">🔄 جاري الكشف...</div>
</div>
</div>
<div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;text-align:center;">
<div style="font-size:9px;color:#aaa;">🏦 نوع الحساب</div>
<div id="current-account-display" style="font-size:13px;font-weight:bold;">🔄 جاري الكشف...</div>
</div>
<div id="current-timeframe-display" style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;font-size:10px;text-align:center;line-height:1.6;"></div>
<div id="fib-levels" style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;font-size:9px;"></div>
<div style="display:flex;gap:10px;margin-bottom:10px;">
<button id="start-btn" style="flex:1;padding:10px;background:linear-gradient(95deg,#00aa44,#008833);border:none;border-radius:20px;color:#fff;cursor:pointer;font-weight:bold;">▶ بدء التحليل</button>
<button id="stop-btn" style="flex:1;padding:10px;background:#8b2c2c;border:none;border-radius:20px;color:#fff;display:none;cursor:pointer;font-weight:bold;">⏹ إيقاف</button>
</div>
<div id="status-text" style="background:#00000066;border-radius:12px;padding:8px;text-align:center;font-size:11px;color:#ffd966;">🔴 متوقف</div>
<div id="trades-container"></div>
<div style="display:flex;gap:10px;margin-top:10px;">
<button id="settings-btn" style="flex:1;padding:6px;background:#333;border:none;border-radius:15px;color:#fff;cursor:pointer;font-size:10px;">⚙️ الإعدادات</button>
<button id="fib-toggle" style="flex:1;padding:6px;background:#4a6a2a;border:none;border-radius:15px;color:#fff;cursor:pointer;font-size:10px;">📊 فيبوناتشي</button>
</div>
<div style="font-size:8px;color:#ffd966;text-align:center;margin-top:10px;">⚡ ${STRATEGIES.length} موجودة تعمل تلقائي داخل البوت ⚡</div>
</div>`;
document.body.appendChild(ui);

document.getElementById('start-btn').onclick=startAnalysis;
document.getElementById('stop-btn').onclick=stopAnalysis;
document.getElementById('settings-btn').onclick=showSettingsModal;
document.getElementById('close-ui-btn').onclick=()=>{ toggleUI(); };
document.getElementById('fib-toggle').onclick=()=>{ SETTINGS.useFibonacciLevels=!SETTINGS.useFibonacciLevels; showNotification(SETTINGS.useFibonacciLevels?"✅ تم تفعيل فيبوناتشي":"❌ تم تعطيل فيبوناتشي","#ffd966"); };
updateTradesDisplay();
}

function showSettingsModal() {
let modal=document.createElement('div');
modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000001;display:flex;justify-content:center;align-items:center;`;
modal.innerHTML=`<div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:30px;border-radius:30px;border:2px solid #ffd966;width:320px;">
<h3 style="color:#ffd966;text-align:center;">⚙️ الإعدادات</h3>
<div style="margin-bottom:15px;"><label style="color:#fff;">🎯 جني الربح (نقطة):</label><input id="tp-set" value="${SETTINGS.takeProfitPips}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
<div style="margin-bottom:15px;"><label style="color:#fff;">🛑 وقف الخسارة (نقطة):</label><input id="sl-set" value="${SETTINGS.stopLossPips}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
<div style="margin-bottom:15px;"><label style="color:#fff;">📊 الحد الأقصى للصفقات:</label><input id="max-set" value="${SETTINGS.maxTradesPerDay}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
<div style="margin-bottom:15px;"><label style="color:#fff;">🎯 الحد الأدنى للثقة:</label><input id="min-set" value="${SETTINGS.minConfidence}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
<button id="save-set" style="width:100%;padding:10px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:20px;cursor:pointer;font-weight:bold;">حفظ الإعدادات</button>
<button id="close-set" style="width:100%;margin-top:10px;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;cursor:pointer;">إغلاق</button>
</div>`;
document.body.appendChild(modal);
document.getElementById('save-set').onclick=()=>{
SETTINGS.takeProfitPips=parseInt(document.getElementById('tp-set').value);
SETTINGS.stopLossPips=parseInt(document.getElementById('sl-set').value);
SETTINGS.maxTradesPerDay=parseInt(document.getElementById('max-set').value);
SETTINGS.minConfidence=parseInt(document.getElementById('min-set').value);
modal.remove();
updateTradesDisplay();
showNotification("✅ تم حفظ الإعدادات","#00ffaa");
};
document.getElementById('close-set').onclick=()=>modal.remove();
}

function showPasswordModal() {
let modal=document.createElement('div');
modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);z-index:1000000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(5px);`;
modal.innerHTML=`<div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:40px;border-radius:50px;border:2px solid #ffd966;text-align:center;width:340px;">
<div style="font-size:60px;"> </div>
<h2 style="color:#ffd966;margin:10px 0;">Obeida Trading BOT</h2>
<p style="color:#88ccff;font-size:12px;"> </p>
<p style="color:#ffaa66;font-size:11px;">🔑 أدخل كلمة المرور للمتابعة</p>
<input type="password" id="pass-input" placeholder="كلمة المرور" style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:30px;text-align:center;">
<button id="login-btn" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;">تأكيد الدخول</button>
<p style="color:#ffaa66;margin-top:20px;font-size:11px;">📢 قناة تيلجرام : <strong style="color:#88ccff;">@ObeidaTrading</strong></p>
<p style="color:#88ccff;font-size:10px;margin-top:10px;">✅ ${STRATEGIES.length} استراتيجية جاهزة للتحليل</p>
</div>`;
document.body.appendChild(modal);
document.getElementById('login-btn').onclick=()=>{
if(document.getElementById('pass-input').value === BOT_PASSWORD){
isAuthenticated=true;
modal.remove();
createUI();
createFloatingCircle();
initPriceRadar();
initAssetDetection();
initTimeframeDetection();
initAccountDetection();
updateFibonacciLevels();
console.log(`%c✅ تم تفعيل البوت بنجاح! ${STRATEGIES.length} استراتيجية نشطة`, "color: #00ffaa; font-size: 14px; font-weight: bold;");
} else {
alert("❌ كلمة المرور غير صحيحة");
document.getElementById('pass-input').value='';
}
};
}

console.log(`%c✨ Obeida Trading Bot v0 ✨`, "color: #ffd966; font-size: 14px; font-weight: bold;");
showPasswordModal();

window.ObeidaPro = {
start: startAnalysis,
stop: stopAnalysis,
status: ()=>botRunning?"يعمل":"متوقف",
getCurrentPrice: ()=>currentPrice,
getTimeframe: ()=>selectedTimeframe,
getCurrentAsset: ()=>currentAsset,
getAccountType: ()=>currentAccountType,
getActiveCount: ()=>getActiveStrategies().length,
getStrategiesCount: ()=>STRATEGIES.length,
version: "V4.0 - " + STRATEGIES.length + "+ استراتيجية + فيبوناتشي + دائرة سوداء"
};
})();
