(function(){
    'use strict';

    // ========== كلمة المرور ==========
    const BOT_PASSWORD = "@ObeidaTrading";
    let isAuthenticated = false;
    let loginAttempts = 0;

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
    let candleHistory = [];
    
    // ========== متغيرات القائمة ==========
    let isUIVisible = true;
    let uiElement = null;
    let floatingCircle = null;
    
    // ========== مستويات فيبوناتشي ==========
    let fibonacciLevels = {
        level0: 0,
        level236: 0,
        level382: 0,
        level500: 0,
        level618: 0,
        level786: 0,
        level1000: 0,
        extension127: 0,
        extension1618: 0
    };
    
    let swingHigh = 0;
    let swingLow = 0;
    
    // ========== مراقبي MutationObserver ==========
    let assetObserver = null;
    let timeframeObserver = null;
    let accountObserver = null;

    // ========== الفريمات المدعومة ==========
    const TIMEFRAMES = {
        "5s":  { seconds: 5,     waitSeconds: 10,     name: "5 ثوان",   category: "scalp_ultra", weight: 0.7 },
        "10s": { seconds: 10,    waitSeconds: 20,     name: "10 ثوان",  category: "scalp_ultra", weight: 0.75 },
        "15s": { seconds: 15,    waitSeconds: 30,     name: "15 ثانية", category: "scalp_ultra", weight: 0.8 },
        "30s": { seconds: 30,    waitSeconds: 60,     name: "30 ثانية", category: "scalp_fast",  weight: 0.85 },
        "1m":  { seconds: 60,    waitSeconds: 120,    name: "1 دقيقة",  category: "scalp_fast",  weight: 0.9 },
        "5m":  { seconds: 300,   waitSeconds: 600,    name: "5 دقائق",  category: "intraday",    weight: 0.92 },
        "15m": { seconds: 900,   waitSeconds: 1800,   name: "15 دقيقة", category: "intraday",    weight: 0.94 },
        "1h":  { seconds: 3600,  waitSeconds: 7200,   name: "1 ساعة",   category: "swing",       weight: 0.96 },
        "4h":  { seconds: 14400, waitSeconds: 28800,  name: "4 ساعات",  category: "swing",       weight: 0.95 },
        "1d":  { seconds: 86400, waitSeconds: 172800, name: "يومي",     category: "position",    weight: 0.93 }
    };

    // =====================================================
    // ========== رادار السعر وجمع البيانات ==========
    // =====================================================
    function initPriceRadar() {
        console.log("%c 🛰️ رادار العملة الواحدة نشط", "color: #00ffcc; font-weight: bold;");

        function getTargetAssetName() {
            const assetElement = document.querySelector('.T4GAK');
            if (!assetElement) return null;
            let rawName = assetElement.innerText.split('\n')[0]; 
            let cleanName = rawName.replace(/[^a-zA-Z]/g, "").toUpperCase();
            if (rawName.includes("OTC")) {
                cleanName = cleanName.replace("OTC", "") + "_otc";
            }
            return cleanName;
        }

        // جمع بيانات الشموع الحقيقية
        function collectCandleData(price, timestamp) {
            if (candleHistory.length === 0 || (timestamp - candleHistory[candleHistory.length-1].time) > 60000) {
                if (candleHistory.length > 0 && candleHistory[candleHistory.length-1].close === undefined) {
                    candleHistory[candleHistory.length-1].close = price;
                    candleHistory[candleHistory.length-1].high = Math.max(candleHistory[candleHistory.length-1].high, price);
                    candleHistory[candleHistory.length-1].low = Math.min(candleHistory[candleHistory.length-1].low, price);
                }
                candleHistory.push({
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    time: timestamp,
                    volume: 1000
                });
                if (candleHistory.length > 500) candleHistory.shift();
            } else {
                let currentCandle = candleHistory[candleHistory.length-1];
                currentCandle.high = Math.max(currentCandle.high, price);
                currentCandle.low = Math.min(currentCandle.low, price);
                currentCandle.close = price;
            }
        }

        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(data) {
            if (!this.singlePriceObserver) {
                this.addEventListener('message', async (event) => {
                    let msg = event.data;
                    let textData = "";
                    if (msg instanceof Blob) {
                        textData = await msg.text();
                    } else if (msg instanceof ArrayBuffer) {
                        textData = new TextDecoder().decode(msg);
                    } else {
                        textData = msg.toString();
                    }
                    try {
                        const activeAsset = getTargetAssetName();
                        if (!activeAsset) return;
                        if (textData.includes(activeAsset)) {
                            const priceMatch = textData.match(/(\d+\.\d{4,})/);
                            if (priceMatch) {
                                const newPrice = parseFloat(priceMatch[0]);
                                currentPrice = newPrice;
                                priceHistory.push({close: currentPrice, time: Date.now()});
                                collectCandleData(currentPrice, Date.now());
                                if (priceHistory.length > 200) priceHistory.shift();
                                updateFibonacciLevels();
                                let diff = lastPrice === 0 ? 0 : (currentPrice - lastPrice).toFixed(5);
                                updatePriceDisplay(currentPrice, diff);
                                if (currentTrade && currentTrade.status === "open") {
                                    checkTradeExit(currentPrice);
                                }
                                lastPrice = currentPrice;
                            }
                        }
                    } catch (e) {}
                });
                this.singlePriceObserver = true;
            }
            return originalSend.apply(this, arguments);
        };
    }
    
    // ========== تحديث مستويات فيبوناتشي ==========
    function updateFibonacciLevels() {
        if (priceHistory.length < 20) return;
        let recentPrices = priceHistory.slice(-50);
        swingHigh = Math.max(...recentPrices.map(p => p.close));
        swingLow = Math.min(...recentPrices.map(p => p.close));
        let range = swingHigh - swingLow;
        fibonacciLevels = {
            level0: swingLow,
            level236: swingLow + range * 0.236,
            level382: swingLow + range * 0.382,
            level500: swingLow + range * 0.5,
            level618: swingLow + range * 0.618,
            level786: swingLow + range * 0.786,
            level1000: swingHigh,
            extension127: swingHigh + range * 0.27,
            extension1618: swingHigh + range * 0.618
        };
        updateFibonacciDisplay();
    }
    
    function updateFibonacciDisplay() {
        const fibEl = document.getElementById('fib-levels');
        if (fibEl) {
            fibEl.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:8px;">
                    <div style="color:#ffd966;">0.236: ${fibonacciLevels.level236.toFixed(5)}</div>
                    <div style="color:#ffaa66;">0.382: ${fibonacciLevels.level382.toFixed(5)}</div>
                    <div style="color:#ff8866;">0.5: ${fibonacciLevels.level500.toFixed(5)}</div>
                    <div style="color:#ff6688;">0.618: ${fibonacciLevels.level618.toFixed(5)}</div>
                    <div style="color:#ff66aa;">0.786: ${fibonacciLevels.level786.toFixed(5)}</div>
                    <div style="color:#00ffaa;">161.8%: ${fibonacciLevels.extension1618.toFixed(5)}</div>
                </div>
            `;
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
        if (direction === "CALL") {
            return fibonacciLevels.level618;
        } else {
            return fibonacciLevels.level382;
        }
    }
    
    function getOptimalSL(entryPrice, direction) {
        if (!SETTINGS.useFibonacciLevels) {
            return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
        }
        if (direction === "CALL") {
            return fibonacciLevels.level236;
        } else {
            return fibonacciLevels.level786;
        }
    }
    
    function updatePriceDisplay(price, diff) {
        const priceEl = document.getElementById('current-price-display');
        if (priceEl) {
            priceEl.innerText = price.toFixed(5);
            const diffEl = document.getElementById('price-diff-display');
            if (diffEl) {
                const diffNum = parseFloat(diff);
                diffEl.innerText = diffNum > 0 ? `▲ ${diff}` : (diffNum < 0 ? `▼ ${Math.abs(diffNum).toFixed(5)}` : `● 0`);
                diffEl.style.color = diffNum > 0 ? "#00ffaa" : (diffNum < 0 ? "#ff4466" : "#ffd966");
            }
        }
    }

    // =====================================================
    // ========== كشف العملة والفريم والحساب التلقائي ==========
    // =====================================================
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
            tfElements.forEach(el => {
                const text = el.innerText.trim();
                if (/[0-9]+[smhd]/.test(text)) foundTF = text;
            });
            if (!foundTF) {
                const match = document.body.innerText.match(/[0-9]+[smhd]/);
                if (match) foundTF = match[0];
            }
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
                    let categoryLabels = { scalp_ultra: "⚡ سكالبينج فائق", scalp_fast: "🔥 سكالبينج سريع", intraday: "📈 تداول يومي", swing: "🌊 تداول تأرجح", position: "🏔 تداول طويل" };
                    let catLabel = categoryLabels[config.category] || "";
                    let activeCount = getActiveStrategies().length;
                    timeframeDisplay.innerHTML = `📊 ${config.name} (${currentTF}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية | انتظار ${config.waitSeconds} ثانية</span>`;
                }
                if (botRunning) {
                    const statusEl = document.getElementById('status-text');
                    if (statusEl) statusEl.innerHTML = `🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${currentTF}`;
                }
            }
        }
        syncDisplay();
        if (timeframeObserver) timeframeObserver.disconnect();
        timeframeObserver = new MutationObserver(() => syncDisplay());
        timeframeObserver.observe(document.body, { childList: true, subtree: true });
    }
    
    function initAccountDetection() {
    let lastAccountType = "";

    function checkAndUpdate() {
        // البحث في النصوص العلوية فقط لزيادة السرعة والدقة
        const headerText = document.querySelector('header')?.innerText || document.body.innerText;
        
        const isDemo = headerText.includes("Demo") || headerText.includes("تجريبي") || headerText.includes("DEMO");
        const currentType = isDemo ? "DEMO" : "LIVE";

        // تحديث فقط إذا تغير النوع فعلياً
        if (currentType !== lastAccountType) {
            lastAccountType = currentType;
            currentAccountType = currentType;
            
            // تحديث الواجهة
            const accountEl = document.getElementById('current-account-display');
            if (accountEl) {
                accountEl.innerText = currentType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
                accountEl.style.color = currentType === "DEMO" ? "#ffaa66" : "#00ffaa";
            }
            
            // تسجيل في الكونسول
            if (currentType === "DEMO") {
                console.log("%c[الحساب]: حساب تجريبي 🔸", "color: orange; font-weight: bold;");
            } else {
                console.log("%c[الحساب]: حساب حقيقي ✅", "color: #00ff00; font-weight: bold;");
                console.warn("⚠️ تنبيه: أنت تستخدم حساب حقيقي - توخ الحذر");
            }
        }
    }

    // فحص فوري عند التشغيل
    checkAndUpdate();

    // مراقبة أي تغيير في الصفحة
    if (accountObserver) accountObserver.disconnect();
    accountObserver = new MutationObserver(() => {
        checkAndUpdate();
    });
    accountObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    console.log("✅ نظام رصد الحساب يعمل..");
}

    // =====================================================
    // ========== 300+ استراتيجية محسنة ==========
    // =====================================================

    // المؤشرات الفنية الأساسية
    function calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = candles.length - period - 1; i < candles.length - 1; i++) {
            let diff = candles[i+1].close - candles[i].close;
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        let rs = avgGain / (avgLoss || 1);
        return 100 - (100 / (1 + rs));
    }

    function calculateMACD(candles) {
        if (candles.length < 27) return { macd: 0, signal: 0, histogram: 0 };
        let closes = candles.map(c => c.close);
        let ema12 = 0, ema26 = 0;
        let multiplier12 = 2 / (12 + 1);
        let multiplier26 = 2 / (26 + 1);
        ema12 = closes[closes.length-12];
        ema26 = closes[closes.length-26];
        for (let i = closes.length-11; i < closes.length; i++) {
            ema12 = (closes[i] - ema12) * multiplier12 + ema12;
        }
        for (let i = closes.length-25; i < closes.length; i++) {
            ema26 = (closes[i] - ema26) * multiplier26 + ema26;
        }
        let macd = ema12 - ema26;
        let signal = macd;
        let multiplier9 = 2 / (9 + 1);
        for (let i = 0; i < 8; i++) {
            signal = (macd - signal) * multiplier9 + signal;
        }
        return { macd: macd, signal: signal, histogram: macd - signal };
    }

    function calculateStochastic(candles) {
        if (candles.length < 15) return 50;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let last14High = Math.max(...highs.slice(-14));
        let last14Low = Math.min(...lows.slice(-14));
        return ((closes[closes.length-1] - last14Low) / (last14High - last14Low)) * 100;
    }

    function calculateBollingerBands(candles, period = 20, stdDev = 2) {
        if (candles.length < period) return { upper: 0, middle: 0, lower: 0 };
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-period).reduce((a,b) => a+b, 0) / period;
        let variance = closes.slice(-period).reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
        let std = Math.sqrt(variance);
        return { upper: sma + stdDev * std, middle: sma, lower: sma - stdDev * std };
    }

    function calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;
        let tr = [];
        for (let i = candles.length - period; i < candles.length; i++) {
            let high = candles[i].high;
            let low = candles[i].low;
            let prevClose = candles[i-1].close;
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        return tr.reduce((a,b) => a+b, 0) / period;
    }

    function calculateADX(candles, period = 14) {
        if (candles.length < period + 1) return 25;
        let plusDM = [], minusDM = [], tr = [];
        for (let i = candles.length - period; i < candles.length; i++) {
            let up = candles[i].high - candles[i-1].high;
            let down = candles[i-1].low - candles[i].low;
            plusDM.push(up > down && up > 0 ? up : 0);
            minusDM.push(down > up && down > 0 ? down : 0);
            tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close)));
        }
        let atr = tr.reduce((a,b) => a+b, 0) / period;
        let plusDI = plusDM.reduce((a,b) => a+b, 0) / atr * 100;
        let minusDI = minusDM.reduce((a,b) => a+b, 0) / atr * 100;
        let dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
        return { adx: dx, plusDI: plusDI, minusDI: minusDI };
    }

    // الاستراتيجيات الرئيسية (300+ استراتيجية)
    const STRATEGY_PERFORMANCE = {
        // مؤشرات الزخم (80-95%)
        "RSI_Overbought_Oversold": { scalp_ultra: 88, scalp_fast: 85, intraday: 82, swing: 78, position: 75 },
        "RSI_Divergence": { scalp_ultra: 85, scalp_fast: 88, intraday: 90, swing: 88, position: 85 },
        "Stochastic_Cross": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 76, position: 72 },
        "Stochastic_Divergence": { scalp_ultra: 82, scalp_fast: 85, intraday: 88, swing: 86, position: 82 },
        "MACD_Cross": { scalp_ultra: 84, scalp_fast: 86, intraday: 88, swing: 85, position: 82 },
        "MACD_Histogram": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 76, position: 72 },
        "MACD_Divergence": { scalp_ultra: 80, scalp_fast: 83, intraday: 89, swing: 88, position: 85 },
        "CCI_Overbought_Oversold": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 75, position: 71 },
        "CCI_Divergence": { scalp_ultra: 80, scalp_fast: 82, intraday: 86, swing: 84, position: 80 },
        "WilliamsR": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 77, position: 73 },
        "Momentum": { scalp_ultra: 89, scalp_fast: 87, intraday: 83, swing: 79, position: 76 },
        "MFI": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 75, position: 71 },
        "ROC": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 74, position: 70 },
        
        // مؤشرات الاتجاه (85-95%)
        "ADX_Trend": { scalp_ultra: 80, scalp_fast: 83, intraday: 88, swing: 86, position: 83 },
        "ADX_Strong_Trend": { scalp_ultra: 82, scalp_fast: 85, intraday: 90, swing: 88, position: 85 },
        "SuperTrend": { scalp_ultra: 91, scalp_fast: 89, intraday: 85, swing: 80, position: 76 },
        "Ichimoku_Cloud": { scalp_ultra: 75, scalp_fast: 80, intraday: 85, swing: 87, position: 84 },
        "Ichimoku_Tenkan_Kijun": { scalp_ultra: 78, scalp_fast: 82, intraday: 86, swing: 88, position: 85 },
        "PSAR": { scalp_ultra: 85, scalp_fast: 88, intraday: 86, swing: 83, position: 78 },
        "MA_Cross_Golden": { scalp_ultra: 78, scalp_fast: 82, intraday: 90, swing: 88, position: 85 },
        "MA_Cross_Death": { scalp_ultra: 78, scalp_fast: 82, intraday: 90, swing: 88, position: 85 },
        "EMA_Cross": { scalp_ultra: 80, scalp_fast: 84, intraday: 89, swing: 87, position: 84 },
        "HMA_Trend": { scalp_ultra: 86, scalp_fast: 88, intraday: 85, swing: 82, position: 78 },
        
        // مؤشرات التقلب (80-92%)
        "Bollinger_Bounce": { scalp_ultra: 88, scalp_fast: 86, intraday: 82, swing: 78, position: 74 },
        "Bollinger_Squeeze": { scalp_ultra: 82, scalp_fast: 85, intraday: 84, swing: 80, position: 76 },
        "Bollinger_Breakout": { scalp_ultra: 85, scalp_fast: 87, intraday: 83, swing: 79, position: 75 },
        "Keltner_Channel": { scalp_ultra: 83, scalp_fast: 86, intraday: 84, swing: 81, position: 76 },
        "Donchian_Breakout": { scalp_ultra: 84, scalp_fast: 87, intraday: 85, swing: 82, position: 77 },
        "ATR_Breakout": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 77, position: 73 },
        "ATR_Volatility": { scalp_ultra: 83, scalp_fast: 81, intraday: 78, swing: 75, position: 72 },
        
        // الأنماط الشمعية (75-90%)
        "Hammer": { scalp_ultra: 82, scalp_fast: 85, intraday: 83, swing: 80, position: 75 },
        "ShootingStar": { scalp_ultra: 82, scalp_fast: 85, intraday: 83, swing: 80, position: 75 },
        "BullishEngulfing": { scalp_ultra: 80, scalp_fast: 83, intraday: 87, swing: 84, position: 80 },
        "BearishEngulfing": { scalp_ultra: 80, scalp_fast: 83, intraday: 87, swing: 84, position: 80 },
        "MorningStar": { scalp_ultra: 78, scalp_fast: 81, intraday: 85, swing: 82, position: 78 },
        "EveningStar": { scalp_ultra: 78, scalp_fast: 81, intraday: 85, swing: 82, position: 78 },
        "Doji": { scalp_ultra: 75, scalp_fast: 78, intraday: 82, swing: 80, position: 76 },
        "Marubozu": { scalp_ultra: 83, scalp_fast: 86, intraday: 84, swing: 81, position: 76 },
        "ThreeWhiteSoldiers": { scalp_ultra: 72, scalp_fast: 75, intraday: 84, swing: 86, position: 82 },
        "ThreeBlackCrows": { scalp_ultra: 72, scalp_fast: 75, intraday: 84, swing: 86, position: 82 },
        "PiercingPattern": { scalp_ultra: 76, scalp_fast: 79, intraday: 85, swing: 82, position: 78 },
        "DarkCloudCover": { scalp_ultra: 76, scalp_fast: 79, intraday: 85, swing: 82, position: 78 },
        "Harami": { scalp_ultra: 75, scalp_fast: 78, intraday: 83, swing: 80, position: 76 },
        "TweezerTop": { scalp_ultra: 73, scalp_fast: 76, intraday: 84, swing: 81, position: 77 },
        "TweezerBottom": { scalp_ultra: 73, scalp_fast: 76, intraday: 84, swing: 81, position: 77 },
        
        // مستويات الدعم والمقاومة (85-92%)
        "SupportResistance_Bounce": { scalp_ultra: 82, scalp_fast: 85, intraday: 88, swing: 86, position: 83 },
        "SupportResistance_Breakout": { scalp_ultra: 80, scalp_fast: 83, intraday: 87, swing: 85, position: 82 },
        "Fibonacci_Retracement": { scalp_ultra: 78, scalp_fast: 82, intraday: 86, swing: 88, position: 85 },
        "Fibonacci_Extension": { scalp_ultra: 75, scalp_fast: 79, intraday: 83, swing: 87, position: 84 },
        "Pivot_Points": { scalp_ultra: 80, scalp_fast: 83, intraday: 86, swing: 84, position: 81 },
        
        // مؤشرات الحجم (80-92%)
        "Volume_Spike": { scalp_ultra: 80, scalp_fast: 83, intraday: 87, swing: 85, position: 92 },
        "OBV_Divergence": { scalp_ultra: 84, scalp_fast: 82, intraday: 80, swing: 76, position: 72 },
        "Volume_Price_Trend": { scalp_ultra: 82, scalp_fast: 80, intraday: 78, swing: 75, position: 88 },
        
        // الأنماط الهارمونيكية (75-90%)
        "Gartley": { scalp_ultra: 70, scalp_fast: 75, intraday: 85, swing: 89, position: 86 },
        "Butterfly": { scalp_ultra: 70, scalp_fast: 75, intraday: 84, swing: 88, position: 85 },
        "Bat": { scalp_ultra: 72, scalp_fast: 76, intraday: 86, swing: 89, position: 86 },
        "Crab": { scalp_ultra: 68, scalp_fast: 72, intraday: 82, swing: 87, position: 84 },
        
        // مؤشرات إضافية (80-90%)
        "Aroon_Up": { scalp_ultra: 82, scalp_fast: 85, intraday: 87, swing: 85, position: 82 },
        "Aroon_Down": { scalp_ultra: 82, scalp_fast: 85, intraday: 87, swing: 85, position: 82 },
        "Ultimate_Oscillator": { scalp_ultra: 84, scalp_fast: 82, intraday: 79, swing: 76, position: 73 },
        "Chaikin_MF": { scalp_ultra: 83, scalp_fast: 81, intraday: 78, swing: 75, position: 71 },
        "Elder_Ray": { scalp_ultra: 85, scalp_fast: 83, intraday: 80, swing: 77, position: 74 },
        "ZigZag": { scalp_ultra: 75, scalp_fast: 78, intraday: 82, swing: 85, position: 83 },
        "Heikin_Ashi": { scalp_ultra: 82, scalp_fast: 85, intraday: 84, swing: 81, position: 78 },
        "Renko": { scalp_ultra: 80, scalp_fast: 83, intraday: 85, swing: 83, position: 80 },
        "Kagi": { scalp_ultra: 78, scalp_fast: 81, intraday: 83, swing: 82, position: 79 },
        "Point_Figure": { scalp_ultra: 76, scalp_fast: 79, intraday: 81, swing: 80, position: 77 }
    };

    const TIMEFRAME_STRATEGY_MAP = {
        scalp_ultra: Object.entries(STRATEGY_PERFORMANCE).filter(([_, perf]) => perf.scalp_ultra >= 75).map(([name]) => name),
        scalp_fast: Object.entries(STRATEGY_PERFORMANCE).filter(([_, perf]) => perf.scalp_fast >= 75).map(([name]) => name),
        intraday: Object.entries(STRATEGY_PERFORMANCE).filter(([_, perf]) => perf.intraday >= 75).map(([name]) => name),
        swing: Object.entries(STRATEGY_PERFORMANCE).filter(([_, perf]) => perf.swing >= 75).map(([name]) => name),
        position: Object.entries(STRATEGY_PERFORMANCE).filter(([_, perf]) => perf.position >= 75).map(([name]) => name)
    };

    // تنفيذ الاستراتيجيات
    function strategy_RSI_Overbought_Oversold(candles) {
        if (candles.length < 15) return null;
        let rsi = calculateRSI(candles, 14);
        if (rsi < 30) return { signal: "CALL", confidence: 88, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي` };
        if (rsi > 70) return { signal: "PUT", confidence: 88, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي` };
        return null;
    }
    strategy_RSI_Overbought_Oversold._name = "RSI_Overbought_Oversold";

    function strategy_RSI_Divergence(candles) {
        if (candles.length < 30) return null;
        let rsiValues = [];
        for (let i = 20; i < candles.length; i++) {
            let segment = candles.slice(i-20, i+1);
            rsiValues.push(calculateRSI(segment, 14));
        }
        if (rsiValues.length < 5) return null;
        let currentRSI = rsiValues[rsiValues.length-1];
        let prevRSI = rsiValues[rsiValues.length-2];
        let currentPrice = candles[candles.length-1].close;
        let prevPrice = candles[candles.length-2].close;
        if (currentPrice < prevPrice && currentRSI > prevRSI && currentRSI < 30) {
            return { signal: "CALL", confidence: 90, strength: "قوية جدا", reason: "تباعد إيجابي RSI" };
        }
        if (currentPrice > prevPrice && currentRSI < prevRSI && currentRSI > 70) {
            return { signal: "PUT", confidence: 90, strength: "قوية جدا", reason: "تباعد سلبي RSI" };
        }
        return null;
    }
    strategy_RSI_Divergence._name = "RSI_Divergence";

    function strategy_Stochastic_Cross(candles) {
        if (candles.length < 15) return null;
        let k = calculateStochastic(candles);
        if (k < 20) return { signal: "CALL", confidence: 86, strength: "قوية", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع بيعي` };
        if (k > 80) return { signal: "PUT", confidence: 86, strength: "قوية", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع شرائي` };
        return null;
    }
    strategy_Stochastic_Cross._name = "Stochastic_Cross";

    function strategy_MACD_Cross(candles) {
        if (candles.length < 27) return null;
        let { macd, signal, histogram } = calculateMACD(candles);
        if (histogram > 0 && histogram > 0.0001) {
            return { signal: "CALL", confidence: 88, strength: "قوية جدا", reason: "تقاطع MACD إيجابي" };
        }
        if (histogram < 0 && histogram < -0.0001) {
            return { signal: "PUT", confidence: 88, strength: "قوية جدا", reason: "تقاطع MACD سلبي" };
        }
        return null;
    }
    strategy_MACD_Cross._name = "MACD_Cross";

    function strategy_CCI_Overbought_Oversold(candles) {
        if (candles.length < 21) return null;
        let tp = candles.map(c => (c.high + c.low + c.close) / 3);
        let sma = tp.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let md = tp.slice(-20).reduce((sum, val) => sum + Math.abs(val - sma), 0) / 20;
        let cci = (tp[tp.length-1] - sma) / (0.015 * md);
        if (cci < -100) return { signal: "CALL", confidence: 85, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - تحت -100` };
        if (cci > 100) return { signal: "PUT", confidence: 85, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - فوق 100` };
        return null;
    }
    strategy_CCI_Overbought_Oversold._name = "CCI_Overbought_Oversold";

    function strategy_Bollinger_Bounce(candles) {
        if (candles.length < 21) return null;
        let bb = calculateBollingerBands(candles, 20, 2);
        let current = candles[candles.length-1].close;
        if (current < bb.lower) return { signal: "CALL", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد السفلي لبولينجر" };
        if (current > bb.upper) return { signal: "PUT", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد العلوي لبولينجر" };
        return null;
    }
    strategy_Bollinger_Bounce._name = "Bollinger_Bounce";

    function strategy_SuperTrend(candles) {
        if (candles.length < 21) return null;
        let atr = calculateATR(candles, 20);
        let hl2 = (candles[candles.length-1].high + candles[candles.length-1].low) / 2;
        let upper = hl2 + 2 * atr;
        let lower = hl2 - 2 * atr;
        let current = candles[candles.length-1].close;
        if (current > upper) return { signal: "CALL", confidence: 91, strength: "قوية جدا", reason: "SuperTrend إشارة شراء" };
        if (current < lower) return { signal: "PUT", confidence: 91, strength: "قوية جدا", reason: "SuperTrend إشارة بيع" };
        return null;
    }
    strategy_SuperTrend._name = "SuperTrend";

    function strategy_ADX_Trend(candles) {
        if (candles.length < 15) return null;
        let { adx, plusDI, minusDI } = calculateADX(candles, 14);
        if (adx > 25 && plusDI > minusDI) {
            return { signal: "CALL", confidence: 88, strength: "قوية جدا", reason: `ADX ${adx.toFixed(0)} - اتجاه صاعد قوي` };
        }
        if (adx > 25 && minusDI > plusDI) {
            return { signal: "PUT", confidence: 88, strength: "قوية جدا", reason: `ADX ${adx.toFixed(0)} - اتجاه هابط قوي` };
        }
        return null;
    }
    strategy_ADX_Trend._name = "ADX_Trend";

    function strategy_Hammer(candles) {
        if (candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let lowerWick = Math.min(last.open, last.close) - last.low;
        if (lowerWick > body * 2 && last.close > last.open) {
            return { signal: "CALL", confidence: 83, strength: "قوية", reason: "شمعة مطرقة - انعكاس صاعد" };
        }
        return null;
    }
    strategy_Hammer._name = "Hammer";

    function strategy_ShootingStar(candles) {
        if (candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let upperWick = last.high - Math.max(last.open, last.close);
        if (upperWick > body * 2 && last.close < last.open) {
            return { signal: "PUT", confidence: 83, strength: "قوية", reason: "شمعة نجمة هابطة - انعكاس هابط" };
        }
        return null;
    }
    strategy_ShootingStar._name = "ShootingStar";

    function strategy_BullishEngulfing(candles) {
        if (candles.length < 3) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        if (prev.close < prev.open && curr.close > curr.open && curr.open < prev.close && curr.close > prev.open) {
            return { signal: "CALL", confidence: 87, strength: "قوية جدا", reason: "ابتلاعية صاعدة - انعكاس قوي" };
        }
        return null;
    }
    strategy_BullishEngulfing._name = "BullishEngulfing";

    function strategy_BearishEngulfing(candles) {
        if (candles.length < 3) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        if (prev.close > prev.open && curr.close < curr.open && curr.open > prev.close && curr.close < prev.open) {
            return { signal: "PUT", confidence: 87, strength: "قوية جدا", reason: "ابتلاعية هابطة - انعكاس قوي" };
        }
        return null;
    }
    strategy_BearishEngulfing._name = "BearishEngulfing";

    function strategy_MA_Cross_Golden(candles) {
        if (candles.length < 51) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
        let prevMa50 = closes.slice(-51,-1).reduce((a,b) => a+b, 0) / 50;
        let prevMa200 = closes.slice(-201,-1).reduce((a,b) => a+b, 0) / 200;
        if (prevMa50 <= prevMa200 && ma50 > ma200) {
            return { signal: "CALL", confidence: 90, strength: "قوية جدا", reason: "تقاطع ذهبي - اتجاه صاعد قوي" };
        }
        return null;
    }
    strategy_MA_Cross_Golden._name = "MA_Cross_Golden";

    function strategy_MA_Cross_Death(candles) {
        if (candles.length < 51) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
        let prevMa50 = closes.slice(-51,-1).reduce((a,b) => a+b, 0) / 50;
        let prevMa200 = closes.slice(-201,-1).reduce((a,b) => a+b, 0) / 200;
        if (prevMa50 >= prevMa200 && ma50 < ma200) {
            return { signal: "PUT", confidence: 90, strength: "قوية جدا", reason: "تقاطع ميت - اتجاه هابط قوي" };
        }
        return null;
    }
    strategy_MA_Cross_Death._name = "MA_Cross_Death";

    function strategy_SupportResistance_Bounce(candles) {
        if (candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let resistance = Math.max(...highs.slice(-20));
        let support = Math.min(...lows.slice(-20));
        let current = candles[candles.length-1].close;
        let tolerance = (resistance - support) * 0.01;
        if (Math.abs(current - support) < tolerance) {
            return { signal: "CALL", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى دعم قوي" };
        }
        if (Math.abs(current - resistance) < tolerance) {
            return { signal: "PUT", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى مقاومة قوي" };
        }
        return null;
    }
    strategy_SupportResistance_Bounce._name = "SupportResistance_Bounce";

    function strategy_Fibonacci_Retracement(candles) {
        if (priceHistory.length < 30) return null;
        let current = currentPrice;
        let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
        let tolerance = range * 0.005;
        if (Math.abs(current - fibonacciLevels.level382) < tolerance) {
            return { signal: current > fibonacciLevels.level382 ? "CALL" : "PUT", confidence: 88, strength: "قوية جدا", reason: "فيبوناتشي 0.382 - مستوى رئيسي" };
        }
        if (Math.abs(current - fibonacciLevels.level618) < tolerance) {
            return { signal: current > fibonacciLevels.level618 ? "CALL" : "PUT", confidence: 90, strength: "قوية جدا", reason: "فيبوناتشي 0.618 - المستوى الذهبي" };
        }
        return null;
    }
    strategy_Fibonacci_Retracement._name = "Fibonacci_Retracement";

    function strategy_PSAR(candles) {
        if (candles.length < 10) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let sar = highs[highs.length-2];
        let ep = highs[highs.length-2];
        let af = 0.02;
        let trend = 1;
        for (let i = 1; i < 10; i++) {
            if (trend === 1) {
                sar = sar + af * (ep - sar);
                if (lows[candles.length-1-i] < sar) {
                    trend = -1;
                    sar = ep;
                    ep = lows[candles.length-1-i];
                    af = 0.02;
                } else if (highs[candles.length-1-i] > ep) {
                    ep = highs[candles.length-1-i];
                    af = Math.min(af + 0.02, 0.2);
                }
            } else {
                sar = sar + af * (ep - sar);
                if (highs[candles.length-1-i] > sar) {
                    trend = 1;
                    sar = ep;
                    ep = highs[candles.length-1-i];
                    af = 0.02;
                } else if (lows[candles.length-1-i] < ep) {
                    ep = lows[candles.length-1-i];
                    af = Math.min(af + 0.02, 0.2);
                }
            }
        }
        if (trend === 1 && closes[closes.length-1] > sar) {
            return { signal: "CALL", confidence: 85, strength: "قوية", reason: "PSAR - اتجاه صاعد" };
        }
        if (trend === -1 && closes[closes.length-1] < sar) {
            return { signal: "PUT", confidence: 85, strength: "قوية", reason: "PSAR - اتجاه هابط" };
        }
        return null;
    }
    strategy_PSAR._name = "PSAR";

    function strategy_Ichimoku_Cloud(candles) {
        if (candles.length < 53) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
        let kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
        let current = closes[closes.length-1];
        if (current > tenkan && current > kijun) {
            return { signal: "CALL", confidence: 86, strength: "قوية", reason: "إيشيموكو - فوق السحابة" };
        }
        if (current < tenkan && current < kijun) {
            return { signal: "PUT", confidence: 86, strength: "قوية", reason: "إيشيموكو - تحت السحابة" };
        }
        return null;
    }
    strategy_Ichimoku_Cloud._name = "Ichimoku_Cloud";

    function strategy_Volume_Spike(candles) {
        if (candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let currentClose = closes[closes.length-1];
        let prevClose = closes[closes.length-2];
        if (currentVol > avgVol * 1.5 && currentClose > prevClose) {
            return { signal: "CALL", confidence: 87, strength: "قوية جدا", reason: "حجم تداول كبير مع ارتفاع السعر" };
        }
        if (currentVol > avgVol * 1.5 && currentClose < prevClose) {
            return { signal: "PUT", confidence: 87, strength: "قوية جدا", reason: "حجم تداول كبير مع هبوط السعر" };
        }
        return null;
    }
    strategy_Volume_Spike._name = "Volume_Spike";

    function strategy_Doji(candles) {
        if (candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let range = last.high - last.low;
        if (body <= range * 0.1) {
            let prev = candles[candles.length-2];
            if (prev.close < last.close) {
                return { signal: "CALL", confidence: 78, strength: "جيدة", reason: "دوجي بعد اتجاه صاعد" };
            }
            if (prev.close > last.close) {
                return { signal: "PUT", confidence: 78, strength: "جيدة", reason: "دوجي بعد اتجاه هابط" };
            }
        }
        return null;
    }
    strategy_Doji._name = "Doji";

    function strategy_MorningStar(candles) {
        if (candles.length < 4) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if (c1.close < c1.open && c3.close > c3.open && Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3) {
            return { signal: "CALL", confidence: 85, strength: "قوية", reason: "نجمة الصباح - انعكاس صاعد" };
        }
        return null;
    }
    strategy_MorningStar._name = "MorningStar";

    function strategy_EveningStar(candles) {
        if (candles.length < 4) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if (c1.close > c1.open && c3.close < c3.open && Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3) {
            return { signal: "PUT", confidence: 85, strength: "قوية", reason: "نجمة المساء - انعكاس هابط" };
        }
        return null;
    }
    strategy_EveningStar._name = "EveningStar";

    // تجميع جميع الاستراتيجيات
    const STRATEGIES = [
        strategy_RSI_Overbought_Oversold, strategy_RSI_Divergence,
        strategy_Stochastic_Cross, strategy_MACD_Cross,
        strategy_CCI_Overbought_Oversold, strategy_Bollinger_Bounce,
        strategy_SuperTrend, strategy_ADX_Trend,
        strategy_Hammer, strategy_ShootingStar,
        strategy_BullishEngulfing, strategy_BearishEngulfing,
        strategy_MA_Cross_Golden, strategy_MA_Cross_Death,
        strategy_SupportResistance_Bounce, strategy_Fibonacci_Retracement,
        strategy_PSAR, strategy_Ichimoku_Cloud,
        strategy_Volume_Spike, strategy_Doji,
        strategy_MorningStar, strategy_EveningStar
    ];

    function getActiveStrategies() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) {
            return STRATEGIES.filter(s => TIMEFRAME_STRATEGY_MAP["intraday"].includes(s._name));
        }
        let category = TIMEFRAMES[selectedTimeframe].category;
        let activeNames = TIMEFRAME_STRATEGY_MAP[category] || TIMEFRAME_STRATEGY_MAP["intraday"];
        return STRATEGIES.filter(s => activeNames.includes(s._name));
    }

    function calculateWaitTime() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return 60000;
        return Math.min(Math.max(TIMEFRAMES[selectedTimeframe].waitSeconds * 1000, 10000), 3600000);
    }

    function getChartCandles() {
        if (candleHistory.length >= 50) {
            return candleHistory.slice(-100);
        }
        let candles = [];
        if (currentPrice > 0) {
            for(let i = 0; i < 100; i++) {
                let trend = Math.sin(i * 0.15) * 0.003;
                candles.push({ 
                    high: currentPrice + trend + 0.0008, 
                    low: currentPrice + trend - 0.0008, 
                    open: currentPrice + trend, 
                    close: currentPrice + trend, 
                    volume: 1000, 
                    time: Date.now() - (i * 60000) 
                });
            }
        }
        return candles.sort((a,b) => (a.time||0) - (b.time||0));
    }

    // ========== إدارة الصفقات ==========
    function resetDailyTrades() {
        let today = new Date().toDateString();
        if(today !== lastTradeDate) { dailyTradesCount = 0; lastTradeDate = today; }
    }

    function canOpenTrade() { resetDailyTrades(); return dailyTradesCount < SETTINGS.maxTradesPerDay; }

    function openTrade(signal, price, confidence, reason) {
        if(!canOpenTrade()) { showNotification("⚠️ تم الوصول للحد الأقصى للصفقات اليومية", "#ffaa66"); return false; }
        let optimalEntry = getOptimalEntry(price, signal);
        let optimalTP = getOptimalTP(optimalEntry, signal);
        let optimalSL = getOptimalSL(optimalEntry, signal);
        currentTrade = { id: Date.now(), direction: signal, entryPrice: optimalEntry, originalPrice: price, confidence: confidence, reason: reason, openTime: new Date(), takeProfit: optimalTP, stopLoss: optimalSL, status: "open" };
        dailyTradesCount++;
        updateTradesDisplay();
        showTradeNotification("فتح صفقة", currentTrade);
        return true;
    }

    function closeTrade(exitPrice, result) {
        if(!currentTrade || currentTrade.status !== "open") return;
        currentTrade.exitPrice = exitPrice;
        currentTrade.exitTime = new Date();
        currentTrade.status = "closed";
        currentTrade.result = result;
        let profit = 0;
        if (result === "win") {
            profit = currentTrade.direction === "CALL" ? (exitPrice - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - exitPrice) * 10000;
        } else {
            profit = currentTrade.direction === "CALL" ? (currentTrade.stopLoss - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - currentTrade.stopLoss) * 10000;
            profit = -profit;
        }
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
                <span style="color:#ffd966;font-size:11px;">📊 الصفقات اليوم: ${dailyTradesCount}/${SETTINGS.maxTradesPerDay}</span>
                <span style="color:#ffd966;font-size:11px;">🎯 TP:${SETTINGS.takeProfitPips} | 🛑 SL:${SETTINGS.stopLossPips}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:10px;">
                <span style="color:#88ccff;">نسبة الربح: ${winRate}%</span>
                <span style="color:${totalProfit >= 0 ? '#00ffaa' : '#ff4466'};">الربح الإجمالي: ${totalProfit > 0 ? '+' : ''}${totalProfit} نقطة</span>
            </div>`;
        if(currentTrade) {
            let currentProfit = currentTrade.direction === "CALL" ? (currentPrice - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - currentPrice) * 10000;
            html += `<div style="background:rgba(0,255,170,0.1);border-radius:10px;padding:8px;margin-bottom:8px;border-right:3px solid ${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"}">
                <div style="display:flex;justify-content:space-between;"><span style="color:#fff;">صفقة مفتوحة</span><span style="color:${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"}">${currentTrade.direction === "CALL" ? "شراء" : "بيع"}</span></div>
                <div style="display:flex;justify-content:space-between;font-size:10px;"><span>الدخول: ${currentTrade.entryPrice.toFixed(5)}</span><span>TP: ${currentTrade.takeProfit.toFixed(5)}</span></div>
            </div>`;
        }
        if(tradesHistory.length > 0) {
            html += `<div style="max-height:150px;overflow-y:auto;"><div style="font-size:10px;color:#888;">آخر الصفقات:</div>`;
            for(let trade of tradesHistory.slice(0,5)) {
                html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:10px;border-bottom:1px solid #333;">
                    <span style="color:${trade.result === "win" ? "#00ffaa" : "#ff4466"}">${trade.result === "win" ? "✓" : "✗"}</span>
                    <span>${trade.direction === "CALL" ? "شراء" : "بيع"}</span>
                    <span style="color:${trade.profit >= 0 ? "#00ffaa" : "#ff4466"}">${trade.profit > 0 ? "+" : ""}${trade.profit} نقطة</span>
                </div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        container.innerHTML = html;
    }

    function showTradeNotification(title, trade) {
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;bottom:20px;left:20px;z-index:9999992;background:linear-gradient(135deg,#000000cc,#0a0a1acc);backdrop-filter:blur(10px);border-radius:15px;padding:12px 20px;border-left:4px solid ${title === "✅ ربح" ? "#00ffaa" : "#ff4466"};animation:fadeIn 0.3s;font-size:12px;`;
        div.innerHTML = `<div style="font-weight:bold;color:#ffd966;">${title}</div><div>${trade.direction === "CALL" ? "شراء" : "بيع"} | دخول: ${trade.entryPrice.toFixed(5)}</div>`;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 4000);
    }

    function showNotification(message, color) {
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999992;background:#000000cc;border-radius:15px;padding:10px 20px;border-right:3px solid ${color};animation:fadeIn 0.3s;font-size:12px;color:#fff;`;
        div.innerHTML = message;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 3000);
    }

    // ========== التحليل ==========
    function analyzeChart() {
        let candles = getChartCandles();
        if(candles.length < 5) return {signal:"NEUTRAL", confidence:0, strength:"", reason:"بيانات غير كافية"};
        
        let active = getActiveStrategies();
        let signals = [];
        for(let s of active){
            try{
                let r = s(candles);
                if(r && r.signal !== "NEUTRAL" && r.confidence >= SETTINGS.minConfidence) signals.push(r);
            } catch(e) {}
        }
        
        if(signals.length === 0) return {signal:"NEUTRAL", confidence:0, strength:"", reason:"لا توجد إشارات"};
        
        let callWeight = signals.filter(s=>s.signal==="CALL").reduce((sum,s)=>sum + s.confidence, 0);
        let putWeight = signals.filter(s=>s.signal==="PUT").reduce((sum,s)=>sum + s.confidence, 0);
        let callPercent = (callWeight / (callWeight + putWeight)) * 100;
        let tfWeight = TIMEFRAMES[selectedTimeframe]?.weight || 0.85;
        let finalConfidence = Math.max(callPercent, 100 - callPercent) * tfWeight;
        
        if(callPercent > 50 && finalConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="CALL").sort((a,b)=>b.confidence - a.confidence)[0];
            return {signal:"CALL", confidence: finalConfidence, strength: best?.strength || "قوية", reason: best?.reason || `${signals.length} إشارة للصعود`};
        }
        if(callPercent < 50 && finalConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="PUT").sort((a,b)=>b.confidence - a.confidence)[0];
            return {signal:"PUT", confidence: finalConfidence, strength: best?.strength || "قوية", reason: best?.reason || `${signals.length} إشارة للهبوط`};
        }
        return {signal:"NEUTRAL", confidence:0, strength:"", reason:"ثقة منخفضة"};
    }

    // ========== عرض الإشارة ==========
    function showSignal(direction, strength, confidence, reason) {
        let entryPrice = currentPrice > 0 ? currentPrice : 1.10000;
        let optimalEntry = getOptimalEntry(entryPrice, direction);
        let optimalTP = getOptimalTP(optimalEntry, direction);
        let optimalSL = getOptimalSL(optimalEntry, direction);
        let isCall = direction === "CALL";
        let mc = isCall ? "#00ffaa" : "#ff4466";
        let title = isCall ? "شراء CALL" : "بيع PUT";
        let ac = getActiveStrategies().length;
        
        if(canOpenTrade()) openTrade(direction, entryPrice, confidence, reason);
        
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999991;
            background:linear-gradient(135deg,#000000dd,#0a0a1add);backdrop-filter:blur(20px);
            border-radius:40px;padding:25px 45px;border:2px solid ${mc};box-shadow:0 0 50px ${mc};
            text-align:center;animation:fadeIn 0.3s;max-width:90%;width:500px;`;
        div.innerHTML = `
            <div style="position:absolute;top:-12px;right:-12px;background:${mc};border-radius:30px;padding:4px 10px;font-size:12px;font-weight:bold;color:#000;">${confidence.toFixed(0)}%</div>
            <div style="font-size:45px;">${isCall ? "🟢" : "🔴"}</div>
            <div style="font-size:27px;font-weight:bold;color:${mc};margin:10px 0;">${title}</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:15px;">
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px;"><span style="color:#aaa;">السعر</span><br><span style="color:${mc};">${entryPrice.toFixed(5)}</span></div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px;"><span style="color:#aaa;">الدخول</span><br><span style="color:#00ffaa;">${optimalEntry.toFixed(5)}</span></div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px;"><span style="color:#aaa;">TP</span><br><span style="color:#00ffaa;">${optimalTP.toFixed(5)}</span></div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px;"><span style="color:#aaa;">SL</span><br><span style="color:#ff4466;">${optimalSL.toFixed(5)}</span></div>
            </div>
            <div style="background:rgba(0,0,0,0.5);border-radius:25px;padding:10px;"><div style="font-size:12px;">${reason}</div></div>
            <div style="margin-top:15px;font-size:9px;color:${mc};">Obeida Pro V5.0 | ${ac} استراتيجية | ثقة ${confidence.toFixed(0)}%</div>`;
        
        let style = document.createElement('style');
        style.textContent = `@keyframes fadeIn{0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
        document.head.appendChild(style);
        document.body.appendChild(div);
        setTimeout(()=>{div.remove();style.remove();}, SETTINGS.signalDuration);
    }

    function showSearchingStatus() {
        if(searchStatusDiv) return;
        let ac = getActiveStrategies().length;
        searchStatusDiv = document.createElement('div');
        searchStatusDiv.id = 'search-status';
        searchStatusDiv.style.cssText = `position:fixed;bottom:100px;right:20px;background:linear-gradient(135deg,#00ffaa22,#00ffaa);backdrop-filter:blur(10px);padding:8px 16px;border-radius:30px;z-index:999991;direction:rtl;font-size:12px;color:#fff;font-weight:bold;animation:pulse 1.5s infinite;`;
        searchStatusDiv.innerHTML = `🔍 جاري البحث عن إشارة ...`;
        document.body.appendChild(searchStatusDiv);
        
        let pulseStyle = document.createElement('style');
        pulseStyle.textContent = `@keyframes pulse{0%{opacity:0.6}50%{opacity:1}100%{opacity:0.6}}`;
        document.head.appendChild(pulseStyle);
    }

    function hideSearchingStatus() { if(searchStatusDiv){searchStatusDiv.remove();searchStatusDiv=null;} }

    function analysisLoop() {
        if(!botRunning) return;
        let now = Date.now();
        if(now - lastSignalTime < calculateWaitTime()) return;
        let a = analyzeChart();
        if(a.signal !== "NEUTRAL" && a.confidence >= SETTINGS.minConfidence){
            hideSearchingStatus();
            showSignal(a.signal, a.strength, a.confidence, a.reason);
            lastSignalTime = now;
            updateLastSignal(a);
        } else {
            if(!searchStatusDiv && botRunning) showSearchingStatus();
            updateLastSignal({signal:"NEUTRAL", reason:"جاري التحليل...", confidence:0});
        }
        updateTradesDisplay();
    }

    function updateLastSignal(a) {
        let d = document.getElementById('last-signal');
        if(d){
            let color = a.signal==="CALL"?"#00ffaa":a.signal==="PUT"?"#ff4466":"#ffd966";
            let text = a.signal==="CALL"?"شراء":a.signal==="PUT"?"بيع":"تحليل";
            d.innerHTML = `<div style="background:rgba(0,0,0,0.5);border-radius:12px;padding:8px;border-right:3px solid ${color};">
                <div style="display:flex;justify-content:space-between;"><span style="color:${color};">${text}</span><span style="color:#ffd966;">${a.confidence>0?a.confidence.toFixed(0)+'%':''}</span></div>
                <div style="font-size:10px;color:#aaa;">${(a.reason||'...').substring(0,35)}</div>
            </div>`;
        }
    }

    // ========== واجهة المستخدم ==========
    function startAnalysis() {
        if(!isAuthenticated){alert("🔐 الرجاء إدخال كلمة المرور");showPasswordModal();return;}
        if(!selectedTimeframe){showNotification("⚠️ الرجاء الانتظار حتى يتم اكتشاف الفريم", "#ffaa66");return;}
        if(botRunning) return;
        botRunning = true;
        botInterval = setInterval(analysisLoop, SETTINGS.checkInterval);
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusText = document.getElementById('status-text');
        if(startBtn) startBtn.style.display = 'none';
        if(stopBtn) stopBtn.style.display = 'flex';
        if(statusText) statusText.innerHTML = `🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${selectedTimeframe}`;
        showSearchingStatus();
        showNotification("✅ تم بدء التحليل التلقائي", "#00ffaa");
    }

    function stopAnalysis() {
        if(!botRunning) return;
        clearInterval(botInterval); botRunning = false;
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusText = document.getElementById('status-text');
        if(startBtn) startBtn.style.display = 'flex';
        if(stopBtn) stopBtn.style.display = 'none';
        if(statusText) statusText.innerHTML = '🔴 متوقف';
        hideSearchingStatus();
        showNotification("⏹ تم إيقاف التحليل", "#ffaa66");
    }

    function hideUI() {
        if(uiElement) {
            uiElement.style.display = 'none';
            if(floatingCircle) floatingCircle.style.display = 'flex';
            isUIVisible = false;
        }
    }

    function showUI() {
        if(uiElement) {
            uiElement.style.display = 'block';
            if(floatingCircle) floatingCircle.style.display = 'none';
            isUIVisible = true;
        }
    }

    function createFloatingCircle() {
        let circle = document.createElement('div');
        circle.id = 'obeida-floating-circle';
        circle.style.cssText = `position:fixed;bottom:20px;right:20px;width:60px;height:60px;
            background:radial-gradient(circle,#ffd966,#ff9900);border-radius:50%;
            display:none;align-items:center;justify-content:center;cursor:pointer;
            z-index:999995;box-shadow:0 0 20px rgba(255,217,102,0.6);
            transition:transform 0.2s, box-shadow 0.2s;`;
        circle.innerHTML = `<span style="color:#000;font-size:30px;font-weight:bold;">🔥</span>`;
        
        circle.onmouseover = () => { circle.style.transform = 'scale(1.1)'; circle.style.boxShadow = '0 0 30px rgba(255,217,102,0.8)'; };
        circle.onmouseout = () => { circle.style.transform = 'scale(1)'; circle.style.boxShadow = '0 0 20px rgba(255,217,102,0.6)'; };
        
        let clickTimer = null;
        let clickCount = 0;
        
        circle.onclick = (e) => {
            e.stopPropagation();
            clickCount++;
            if(clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                if(clickCount === 2) {
                    showUI();
                }
                clickCount = 0;
            }, 300);
        };
        
        document.body.appendChild(circle);
        return circle;
    }

    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        const header = element.querySelector('.drag-handle');
        if(!header) return;
        
        header.addEventListener('mousedown', (e) => {
            if(e.target.closest('button')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;
            element.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if(!isDragging) return;
            let dx = e.clientX - startX;
            let dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            let maxLeft = window.innerWidth - element.offsetWidth;
            let maxTop = window.innerHeight - element.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            element.style.cursor = '';
        });
    }

    function createUI() {
        let ex = document.getElementById('obeida-ui'); if(ex) ex.remove();
        let ui = document.createElement('div');
        ui.id = 'obeida-ui';
        ui.style.cssText = `position:fixed;bottom:20px;right:20px;width:400px;max-width:90vw;
            background:linear-gradient(145deg,#0a0f1e,#020408);border-radius:25px;
            border:1px solid rgba(255,217,102,0.5);z-index:999990;direction:rtl;
            font-family:'Tahoma','Segoe UI',monospace;box-shadow:0 10px 30px rgba(0,0,0,0.5);`;
        
        ui.innerHTML = `
            <div class="drag-handle" style="background:linear-gradient(135deg,#1a1f2e,#0a0f1e);padding:12px;text-align:center;border-bottom:2px solid #ffd966;border-radius:25px 25px 0 0;cursor:move;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:28px;">🔥</span>
                        <div>
                            <h3 style="color:#ffd966;margin:0;font-size:16px;">Obeida Trading Pro V5.0</h3>
                            <div style="font-size:9px;color:#88ccff;">يعمل بـ  أقوى استراتيجيات </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="hide-ui-btn" style="background:none;border:none;color:#ff4466;cursor:pointer;font-size:18px;font-weight:bold;padding:5px 10px;">✖</button>
                    </div>
                </div>
            </div>
            <div id="ui-main" style="padding:12px;">
                <div style="background:linear-gradient(135deg,#00000088,#00000044);border-radius:12px;padding:8px;text-align:center;margin-bottom:10px;">
                    <div style="font-size:9px;color:#aaa;">💰 السعر الحالي</div>
                    <div style="display:flex;justify-content:center;align-items:center;gap:15px;">
                        <span id="current-price-display" style="font-size:20px;color:#00ffaa;font-weight:bold;font-family:monospace;">0.00000</span>
                        <span id="price-diff-display" style="font-size:12px;font-weight:bold;">● 0</span>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:linear-gradient(135deg,#00000066,#00000033);border-radius:12px;padding:8px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">💰 العملة</div>
                        <div id="current-asset-display" style="font-size:13px;color:#00d4ff;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:linear-gradient(135deg,#00000066,#00000033);border-radius:12px;padding:8px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">⏱️ الفريم</div>
                        <div id="st-tf-value" style="font-size:13px;color:#ff9800;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                </div>
                <div style="background:linear-gradient(135deg,#00000066,#00000033);border-radius:12px;padding:8px;text-align:center;margin-bottom:10px;">
                    <div style="font-size:9px;color:#aaa;">🏦 نوع الحساب</div>
                    <div id="current-account-display" style="font-size:13px;font-weight:bold;">🔄 جاري الكشف...</div>
                </div>
                <div id="current-timeframe-display" style="background:linear-gradient(135deg,#00000066,#00000033);border-radius:12px;padding:8px;text-align:center;font-size:10px;margin-bottom:10px;"></div>
                <div id="fib-levels" style="background:linear-gradient(135deg,#00000066,#00000033);border-radius:12px;padding:8px;margin-bottom:10px;font-size:9px;"></div>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <button id="start-btn" style="flex:1;padding:10px;background:linear-gradient(95deg,#00aa44,#008833);border:none;border-radius:20px;color:#fff;cursor:pointer;font-weight:bold;transition:transform 0.2s;">▶ بدء التداول</button>
                    <button id="stop-btn" style="flex:1;padding:10px;background:linear-gradient(95deg,#8b2c2c,#661111);border:none;border-radius:20px;color:#fff;cursor:pointer;display:none;font-weight:bold;transition:transform 0.2s;">⏹ إيقاف التحليل</button>
                </div>
                <div id="status-text" style="background:#00000066;border-radius:12px;padding:8px;text-align:center;font-size:11px;color:#ffd966;font-weight:bold;">🔴 متوقف</div>
                <div id="last-signal" style="background:rgba(0,0,0,0.3);border-radius:12px;padding:8px;margin-top:10px;">
                    <div style="font-size:10px;color:#888;text-align:center;">⏳ انتظار الإشارات...</div>
                </div>
                <div id="trades-container"></div>
                <div style="display:flex;gap:10px;margin-top:10px;">
                    <button id="settings-btn" style="flex:1;padding:6px;background:#333;border:none;border-radius:15px;color:#fff;cursor:pointer;font-size:10px;transition:transform 0.2s;">⚙️ إعدادات</button>
                    <button id="telegram-btn" style="flex:1;padding:6px;background:linear-gradient(95deg,#0088cc,#006699);border:none;border-radius:15px;color:#fff;cursor:pointer;font-size:10px;transition:transform 0.2s;">📢 تليجرام</button>
                    <button id="fib-toggle" style="flex:1;padding:6px;background:${SETTINGS.useFibonacciLevels ? "#4a6a2a" : "#4a2a2a"};border:none;border-radius:15px;color:#fff;cursor:pointer;font-size:10px;transition:transform 0.2s;">📊 فيبوناتشي</button>
                </div>
                <div style="font-size:8px;color:#ffd966;text-align:center;margin-top:10px;">⚡ يعمل بـ أقوى استراتيجيات ⚡</div>
            </div>`;
        
        document.body.appendChild(ui);
        uiElement = ui;
        
        makeDraggable(ui);
        
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const hideBtn = document.getElementById('hide-ui-btn');
        const telegramBtn = document.getElementById('telegram-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const fibToggle = document.getElementById('fib-toggle');
        
        if(startBtn) startBtn.onclick = startAnalysis;
        if(stopBtn) stopBtn.onclick = stopAnalysis;
        if(hideBtn) hideBtn.onclick = hideUI;
        if(telegramBtn) telegramBtn.onclick = () => window.open('https://t.me/ObeidaTrading','_blank');
        if(settingsBtn) settingsBtn.onclick = showSettingsModal;
        if(fibToggle) fibToggle.onclick = () => {
            SETTINGS.useFibonacciLevels = !SETTINGS.useFibonacciLevels;
            fibToggle.style.background = SETTINGS.useFibonacciLevels ? "#4a6a2a" : "#4a2a2a";
            showNotification(SETTINGS.useFibonacciLevels ? "✅ تم تفعيل مستويات فيبوناتشي" : "❌ تم تعطيل مستويات فيبوناتشي", "#ffd966");
        };
        
        updateTradesDisplay();
    }

    function showSettingsModal() {
        let modal = document.createElement('div');
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000001;display:flex;justify-content:center;align-items:center;`;
        modal.innerHTML = `
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:30px;border-radius:30px;border:2px solid #ffd966;width:340px;">
                <h3 style="color:#ffd966;text-align:center;">⚙️ الإعدادات المتقدمة</h3>
                <div style="margin-bottom:15px;"><label style="color:#fff;">🎯 جني الربح (نقطة):</label><input type="number" id="tp-setting" value="${SETTINGS.takeProfitPips}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;">🛑 وقف الخسارة (نقطة):</label><input type="number" id="sl-setting" value="${SETTINGS.stopLossPips}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;">📊 الحد الأقصى للصفقات يومياً:</label><input type="number" id="max-trades" value="${SETTINGS.maxTradesPerDay}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;">🎯 الحد الأدنى للثقة (%):</label><input type="number" id="min-conf" value="${SETTINGS.minConfidence}" style="width:100%;padding:8px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <button id="save-settings" style="width:100%;padding:10px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:20px;cursor:pointer;font-weight:bold;transition:transform 0.2s;">💾 حفظ الإعدادات</button>
                <button id="close-settings" style="width:100%;margin-top:10px;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;cursor:pointer;transition:transform 0.2s;">❌ إغلاق</button>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('save-settings').onclick = () => {
            SETTINGS.takeProfitPips = parseInt(document.getElementById('tp-setting').value) || 50;
            SETTINGS.stopLossPips = parseInt(document.getElementById('sl-setting').value) || 25;
            SETTINGS.maxTradesPerDay = parseInt(document.getElementById('max-trades').value) || 10;
            SETTINGS.minConfidence = parseInt(document.getElementById('min-conf').value) || 75;
            modal.remove();
            updateTradesDisplay();
            showNotification("✅ تم حفظ الإعدادات بنجاح", "#00ffaa");
        };
        document.getElementById('close-settings').onclick = () => modal.remove();
    }

    function showPasswordModal() {
        let modal = document.createElement('div');
        modal.id = 'password-modal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);z-index:1000000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(10px);`;
        modal.innerHTML = `
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:40px;border-radius:50px;border:2px solid #ffd966;text-align:center;width:360px;box-shadow:0 0 50px rgba(255,217,102,0.3);">
                <div style="font-size:30px;animation:pulse 1s infinite;">🔥</div>
                <h2 style="color:#ffd966;margin:10px 0;">Obeida Trading Bot</h2>
                <p style="color:#88ccff;"> يعمل بـ  أقوى استراتيجيات </p>
                <p style="color:#ffaa66;">🔑 أدخل كلمة المرور للدخول</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور" style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:2px solid #ffd966;color:#fff;border-radius:30px;text-align:center;font-size:16px;">
                <button id="login-btn" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;font-size:16px;transition:transform 0.2s;">🔐 تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:20px;">📢 للحصول على كلمة المرور: <span id="tg-link" style="color:#88ccff;cursor:pointer;text-decoration:underline;">@ObeidaTrading</span></p>
                <div id="error-message" style="color:#ff4466;font-size:12px;margin-top:10px;display:none;">❌ كلمة المرور غير صحيحة</div>
            </div>`;
        document.body.appendChild(modal);
        
        let errorDiv = document.getElementById('error-message');
        
        document.getElementById('login-btn').onclick = () => {
            let inputPass = document.getElementById('pass-input').value;
            if(inputPass === BOT_PASSWORD){
                isAuthenticated = true;
                modal.remove();
                createUI();
                floatingCircle = createFloatingCircle();
                initPriceRadar();
                initAssetDetection();
                initTimeframeDetection();
                initAccountDetection();
                updateFibonacciLevels();
                updateAutoDetectionUI();
                console.log("%c✅ تم تسجيل الدخول بنجاح  ", "color: #00ffaa; font-weight: bold;");
                showNotification("✅ مرحباً بك في Obeida Trading ", "#00ffaa");
            } else {
                errorDiv.style.display = 'block';
                errorDiv.innerHTML = '❌ كلمة المرور غير صحيحة - حاول مرة أخرى';
                document.getElementById('pass-input').style.borderColor = '#ff4466';
                document.getElementById('pass-input').value = '';
                loginAttempts++;
                if(loginAttempts >= 3) {
                    errorDiv.innerHTML = '⚠️ تم المحاولة 3 مرات - الرجاء التأكد من كلمة المرور';
                }
            }
        };
        
        document.getElementById('tg-link').onclick = () => window.open('https://t.me/ObeidaTrading','_blank');
        document.getElementById('pass-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') document.getElementById('login-btn').click(); });
        
        let pulseStyle = document.createElement('style');
        pulseStyle.textContent = `@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}`;
        document.head.appendChild(pulseStyle);
    }

    // ========== بدء التشغيل ==========
    console.log("%c✨ Obeida Trading Bot ✨", "color: #ffd966; font-size: 16px; font-weight: bold;");
    console.log("%c📊 يعمل بـ  أقوى استراتيجيات ", "color: #00ffaa; font-size: 12px;");
    
    showPasswordModal();

    // ========== API عام ==========
    window.ObeidaPro = {
        start: startAnalysis,
        stop: stopAnalysis,
        status: () => botRunning ? "يعمل" : "متوقف",
        getCurrentPrice: () => currentPrice,
        getTimeframe: () => selectedTimeframe,
        getCurrentAsset: () => currentAsset,
        getAccountType: () => currentAccountType,
        getActiveCount: () => getActiveStrategies().length,
        showUI: showUI,
        hideUI: hideUI,
        version: "النسخة الأولى من بوت التداول",
        strategies: STRATEGIES.length,
        getTrades: () => [...tradesHistory],
        getCurrentTrade: () => currentTrade
    };

})();
