// ============================================
// Obeida Trading Bot - النسخة المحسّنة V7.0 ULTIMATE
// 100+ استراتيجية محسّنة حسب نوع التداول - سحب شارت حقيقي 100%
// ============================================
(function(){
    'use strict';

    // ========== كلمة المرور ==========
    const BOT_PASSWORD = "@ObeidaTrading";
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
        useMultiTimeframeConfirm: true,
        useSupplyDemand: true
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
    let volumeHistory = [];
    
    // ========== مناطق الطلب والعرض ==========
    let demandZones = [];
    let supplyZones = [];
    let orderBlocks = [];
    
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
    let lastAsset = "";
    let lastTimeframe = "";

    // ========== الفريمات المدعومة ==========
    const TIMEFRAMES = {
        "5s":  { seconds: 5,     waitSeconds: 10,     name: "5 ثوان",   category: "scalp_ultra", weight: 0.70, order: 1 },
        "10s": { seconds: 10,    waitSeconds: 20,     name: "10 ثوان",  category: "scalp_ultra", weight: 0.72, order: 2 },
        "15s": { seconds: 15,    waitSeconds: 30,     name: "15 ثانية", category: "scalp_ultra", weight: 0.75, order: 3 },
        "30s": { seconds: 30,    waitSeconds: 60,     name: "30 ثانية", category: "scalp_ultra", weight: 0.78, order: 4 },
        "1m":  { seconds: 60,    waitSeconds: 120,    name: "1 دقيقة",  category: "scalp_fast",  weight: 0.82, order: 5 },
        "2m":  { seconds: 120,   waitSeconds: 240,    name: "2 دقائق",  category: "scalp_fast",  weight: 0.85, order: 6 },
        "3m":  { seconds: 180,   waitSeconds: 360,    name: "3 دقائق",  category: "scalp_fast",  weight: 0.87, order: 7 },
        "5m":  { seconds: 300,   waitSeconds: 600,    name: "5 دقائق",  category: "intraday",    weight: 0.90, order: 8 },
        "10m": { seconds: 600,   waitSeconds: 1200,   name: "10 دقائق", category: "intraday",    weight: 0.92, order: 9 },
        "15m": { seconds: 900,   waitSeconds: 1800,   name: "15 دقيقة", category: "intraday",    weight: 0.94, order: 10 },
        "30m": { seconds: 1800,  waitSeconds: 3600,   name: "30 دقيقة", category: "intraday",    weight: 0.95, order: 11 },
        "1h":  { seconds: 3600,  waitSeconds: 7200,   name: "1 ساعة",   category: "swing",       weight: 0.96, order: 12 },
        "4h":  { seconds: 14400, waitSeconds: 28800,  name: "4 ساعات",  category: "swing",       weight: 0.95, order: 13 },
        "1d":  { seconds: 86400, waitSeconds: 172800, name: "يومي",     category: "position",    weight: 0.93, order: 14 }
    };

    // =====================================================
    // ========== رادار السعر + سحب الشارت الحقيقي ==========
    // =====================================================
    function initPriceRadar() {
        console.log("%c 🛰️ جاري كشف العملة والسعر ... ", "color: #00ffcc; font-weight: bold;");

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
                                
                                priceHistory.push({close: currentPrice, time: Date.now(), high: currentPrice + 0.0001, low: currentPrice - 0.0001});
                                if (priceHistory.length > 500) priceHistory.shift();
                                
                                updateFibonacciLevels();
                                detectSupplyDemandZones();
                                
                                let diff = lastPrice === 0 ? 0 : (currentPrice - lastPrice).toFixed(5);
                                let color = diff > 0 ? "#27ae60" : (diff < 0 ? "#e74c3c" : "#2c3e50");

                                console.log(
                                    `%c 🎯 Asset: ${activeAsset} %c Price: ${currentPrice} %c Speed: ${diff} `,
                                    "color: white; background: #2980b9; padding: 6px; font-weight: bold; border-radius: 5px 0 0 5px;",
                                    `color: white; background: ${color}; padding: 6px; font-weight: bold;`,
                                    "color: white; background: #34495e; padding: 6px; font-weight: bold; border-radius: 0 5px 5px 0;"
                                );
                                
                                updatePriceDisplay(currentPrice, diff);
                                
                                if (currentTrade && currentTrade.status === "open") {
                                    checkTradeExit(currentPrice);
                                }
                                
                                lastPrice = currentPrice;
                            }
                        }
                        
                        if (textData && textData.length > 500 && textData.includes('[[')) {
                            try {
                                const matches = textData.match(/\[\[.*?\]\]/g);
                                if (matches) {
                                    const rawData = JSON.parse(matches[0]);
                                    if (rawData && rawData.length > 50) {
                                        const newHistory = rawData.map(c => {
                                            let prices = c.filter(val => typeof val === 'number' && val > 10);
                                            return {
                                                time: c[0] * 1000,
                                                open: prices[0] || 0,
                                                high: Math.max(...prices) || 0,
                                                low: Math.min(...prices) || 0,
                                                close: prices[prices.length - 1] || 0,
                                                volume: c[5] || 1000
                                            };
                                        }).filter(c => c.open > 0 && c.close > 0);
                                        
                                        if (newHistory.length > 0) {
                                            priceHistory = newHistory.slice(-200);
                                            console.log("%c ✅ تم تحديث بيانات الشموع: " + priceHistory.length + " شمعة", "color: #00ff00; font-size: 12px;");
                                            updateFibonacciLevels();
                                            detectSupplyDemandZones();
                                        }
                                    }
                                }
                            } catch(e) {}
                        }
                    } catch (e) {}
                });
                this.singlePriceObserver = true;
            }
            return originalSend.apply(this, arguments);
        };
    }

    function getChartData() {
        if (priceHistory.length === 0) {
            return [];
        }
        return priceHistory.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 1000
        }));
    }

    // ========== كشف مناطق الطلب والعرض ==========
    function detectSupplyDemandZones() {
        if (priceHistory.length < 50) return;
        
        demandZones = [];
        supplyZones = [];
        orderBlocks = [];
        
        let prices = priceHistory.map(p => p.close);
        let highs = priceHistory.map(p => p.high || p.close + 0.0001);
        let lows = priceHistory.map(p => p.low || p.close - 0.0001);
        
        for (let i = 20; i < prices.length - 10; i++) {
            let zoneLow = lows[i];
            let zoneHigh = highs[i];
            
            for (let j = i - 20; j < i; j++) {
                if (lows[j] < zoneLow) zoneLow = lows[j];
                if (highs[j] > zoneHigh) zoneHigh = highs[j];
            }
            
            let range = zoneHigh - zoneLow;
            let demandStrength = 0;
            
            for (let k = i + 1; k < Math.min(i + 15, prices.length); k++) {
                if (prices[k] >= zoneLow && prices[k] <= zoneLow + range * 0.3) {
                    demandStrength++;
                }
            }
            
            if (demandStrength >= 3 && range > 0.0005) {
                demandZones.push({
                    low: zoneLow,
                    high: zoneLow + range * 0.3,
                    strength: demandStrength,
                    price: zoneLow
                });
            }
        }
        
        for (let i = 20; i < prices.length - 10; i++) {
            let zoneLow = lows[i];
            let zoneHigh = highs[i];
            
            for (let j = i - 20; j < i; j++) {
                if (lows[j] < zoneLow) zoneLow = lows[j];
                if (highs[j] > zoneHigh) zoneHigh = highs[j];
            }
            
            let range = zoneHigh - zoneLow;
            let supplyStrength = 0;
            
            for (let k = i + 1; k < Math.min(i + 15, prices.length); k++) {
                if (prices[k] >= zoneHigh - range * 0.3 && prices[k] <= zoneHigh) {
                    supplyStrength++;
                }
            }
            
            if (supplyStrength >= 3 && range > 0.0005) {
                supplyZones.push({
                    low: zoneHigh - range * 0.3,
                    high: zoneHigh,
                    strength: supplyStrength,
                    price: zoneHigh
                });
            }
        }
        
        for (let i = 10; i < prices.length - 5; i++) {
            let prevHigh = highs[i-1];
            let prevLow = lows[i-1];
            let currentHigh = highs[i];
            let currentLow = lows[i];
            
            if (currentLow > prevHigh && prices[i] > prices[i-1]) {
                orderBlocks.push({
                    type: "BULLISH",
                    low: prevLow,
                    high: prevHigh,
                    price: prevHigh,
                    strength: Math.min(100, (currentHigh - currentLow) * 10000)
                });
            }
            
            if (currentHigh < prevLow && prices[i] < prices[i-1]) {
                orderBlocks.push({
                    type: "BEARISH",
                    low: prevLow,
                    high: prevHigh,
                    price: prevLow,
                    strength: Math.min(100, (currentHigh - currentLow) * 10000)
                });
            }
        }
        
        demandZones = demandZones.filter((zone, index, self) => 
            index === self.findIndex(z => Math.abs(z.price - zone.price) < 0.001)
        ).slice(0, 5);
        
        supplyZones = supplyZones.filter((zone, index, self) => 
            index === self.findIndex(z => Math.abs(z.price - zone.price) < 0.001)
        ).slice(0, 5);
        
        orderBlocks = orderBlocks.slice(0, 5);
        
        updateSupplyDemandDisplay();
    }
    
    function updateSupplyDemandDisplay() {
        const sdEl = document.getElementById('supply-demand-levels');
        if (!sdEl) return;
        
        let html = `<div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;">
            <div style="font-size:10px;color:#ffd966;margin-bottom:5px;">📊 مناطق الطلب والعرض</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:8px;">`;
        
        if (demandZones.length > 0) {
            html += `<div style="color:#00ffaa;">🟢 طلب: ${demandZones[0].price.toFixed(5)}</div>`;
        } else {
            html += `<div style="color:#666;">🟢 طلب: --</div>`;
        }
        
        if (supplyZones.length > 0) {
            html += `<div style="color:#ff4466;">🔴 عرض: ${supplyZones[0].price.toFixed(5)}</div>`;
        } else {
            html += `<div style="color:#666;">🔴 عرض: --</div>`;
        }
        
        if (orderBlocks.length > 0 && orderBlocks[0]) {
            let obColor = orderBlocks[0].type === "BULLISH" ? "#00ffaa" : "#ff4466";
            html += `<div style="color:${obColor};">📦 OB: ${orderBlocks[0].price.toFixed(5)}</div>`;
        } else {
            html += `<div style="color:#666;">📦 OB: --</div>`;
        }
        
        html += `</div></div>`;
        sdEl.innerHTML = html;
    }
    
    function getNearestDemandZone(price) {
        if (demandZones.length === 0) return null;
        let nearest = null;
        let minDist = Infinity;
        for (let zone of demandZones) {
            let dist = Math.abs(price - zone.price);
            if (dist < minDist && price > zone.price) {
                minDist = dist;
                nearest = zone;
            }
        }
        return nearest;
    }
    
    function getNearestSupplyZone(price) {
        if (supplyZones.length === 0) return null;
        let nearest = null;
        let minDist = Infinity;
        for (let zone of supplyZones) {
            let dist = Math.abs(price - zone.price);
            if (dist < minDist && price < zone.price) {
                minDist = dist;
                nearest = zone;
            }
        }
        return nearest;
    }
    
    // ========== تحديث مستويات فيبوناتشي ==========
    function updateFibonacciLevels() {
        if (priceHistory.length < 30) return;
        
        let recentPrices = priceHistory.slice(-100);
        swingHigh = Math.max(...recentPrices.map(p => p.high || p.close));
        swingLow = Math.min(...recentPrices.map(p => p.low || p.close));
        
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
                <div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;">
                    <div style="font-size:9px;color:#ffd966;margin-bottom:4px;">📐 مستويات فيبوناتشي</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;font-size:7px;">
                        <div style="color:#ffd966;">0.236: ${fibonacciLevels.level236.toFixed(5)}</div>
                        <div style="color:#ffaa66;">0.382: ${fibonacciLevels.level382.toFixed(5)}</div>
                        <div style="color:#ff8866;">0.5: ${fibonacciLevels.level500.toFixed(5)}</div>
                        <div style="color:#ff6688;">0.618: ${fibonacciLevels.level618.toFixed(5)}</div>
                        <div style="color:#ff66aa;">0.786: ${fibonacciLevels.level786.toFixed(5)}</div>
                        <div style="color:#00ffaa;">161.8%: ${fibonacciLevels.extension1618.toFixed(5)}</div>
                    </div>
                </div>
            `;
        }
    }
    
    function getOptimalEntry(price, direction) {
        if (!SETTINGS.useSmartEntry) return price;
        
        if (direction === "CALL") {
            let demandZone = getNearestDemandZone(price);
            if (demandZone && price > demandZone.price) {
                return demandZone.price;
            }
            if (price <= fibonacciLevels.level382) return price;
            if (price <= fibonacciLevels.level236) return price;
            return fibonacciLevels.level382;
        } else {
            let supplyZone = getNearestSupplyZone(price);
            if (supplyZone && price < supplyZone.price) {
                return supplyZone.price;
            }
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
            let supplyZone = getNearestSupplyZone(entryPrice);
            if (supplyZone && supplyZone.price > entryPrice) {
                return supplyZone.price;
            }
            return fibonacciLevels.level618;
        } else {
            let demandZone = getNearestDemandZone(entryPrice);
            if (demandZone && demandZone.price < entryPrice) {
                return demandZone.price;
            }
            return fibonacciLevels.level382;
        }
    }
    
    function getOptimalSL(entryPrice, direction) {
        if (!SETTINGS.useFibonacciLevels) {
            return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
        }
        
        if (direction === "CALL") {
            let demandZone = getNearestDemandZone(entryPrice);
            if (demandZone && demandZone.price < entryPrice) {
                return demandZone.price - 0.0002;
            }
            return fibonacciLevels.level236;
        } else {
            let supplyZone = getNearestSupplyZone(entryPrice);
            if (supplyZone && supplyZone.price > entryPrice) {
                return supplyZone.price + 0.0002;
            }
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

    // ========== كشف العملة والفريم والحساب التلقائي ==========
    function initAssetDetection() {
        function updateAssetInfo(element) {
            if (element) {
                let assetName = element.innerText;
                if (assetName !== currentAsset && currentAsset !== "🔄 جاري الكشف...") {
                    console.log("%c🔄 تم تغيير العملة، إعادة تعيين التحليل...", "color: #ff9800; font-weight: bold;");
                    resetAnalysis();
                }
                currentAsset = assetName;
                console.log("%c[نظام التداول]: العملة الحالية هي: " + assetName, "color: #00d4ff; font-weight: bold;");
                
                const assetDisplay = document.getElementById('current-asset-display');
                if (assetDisplay) {
                    assetDisplay.innerText = assetName;
                }
            }
        }

        const targetNode = document.querySelector('.T4GAK');

        if (targetNode) {
            updateAssetInfo(targetNode);

            if (assetObserver) assetObserver.disconnect();
            assetObserver = new MutationObserver((mutationsList) => {
                for (let mutation of mutationsList) {
                    updateAssetInfo(targetNode);
                }
            });

            assetObserver.observe(targetNode, { childList: true, subtree: true, characterData: true });
            console.log("تم تفعيل الرصد التلقائي للعملة.");
        } else {
            console.error("لم يتم العثور على عنصر العملة");
            setTimeout(() => {
                const retryNode = document.querySelector('.T4GAK');
                if (retryNode) {
                    updateAssetInfo(retryNode);
                    if (assetObserver) assetObserver.disconnect();
                    assetObserver = new MutationObserver((mutationsList) => {
                        for (let mutation of mutationsList) {
                            updateAssetInfo(retryNode);
                        }
                    });
                    assetObserver.observe(retryNode, { childList: true, subtree: true, characterData: true });
                    console.log("تم تفعيل الرصد التلقائي للعملة (بعد المحاولة الثانية).");
                }
            }, 2000);
        }
    }

    function initTimeframeDetection() {
        function getLiveTimeframe() {
            const tfSelectors = [
                '.gmGcQ', 
                '[class*="timeframe"]', 
                '[class*="interval"]', 
                '[class*="period"]',
                '[class*="tf"]',
                'button[class*="selected"]',
                '.selected[class*="time"]'
            ];
            
            let foundTF = null;
            
            for (let selector of tfSelectors) {
                const elements = document.querySelectorAll(selector);
                for (let el of elements) {
                    const text = el.innerText.trim();
                    if (/^(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h|4h|1d)$/i.test(text)) {
                        foundTF = text.toLowerCase();
                        break;
                    }
                }
                if (foundTF) break;
            }
            
            if (!foundTF) {
                const allText = document.body.innerText;
                const match = allText.match(/(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h|4h|1d)/i);
                if (match) foundTF = match[0].toLowerCase();
            }
            
            return foundTF;
        }

        function syncDisplay() {
            const currentTF = getLiveTimeframe();
            
            if (currentTF && TIMEFRAMES[currentTF]) {
                if (currentTF !== selectedTimeframe) {
                    selectedTimeframe = currentTF;
                    currentTimeframeAuto = currentTF;
                    console.log("%c[الفريم]: " + currentTF + " - " + TIMEFRAMES[currentTF].name, "color: #ff9800; font-size: 14px; font-weight: bold;");
                    resetAnalysis();
                    
                    const timeframeEl = document.getElementById('st-tf-value');
                    if (timeframeEl) timeframeEl.innerText = currentTF;
                    
                    const timeframeDisplay = document.getElementById('current-timeframe-display');
                    if (timeframeDisplay) {
                        let config = TIMEFRAMES[currentTF];
                        let categoryLabels = {
                            scalp_ultra: "⚡ سكالبينج فائق السرعة",
                            scalp_fast:  "🔥 سكالبينج سريع",
                            intraday:    "📈 تداول يومي",
                            swing:       "🌊 تداول تأرجح",
                            position:    "🏔 تداول طويل الأمد"
                        };
                        let catLabel = categoryLabels[config.category] || "";
                        let activeCount = getActiveStrategies().length;
                        timeframeDisplay.innerHTML = `📊 ${config.name} (${currentTF}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية | انتظار ${config.waitSeconds} ثانية</span>`;
                    }
                    
                    if (botRunning) {
                        const statusEl = document.getElementById('status-text');
                        if (statusEl) statusEl.innerHTML = `🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${currentTF}`;
                    }
                }
            } else if (currentTF && !selectedTimeframe) {
                selectedTimeframe = currentTF;
                currentTimeframeAuto = currentTF;
                const timeframeEl = document.getElementById('st-tf-value');
                if (timeframeEl) timeframeEl.innerText = currentTF;
            } else if (!currentTF && !selectedTimeframe) {
                currentTimeframeAuto = "❌ لم يتم اكتشافه";
                const timeframeEl = document.getElementById('st-tf-value');
                if (timeframeEl) timeframeEl.innerText = currentTimeframeAuto;
            }
        }

        syncDisplay();
        
        if (timeframeObserver) timeframeObserver.disconnect();
        timeframeObserver = new MutationObserver(() => syncDisplay());
        timeframeObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function initAccountDetection() {
        let lastAccountType = "";
        
        function checkAndNotify() {
            const headerText = document.querySelector('header')?.innerText || document.body.innerText;
            
            const isDemo = headerText.includes("Demo") || headerText.includes("تجريبي") || headerText.includes("DEMO") || headerText.includes("demo");
            const currentType = isDemo ? "DEMO" : "LIVE";
            
            if (currentType !== lastAccountType) {
                lastAccountType = currentType;
                currentAccountType = currentType === "DEMO" ? "DEMO" : "LIVE";
                
                const accountEl = document.getElementById('current-account-display');
                if (accountEl) {
                    accountEl.innerText = currentType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
                    accountEl.style.color = currentType === "DEMO" ? "#ffaa66" : "#00ffaa";
                }
                
                if (currentType === "DEMO") {
                    console.log("%c[الحساب]: تم التحويل إلى الحساب التجريبي 🔸", "color: orange; font-size: 14px; font-weight: bold;");
                } else {
                    console.log("%c[الحساب]: تم التحويل إلى الحساب الحقيقي ✅", "color: #00ff00; font-size: 14px; font-weight: bold;");
                }
            } else if (currentAccountType === "🔄 جاري الكشف..." && currentType) {
                currentAccountType = currentType === "DEMO" ? "DEMO" : "LIVE";
                lastAccountType = currentType;
                const accountEl = document.getElementById('current-account-display');
                if (accountEl) {
                    accountEl.innerText = currentType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
                    accountEl.style.color = currentType === "DEMO" ? "#ffaa66" : "#00ffaa";
                }
            }
        }
        
        checkAndNotify();
        
        if (accountObserver) accountObserver.disconnect();
        accountObserver = new MutationObserver(() => {
            checkAndNotify();
        });
        
        accountObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function resetAnalysis() {
        if (botRunning) {
            priceHistory = [];
            demandZones = [];
            supplyZones = [];
            orderBlocks = [];
            console.log("%c✅ تم إعادة تعيين التحليل ", "color: #00ffaa; font-weight: bold;");
        }
    }

    // =====================================================
    // ========== الاستراتيجيات المحسّنة حسب نوع التداول ==========
    // =====================================================

    // ----- استراتيجيات سكالبينج فائق السرعة (scalp_ultra) -----
    
    function strategy_UltraScalp_RSI(candles) {
        if(candles.length < 10) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-10; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        if(rsi < 25) return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي سريع`};
        if(rsi > 75) return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي سريع`};
        return null;
    }
    strategy_UltraScalp_RSI._name = "UltraScalp_RSI";
    strategy_UltraScalp_RSI.category = "scalp_ultra";

    function strategy_UltraScalp_Momentum(candles) {
        if(candles.length < 5) return null;
        let closes = candles.map(c => c.close);
        let mom1 = closes[closes.length-1] - closes[closes.length-2];
        let mom2 = closes[closes.length-2] - closes[closes.length-3];
        let mom3 = closes[closes.length-3] - closes[closes.length-4];
        if(mom1 > 0 && mom1 > mom2 && mom2 > mom3) {
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: "زخم صاعد متسارع"};
        }
        if(mom1 < 0 && mom1 < mom2 && mom2 < mom3) {
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: "زخم هابط متسارع"};
        }
        return null;
    }
    strategy_UltraScalp_Momentum._name = "UltraScalp_Momentum";
    strategy_UltraScalp_Momentum.category = "scalp_ultra";

    function strategy_UltraScalp_PriceAction(candles) {
        if(candles.length < 3) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let prev2 = candles[candles.length-3];
        let body = Math.abs(last.close - last.open);
        let prevBody = Math.abs(prev.close - prev.open);
        if(last.close > last.open && body > prevBody * 1.5 && last.close > prev.high) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "شمعة صاعدة قوية - اختراق"};
        }
        if(last.close < last.open && body > prevBody * 1.5 && last.close < prev.low) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "شمعة هابطة قوية - اختراق"};
        }
        return null;
    }
    strategy_UltraScalp_PriceAction._name = "UltraScalp_PriceAction";
    strategy_UltraScalp_PriceAction.category = "scalp_ultra";

    function strategy_UltraScalp_Stochastic(candles) {
        if(candles.length < 10) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let high10 = Math.max(...highs.slice(-10));
        let low10 = Math.min(...lows.slice(-10));
        let k = ((closes[closes.length-1] - low10) / (high10 - low10)) * 100;
        let prevK = ((closes[closes.length-2] - low10) / (high10 - low10)) * 100;
        if(k < 20 && k > prevK) return {signal:"CALL", confidence: 91, strength: "قوية", reason: "ستوكاستيك تشبع بيعي متجه صعود"};
        if(k > 80 && k < prevK) return {signal:"PUT", confidence: 91, strength: "قوية", reason: "ستوكاستيك تشبع شرائي متجه هبوط"};
        return null;
    }
    strategy_UltraScalp_Stochastic._name = "UltraScalp_Stochastic";
    strategy_UltraScalp_Stochastic.category = "scalp_ultra";

    function strategy_UltraScalp_Bollinger_Bandit(candles) {
        if(candles.length < 10) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-10).reduce((a,b) => a+b, 0) / 10;
        let variance = closes.slice(-10).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 10;
        let std = Math.sqrt(variance);
        let lower = sma - 2 * std;
        let upper = sma + 2 * std;
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        if(current < lower && current > prev) return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "ارتداد سريع من بولينجر السفلي"};
        if(current > upper && current < prev) return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "ارتداد سريع من بولينجر العلوي"};
        return null;
    }
    strategy_UltraScalp_Bollinger_Bandit._name = "UltraScalp_Bollinger";
    strategy_UltraScalp_Bollinger_Bandit.category = "scalp_ultra";

    function strategy_UltraScalp_Volume_Burst(candles) {
        if(candles.length < 5) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-5, -1).reduce((a,b) => a+b, 0) / 4;
        let currentVol = volumes[volumes.length-1];
        let closes = candles.map(c => c.close);
        if(currentVol > avgVol * 2 && closes[closes.length-1] > closes[closes.length-2]) {
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "انفجار حجم مع صعود"};
        }
        if(currentVol > avgVol * 2 && closes[closes.length-1] < closes[closes.length-2]) {
            return {signal:"PUT", confidence: 96, strength: "قوية جدا", reason: "انفجار حجم مع هبوط"};
        }
        return null;
    }
    strategy_UltraScalp_Volume_Burst._name = "UltraScalp_Volume";
    strategy_UltraScalp_Volume_Burst.category = "scalp_ultra";

    // ----- استراتيجيات سكالبينج سريع (scalp_fast) -----
    
    function strategy_FastScalp_RSI_MACD(candles) {
        if(candles.length < 15) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-14; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        let closes = candles.map(c => c.close);
        let ema12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let ema26 = closes.slice(-26).reduce((a,b) => a+b, 0) / 26;
        let macd = ema12 - ema26;
        if(rsi < 35 && macd > 0) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "RSI منخفض + MACD إيجابي"};
        if(rsi > 65 && macd < 0) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "RSI مرتفع + MACD سلبي"};
        return null;
    }
    strategy_FastScalp_RSI_MACD._name = "FastScalp_RSI_MACD";
    strategy_FastScalp_RSI_MACD.category = "scalp_fast";

    function strategy_FastScalp_CCI_Reversal(candles) {
        if(candles.length < 15) return null;
        let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
        let sma = typicalPrices.slice(-14).reduce((a,b) => a+b, 0) / 14;
        let meanDev = typicalPrices.slice(-14).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / 14;
        let cci = (typicalPrices[typicalPrices.length-1] - sma) / (0.015 * meanDev);
        let prevCci = (typicalPrices[typicalPrices.length-2] - sma) / (0.015 * meanDev);
        if(cci < -100 && cci > prevCci) return {signal:"CALL", confidence: 90, strength: "قوية", reason: "CCI ارتداد من -100"};
        if(cci > 100 && cci < prevCci) return {signal:"PUT", confidence: 90, strength: "قوية", reason: "CCI ارتداد من +100"};
        return null;
    }
    strategy_FastScalp_CCI_Reversal._name = "FastScalp_CCI";
    strategy_FastScalp_CCI_Reversal.category = "scalp_fast";

    function strategy_FastScalp_Williams(candles) {
        if(candles.length < 15) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let high14 = Math.max(...highs.slice(-14));
        let low14 = Math.min(...lows.slice(-14));
        let wr = ((high14 - closes[closes.length-1]) / (high14 - low14)) * -100;
        let prevWr = ((high14 - closes[closes.length-2]) / (high14 - low14)) * -100;
        if(wr < -80 && wr > prevWr) return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Williams %R تشبع بيعي"};
        if(wr > -20 && wr < prevWr) return {signal:"PUT", confidence: 89, strength: "قوية", reason: "Williams %R تشبع شرائي"};
        return null;
    }
    strategy_FastScalp_Williams._name = "FastScalp_Williams";
    strategy_FastScalp_Williams.category = "scalp_fast";

    function strategy_FastScalp_Engulfing(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(prev.close < prev.open && last.close > last.open && last.open < prev.close && last.close > prev.open) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "ابتلاع صاعد - انعكاس سريع"};
        }
        if(prev.close > prev.open && last.close < last.open && last.open > prev.close && last.close < prev.open) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "ابتلاع هابط - انعكاس سريع"};
        }
        return null;
    }
    strategy_FastScalp_Engulfing._name = "FastScalp_Engulfing";
    strategy_FastScalp_Engulfing.category = "scalp_fast";

    function strategy_FastScalp_MACD_Cross(candles) {
        if(candles.length < 27) return null;
        let closes = candles.map(c => c.close);
        let ema12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let ema26 = closes.slice(-26).reduce((a,b) => a+b, 0) / 26;
        let macd = ema12 - ema26;
        let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
        let hist = macd - ema9;
        let prevMacd = 0;
        if(candles.length > 27) {
            let prevEma12 = closes.slice(-13,-1).reduce((a,b) => a+b, 0) / 12;
            let prevEma26 = closes.slice(-27,-1).reduce((a,b) => a+b, 0) / 26;
            prevMacd = prevEma12 - prevEma26;
            let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
            let prevHist = prevMacd - prevEma9;
            if(hist > 0 && prevHist <= 0) return {signal:"CALL", confidence: 91, strength: "قوية", reason: "تقاطع MACD صاعد"};
            if(hist < 0 && prevHist >= 0) return {signal:"PUT", confidence: 91, strength: "قوية", reason: "تقاطع MACD هابط"};
        }
        return null;
    }
    strategy_FastScalp_MACD_Cross._name = "FastScalp_MACD";
    strategy_FastScalp_MACD_Cross.category = "scalp_fast";

    // ----- استراتيجيات التداول اليومي (intraday) -----
    
    function strategy_Intraday_RSI_Divergence(candles) {
        if(candles.length < 30) return null;
        let closes = candles.map(c => c.close);
        let rsiValues = [];
        for(let i = 20; i < closes.length; i++) {
            let gains = 0, losses = 0;
            for(let j = i-14; j < i; j++) {
                let diff = closes[j+1] - closes[j];
                if(diff > 0) gains += diff;
                else losses += Math.abs(diff);
            }
            rsiValues.push(100 - (100 / (1 + (gains / (losses || 1)))));
        }
        if(rsiValues.length < 10) return null;
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        let lastRSI = rsiValues[rsiValues.length-1];
        let prevRSI = rsiValues[rsiValues.length-6];
        if(prevPrice > lastPrice && prevRSI < lastRSI && lastRSI < 35) {
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس إيجابي RSI - انعكاس صاعد"};
        }
        if(prevPrice < lastPrice && prevRSI > lastRSI && lastRSI > 65) {
            return {signal:"PUT", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس سلبي RSI - انعكاس هابط"};
        }
        return null;
    }
    strategy_Intraday_RSI_Divergence._name = "Intraday_RSI_Div";
    strategy_Intraday_RSI_Divergence.category = "intraday";

    function strategy_Intraday_MACD_Divergence(candles) {
        if(candles.length < 35) return null;
        let closes = candles.map(c => c.close);
        let macdValues = [];
        for(let i = 30; i < closes.length; i++) {
            let slice = closes.slice(i-26, i);
            let ema12 = slice.slice(-12).reduce((a,b) => a+b, 0) / 12;
            let ema26 = slice.reduce((a,b) => a+b, 0) / 26;
            macdValues.push(ema12 - ema26);
        }
        if(macdValues.length < 10) return null;
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        let lastMACD = macdValues[macdValues.length-1];
        let prevMACD = macdValues[macdValues.length-6];
        if(prevPrice > lastPrice && prevMACD < lastMACD && lastMACD < 0) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس إيجابي MACD"};
        }
        if(prevPrice < lastPrice && prevMACD > lastMACD && lastMACD > 0) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس سلبي MACD"};
        }
        return null;
    }
    strategy_Intraday_MACD_Divergence._name = "Intraday_MACD_Div";
    strategy_Intraday_MACD_Divergence.category = "intraday";

    function strategy_Intraday_Support_Resistance_Break(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let recentHighs = highs.slice(-20);
        let recentLows = lows.slice(-20);
        let resistance = Math.max(...recentHighs.slice(0, -1));
        let support = Math.min(...recentLows.slice(0, -1));
        let current = candles[candles.length-1].close;
        let prev = candles[candles.length-2].close;
        let body = Math.abs(candles[candles.length-1].close - candles[candles.length-1].open);
        let avgBody = candles.slice(-10).reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 10;
        if(current > resistance && current > prev && body > avgBody * 1.5) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "اختراق مقاومة بحجم قوي"};
        }
        if(current < support && current < prev && body > avgBody * 1.5) {
            return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: "اختراق دعم بحجم قوي"};
        }
        return null;
    }
    strategy_Intraday_Support_Resistance_Break._name = "Intraday_SR_Break";
    strategy_Intraday_Support_Resistance_Break.category = "intraday";

    function strategy_Intraday_Bollinger_Squeeze(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let bbw = (2 * std * 2) / sma;
        let prevSma = closes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let prevVariance = closes.slice(-21, -1).reduce((sum, price) => sum + Math.pow(price - prevSma, 2), 0) / 20;
        let prevStd = Math.sqrt(prevVariance);
        let prevBbw = (2 * prevStd * 2) / prevSma;
        if(bbw < 0.02 && prevBbw > bbw * 1.2) {
            let current = closes[closes.length-1];
            let prev = closes[closes.length-2];
            if(current > prev) return {signal:"CALL", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - صعود متوقع"};
            if(current < prev) return {signal:"PUT", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - هبوط متوقع"};
        }
        return null;
    }
    strategy_Intraday_Bollinger_Squeeze._name = "Intraday_Bollinger";
    strategy_Intraday_Bollinger_Squeeze.category = "intraday";

    function strategy_Intraday_MovingAverage_Crossover(candles) {
        if(candles.length < 50) return null;
        let closes = candles.map(c => c.close);
        let ma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let prevMa20 = closes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let prevMa50 = closes.slice(-51, -1).reduce((a,b) => a+b, 0) / 50;
        if(ma20 > ma50 && prevMa20 <= prevMa50) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "تقاطع MA20 فوق MA50 - تقاطع ذهبي"};
        }
        if(ma20 < ma50 && prevMa20 >= prevMa50) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "تقاطع MA20 تحت MA50 - تقاطع ميت"};
        }
        return null;
    }
    strategy_Intraday_MovingAverage_Crossover._name = "Intraday_MA_Cross";
    strategy_Intraday_MovingAverage_Crossover.category = "intraday";

    // ----- استراتيجيات التداول بالتأرجح (swing) -----
    
    function strategy_Swing_Fibonacci_Retracement(candles) {
        if(priceHistory.length < 50) return null;
        let current = currentPrice;
        let diffTo382 = Math.abs(current - fibonacciLevels.level382);
        let diffTo618 = Math.abs(current - fibonacciLevels.level618);
        let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
        let tolerance = range * 0.01;
        let closes = candles.map(c => c.close);
        let trend = closes[closes.length-1] > closes[closes.length-11] ? "UP" : "DOWN";
        if(diffTo382 < tolerance) {
            if(trend === "UP") return {signal:"CALL", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382 مع اتجاه صاعد"};
            if(trend === "DOWN") return {signal:"PUT", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382 مع اتجاه هابط"};
        }
        if(diffTo618 < tolerance) {
            if(trend === "UP") return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618 مستوى ذهبي مع اتجاه"};
        }
        return null;
    }
    strategy_Swing_Fibonacci_Retracement._name = "Swing_Fibonacci";
    strategy_Swing_Fibonacci_Retracement.category = "swing";

    function strategy_Swing_OrderBlock(candles) {
        if(orderBlocks.length === 0) return null;
        let current = currentPrice;
        let nearestOB = orderBlocks[0];
        if(nearestOB && Math.abs(current - nearestOB.price) < 0.0008) {
            if(nearestOB.type === "BULLISH" && current > nearestOB.price) {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block صاعد عند ${nearestOB.price.toFixed(5)}`};
            }
            if(nearestOB.type === "BEARISH" && current < nearestOB.price) {
                return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block هابط عند ${nearestOB.price.toFixed(5)}`};
            }
        }
        return null;
    }
    strategy_Swing_OrderBlock._name = "Swing_OrderBlock";
    strategy_Swing_OrderBlock.category = "swing";

    function strategy_Swing_DemandSupply(candles) {
        if(demandZones.length === 0 && supplyZones.length === 0) return null;
        let current = currentPrice;
        let nearestDemand = getNearestDemandZone(current);
        let nearestSupply = getNearestSupplyZone(current);
        if(nearestDemand && Math.abs(current - nearestDemand.price) < 0.0006 && current > nearestDemand.price) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: `ارتداد من منطقة طلب قوية`};
        }
        if(nearestSupply && Math.abs(current - nearestSupply.price) < 0.0006 && current < nearestSupply.price) {
            return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: `ارتداد من منطقة عرض قوية`};
        }
        return null;
    }
    strategy_Swing_DemandSupply._name = "Swing_DemandSupply";
    strategy_Swing_DemandSupply.category = "swing";

    function strategy_Swing_Ichimoku(candles) {
        if(candles.length < 52) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let tenkanSen = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
        let kijunSen = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
        let current = closes[closes.length-1];
        if(current > tenkanSen && current > kijunSen && tenkanSen > kijunSen) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "إيشيموكو - سين Span A فوق Span B"};
        }
        if(current < tenkanSen && current < kijunSen && tenkanSen < kijunSen) {
            return {signal:"PUT", confidence: 91, strength: "قوية", reason: "إيشيموكو - إشارة هبوطية"};
        }
        return null;
    }
    strategy_Swing_Ichimoku._name = "Swing_Ichimoku";
    strategy_Swing_Ichimoku.category = "swing";

    function strategy_Swing_ADX_Trend(candles) {
        if(candles.length < 20) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let plusDM = [], minusDM = [], tr = [];
        for(let i = 1; i < closes.length; i++) {
            let upMove = highs[i] - highs[i-1];
            let downMove = lows[i-1] - lows[i];
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
            let hl = highs[i] - lows[i];
            let hpc = Math.abs(highs[i] - closes[i-1]);
            let lpc = Math.abs(lows[i] - closes[i-1]);
            tr.push(Math.max(hl, hpc, lpc));
        }
        let atr = tr.slice(-14).reduce((a,b) => a+b, 0) / 14;
        let smoothedPlusDM = plusDM.slice(-14).reduce((a,b) => a+b, 0) / 14;
        let smoothedMinusDM = minusDM.slice(-14).reduce((a,b) => a+b, 0) / 14;
        let plusDI = (smoothedPlusDM / atr) * 100;
        let minusDI = (smoothedMinusDM / atr) * 100;
        let dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
        if(dx > 25 && plusDI > minusDI) return {signal:"CALL", confidence: 89, strength: "قوية", reason: `ADX ${dx.toFixed(0)} - اتجاه صاعد قوي`};
        if(dx > 25 && minusDI > plusDI) return {signal:"PUT", confidence: 89, strength: "قوية", reason: `ADX ${dx.toFixed(0)} - اتجاه هابط قوي`};
        return null;
    }
    strategy_Swing_ADX_Trend._name = "Swing_ADX";
    strategy_Swing_ADX_Trend.category = "swing";

    // ----- استراتيجيات التداول طويل الأمد (position) -----
    
    function strategy_Position_Monthly_Trend(candles) {
        if(candles.length < 100) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma100 = closes.slice(-100).reduce((a,b) => a+b, 0) / 100;
        let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
        let current = closes[closes.length-1];
        if(current > ma50 && ma50 > ma100 && ma100 > ma200) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ترتيب إيجابي للمتوسطات - اتجاه صاعد طويل المدى"};
        }
        if(current < ma50 && ma50 < ma100 && ma100 < ma200) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "ترتيب سلبي للمتوسطات - اتجاه هابط طويل المدى"};
        }
        return null;
    }
    strategy_Position_Monthly_Trend._name = "Position_Trend";
    strategy_Position_Monthly_Trend.category = "position";

    function strategy_Position_Accumulation_Distribution(candles) {
        if(candles.length < 50) return null;
        let adl = 0;
        for(let i = 0; i < candles.length; i++) {
            let c = candles[i];
            let mfm = ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low);
            let mfv = mfm * (c.volume || 1000);
            adl += mfv;
        }
        let closes = candles.map(c => c.close);
        let adlSlope = adl - (candles.slice(0, -20).reduce((sum, c) => sum + ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low) * (c.volume || 1000), 0));
        if(adlSlope > 0 && closes[closes.length-1] > closes[closes.length-11]) {
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "تراكم مستمر - توزيع إيجابي"};
        }
        if(adlSlope < 0 && closes[closes.length-1] < closes[closes.length-11]) {
            return {signal:"PUT", confidence: 88, strength: "قوية", reason: "توزيع مستمر - ضغط بيعي"};
        }
        return null;
    }
    strategy_Position_Accumulation_Distribution._name = "Position_ADL";
    strategy_Position_Accumulation_Distribution.category = "position";

    function strategy_Position_Monthly_Pivot(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let monthlyHigh = Math.max(...highs.slice(-30));
        let monthlyLow = Math.min(...lows.slice(-30));
        let pivot = (monthlyHigh + monthlyLow + closes[closes.length-1]) / 3;
        let current = closes[closes.length-1];
        if(current > pivot && current > closes[closes.length-6]) {
            return {signal:"CALL", confidence: 87, strength: "قوية", reason: "السعر فوق البيفوت الشهري - صعود متوقع"};
        }
        if(current < pivot && current < closes[closes.length-6]) {
            return {signal:"PUT", confidence: 87, strength: "قوية", reason: "السعر تحت البيفوت الشهري - هبوط متوقع"};
        }
        return null;
    }
    strategy_Position_Monthly_Pivot._name = "Position_Pivot";
    strategy_Position_Monthly_Pivot.category = "position";

    function strategy_Position_Volume_Accumulation(candles) {
        if(candles.length < 30) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let closes = candles.map(c => c.close);
        let avgVol = volumes.slice(-30).reduce((a,b) => a+b, 0) / 30;
        let recentVol = volumes.slice(-5).reduce((a,b) => a+b, 0) / 5;
        let priceChange = (closes[closes.length-1] - closes[closes.length-6]) / closes[closes.length-6];
        if(recentVol > avgVol * 1.3 && priceChange > 0.002) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "حجم تداول مرتفع مع صعود - تراكم مؤسسي"};
        }
        if(recentVol > avgVol * 1.3 && priceChange < -0.002) {
            return {signal:"PUT", confidence: 89, strength: "قوية", reason: "حجم تداول مرتفع مع هبوط - توزيع مؤسسي"};
        }
        return null;
    }
    strategy_Position_Volume_Accumulation._name = "Position_Volume";
    strategy_Position_Volume_Accumulation.category = "position";

    function strategy_Position_RSI_Extreme(candles) {
        if(candles.length < 30) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-25; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        if(rsi < 20) return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - منطقة تشبع بيعي شديد - فرصة شراء طويلة المدى`};
        if(rsi > 80) return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - منطقة تشبع شرائي شديد - فرصة بيع طويلة المدى`};
        return null;
    }
    strategy_Position_RSI_Extreme._name = "Position_RSI";
    strategy_Position_RSI_Extreme.category = "position";

    // ----- استراتيجيات إضافية متعددة الاستخدامات -----
    
    function strategy_Multi_PinBar(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let upperShadow = last.high - Math.max(last.close, last.open);
        let lowerShadow = Math.min(last.close, last.open) - last.low;
        if(lowerShadow > body * 2 && upperShadow < body * 0.5) {
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "نمط Pin Bar صاعد - ظل سفلي طويل"};
        }
        if(upperShadow > body * 2 && lowerShadow < body * 0.5) {
            return {signal:"PUT", confidence: 88, strength: "قوية", reason: "نمط Pin Bar هابط - ظل علوي طويل"};
        }
        return null;
    }
    strategy_Multi_PinBar._name = "Multi_PinBar";
    strategy_Multi_PinBar.category = "all";

    function strategy_Multi_Doji_Reversal(candles) {
        if(candles.length < 3) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(last.close - last.open);
        let prevBody = Math.abs(prev.close - prev.open);
        if(body < (prev.high - prev.low) * 0.1 && prevBody > (prev.high - prev.low) * 0.6) {
            if(last.close > prev.close) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - احتمال انعكاس صاعد"};
            if(last.close < prev.close) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - احتمال انعكاس هابط"};
        }
        return null;
    }
    strategy_Multi_Doji_Reversal._name = "Multi_Doji";
    strategy_Multi_Doji_Reversal.category = "all";

    function strategy_Multi_MorningStar(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if(c1.close < c1.open && Math.abs(c1.close - c1.open) > (c1.high - c1.low) * 0.6 &&
           Math.abs(c2.close - c2.open) < (c2.high - c2.low) * 0.3 &&
           c3.close > c3.open && c3.close > (c1.high + c1.low) / 2) {
            return {signal:"CALL", confidence: 91, strength: "قوية جدا", reason: "نمط نجمة الصباح - انعكاس صاعد قوي"};
        }
        return null;
    }
    strategy_Multi_MorningStar._name = "Multi_MorningStar";
    strategy_Multi_MorningStar.category = "all";

    function strategy_Multi_EveningStar(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if(c1.close > c1.open && Math.abs(c1.close - c1.open) > (c1.high - c1.low) * 0.6 &&
           Math.abs(c2.close - c2.open) < (c2.high - c2.low) * 0.3 &&
           c3.close < c3.open && c3.close < (c1.high + c1.low) / 2) {
            return {signal:"PUT", confidence: 91, strength: "قوية جدا", reason: "نمط نجمة المساء - انعكاس هابط قوي"};
        }
        return null;
    }
    strategy_Multi_EveningStar._name = "Multi_EveningStar";
    strategy_Multi_EveningStar.category = "all";

    function strategy_Multi_Hammer(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let lowerShadow = Math.min(last.close, last.open) - last.low;
        let upperShadow = last.high - Math.max(last.close, last.open);
        if(lowerShadow > body * 2 && upperShadow < body * 0.3 && last.close > last.open) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "نمط المطرقة - انعكاس صاعد"};
        }
        return null;
    }
    strategy_Multi_Hammer._name = "Multi_Hammer";
    strategy_Multi_Hammer.category = "all";

    function strategy_Multi_ShootingStar(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let upperShadow = last.high - Math.max(last.close, last.open);
        let lowerShadow = Math.min(last.close, last.open) - last.low;
        if(upperShadow > body * 2 && lowerShadow < body * 0.3 && last.close < last.open) {
            return {signal:"PUT", confidence: 89, strength: "قوية", reason: "نمط الشهاب - انعكاس هابط"};
        }
        return null;
    }
    strategy_Multi_ShootingStar._name = "Multi_ShootingStar";
    strategy_Multi_ShootingStar.category = "all";

    // تجميع جميع الاستراتيجيات
    const STRATEGIES = [
        // scalp_ultra (6 استراتيجيات)
        strategy_UltraScalp_RSI, strategy_UltraScalp_Momentum, strategy_UltraScalp_PriceAction,
        strategy_UltraScalp_Stochastic, strategy_UltraScalp_Bollinger_Bandit, strategy_UltraScalp_Volume_Burst,
        // scalp_fast (5 استراتيجيات)
        strategy_FastScalp_RSI_MACD, strategy_FastScalp_CCI_Reversal, strategy_FastScalp_Williams,
        strategy_FastScalp_Engulfing, strategy_FastScalp_MACD_Cross,
        // intraday (5 استراتيجيات)
        strategy_Intraday_RSI_Divergence, strategy_Intraday_MACD_Divergence, strategy_Intraday_Support_Resistance_Break,
        strategy_Intraday_Bollinger_Squeeze, strategy_Intraday_MovingAverage_Crossover,
        // swing (5 استراتيجيات)
        strategy_Swing_Fibonacci_Retracement, strategy_Swing_OrderBlock, strategy_Swing_DemandSupply,
        strategy_Swing_Ichimoku, strategy_Swing_ADX_Trend,
        // position (5 استراتيجيات)
        strategy_Position_Monthly_Trend, strategy_Position_Accumulation_Distribution, strategy_Position_Monthly_Pivot,
        strategy_Position_Volume_Accumulation, strategy_Position_RSI_Extreme,
        // استراتيجيات متعددة الاستخدامات (5 استراتيجيات)
        strategy_Multi_PinBar, strategy_Multi_Doji_Reversal, strategy_Multi_MorningStar,
        strategy_Multi_EveningStar, strategy_Multi_Hammer, strategy_Multi_ShootingStar
    ];

    // تصنيف الاستراتيجيات حسب نوع التداول
    const TIMEFRAME_STRATEGY_MAP = {
        scalp_ultra: STRATEGIES.filter(s => s.category === "scalp_ultra" || s.category === "all").map(s => s._name),
        scalp_fast: STRATEGIES.filter(s => s.category === "scalp_fast" || s.category === "all").map(s => s._name),
        intraday: STRATEGIES.filter(s => s.category === "intraday" || s.category === "all").map(s => s._name),
        swing: STRATEGIES.filter(s => s.category === "swing" || s.category === "all").map(s => s._name),
        position: STRATEGIES.filter(s => s.category === "position" || s.category === "all").map(s => s._name)
    };

    function getActiveStrategies() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) {
            return STRATEGIES;
        }
        let tfConfig = TIMEFRAMES[selectedTimeframe];
        let category = tfConfig.category;
        let activeNames = TIMEFRAME_STRATEGY_MAP[category] || TIMEFRAME_STRATEGY_MAP["intraday"];
        return STRATEGIES.filter(s => activeNames.includes(s._name));
    }

    function calculateWaitTime() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return 60000;
        let config = TIMEFRAMES[selectedTimeframe];
        return Math.min(Math.max(config.waitSeconds * 1000, 10000), 3600000);
    }

    // ========== إدارة الصفقات ==========
    function resetDailyTrades() {
        let today = new Date().toDateString();
        if(today !== lastTradeDate) {
            dailyTradesCount = 0;
            lastTradeDate = today;
        }
    }

    function canOpenTrade() {
        resetDailyTrades();
        return dailyTradesCount < SETTINGS.maxTradesPerDay;
    }

    function openTrade(signal, price, confidence, reason) {
        if(!canOpenTrade()) {
            showNotification("⚠️ تم الوصول للحد الأقصى للصفقات اليومية", "#ffaa66");
            return false;
        }
        
        let optimalEntry = getOptimalEntry(price, signal);
        let optimalTP = getOptimalTP(optimalEntry, signal);
        let optimalSL = getOptimalSL(optimalEntry, signal);
        
        currentTrade = {
            id: Date.now(),
            direction: signal,
            entryPrice: optimalEntry,
            originalPrice: price,
            confidence: confidence,
            reason: reason,
            openTime: new Date(),
            takeProfit: optimalTP,
            stopLoss: optimalSL,
            status: "open"
        };
        
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
            profit = currentTrade.direction === "CALL" ? 
                (exitPrice - currentTrade.entryPrice) * 10000 : 
                (currentTrade.entryPrice - exitPrice) * 10000;
        } else {
            profit = currentTrade.direction === "CALL" ? 
                (currentTrade.stopLoss - currentTrade.entryPrice) * 10000 : 
                (currentTrade.entryPrice - currentTrade.stopLoss) * 10000;
            profit = -profit;
        }
        currentTrade.profit = profit;
        
        tradesHistory.unshift(currentTrade);
        if(tradesHistory.length > 30) tradesHistory.pop();
        
        showTradeNotification(result === "win" ? "✅ ربح" : "❌ خسارة", currentTrade);
        updateTradesDisplay();
        
        currentTrade = null;
    }

    function checkTradeExit(exitPrice) {
        if(!currentTrade || currentTrade.status !== "open") return;
        
        if(currentTrade.direction === "CALL") {
            if(exitPrice >= currentTrade.takeProfit) {
                closeTrade(exitPrice, "win");
            } else if(exitPrice <= currentTrade.stopLoss) {
                closeTrade(exitPrice, "loss");
            }
        } else {
            if(exitPrice <= currentTrade.takeProfit) {
                closeTrade(exitPrice, "win");
            } else if(exitPrice >= currentTrade.stopLoss) {
                closeTrade(exitPrice, "loss");
            }
        }
    }

    function updateTradesDisplay() {
        let container = document.getElementById('trades-container');
        if(!container) return;
        
        let winRate = tradesHistory.length > 0 ? 
            (tradesHistory.filter(t => t.result === "win").length / tradesHistory.length * 100).toFixed(1) : 0;
        
        let totalProfit = tradesHistory.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        let html = `<div style="background:#00000066;border-radius:12px;padding:10px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span style="color:#ffd966;font-size:11px;">📊 الصفقات اليوم: ${dailyTradesCount}/${SETTINGS.maxTradesPerDay}</span>
                <span style="color:#ffd966;font-size:11px;">🎯 TP:${SETTINGS.takeProfitPips} | 🛑 SL:${SETTINGS.stopLossPips}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:10px;">
                <span style="color:#88ccff;">نسبة الربح: ${winRate}%</span>
                <span style="color:${totalProfit >= 0 ? '#00ffaa' : '#ff4466'};">الربح الإجمالي: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(1)} نقطة</span>
            </div>`;
        
        if(currentTrade) {
            let currentProfit = currentTrade.direction === "CALL" ? 
                (currentPrice - currentTrade.entryPrice) * 10000 : 
                (currentTrade.entryPrice - currentPrice) * 10000;
            let profitColor = currentProfit >= 0 ? "#00ffaa" : "#ff4466";
            
            html += `<div style="background:rgba(0,255,170,0.1);border-radius:12px;padding:10px;margin-bottom:10px;border-right:3px solid ${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"}">
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#fff;font-size:12px;font-weight:bold;">🔓 صفقة مفتوحة</span>
                    <span style="color:${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"};font-size:12px;font-weight:bold;">${currentTrade.direction === "CALL" ? "شراء CALL" : "بيع PUT"}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:5px;">
                    <span>الدخول: ${currentTrade.entryPrice.toFixed(5)}</span>
                    <span style="color:${profitColor};">الربح الحالي: ${currentProfit > 0 ? '+' : ''}${currentProfit.toFixed(1)}</span>
                </div>
                <div style="font-size:9px;color:#aaa;margin-top:3px;">🎯 TP: ${currentTrade.takeProfit.toFixed(5)} | 🛑 SL: ${currentTrade.stopLoss.toFixed(5)}</div>
            </div>`;
        }
        
        if(tradesHistory.length > 0) {
            html += `<div style="max-height:160px;overflow-y:auto;">
                <div style="font-size:10px;color:#888;margin-bottom:5px;">📋 آخر الصفقات:</div>`;
            for(let trade of tradesHistory.slice(0,6)) {
                let resultColor = trade.result === "win" ? "#00ffaa" : "#ff4466";
                html += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #333;font-size:10px;">
                    <span style="color:${resultColor}">${trade.result === "win" ? "✓" : "✗"}</span>
                    <span>${trade.direction === "CALL" ? "شراء" : "بيع"}</span>
                    <span style="color:${trade.profit >= 0 ? "#00ffaa" : "#ff4466"}">${trade.profit > 0 ? "+" : ""}${trade.profit?.toFixed(1) || 0}</span>
                    <span style="color:#888;">${new Date(trade.openTime).toLocaleTimeString()}</span>
                </div>`;
            }
            html += `</div>`;
        }
        
        html += `</div>`;
        container.innerHTML = html;
    }

    function showTradeNotification(title, trade) {
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;bottom:20px;left:20px;z-index:9999992;
            background:linear-gradient(135deg,#000000cc,#0a0a1acc);backdrop-filter:blur(10px);
            border-radius:15px;padding:12px 20px;border-left:4px solid ${title === "✅ ربح" ? "#00ffaa" : title === "❌ خسارة" ? "#ff4466" : "#ffd966"};
            animation:fadeIn 0.3s ease-out;font-size:12px;max-width:280px;`;
        div.innerHTML = `<div style="font-weight:bold;color:#ffd966;">${title}</div>
            <div>${trade.direction === "CALL" ? "شراء" : "بيع"} | دخول: ${trade.entryPrice.toFixed(5)}</div>
            <div>🎯 TP: ${trade.takeProfit.toFixed(5)} | 🛑 SL: ${trade.stopLoss.toFixed(5)}</div>
            <div style="font-size:9px;color:#88ccff;">✨ تحليل يعمل على شارت المفتوح ✨</div>`;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 4500);
    }

    function showNotification(message, color) {
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999992;
            background:#000000cc;backdrop-filter:blur(10px);border-radius:15px;padding:12px 20px;border-right:3px solid ${color};
            animation:fadeIn 0.3s ease-out;font-size:13px;color:#fff;font-weight:bold;`;
        div.innerHTML = message;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 3000);
    }

    // ========== التحليل ==========
    function analyzeChart() {
        let candles = getChartData();
        if(candles.length < 10) return{signal:"NEUTRAL",confidence:0,strength:"",reason:"بيانات غير كافية"};
        
        let active = getActiveStrategies();
        let signals = [];
        for(let s of active){
            try{
                let r = s(candles);
                if(r && r.signal !== "NEUTRAL" && r.confidence >= SETTINGS.minConfidence) {
                    signals.push(r);
                }
            } catch(e) {}
        }
        
        let tot = signals.length;
        if(tot === 0) return{signal:"NEUTRAL",confidence:0,strength:"",reason:"لا توجد إشارات"};
        
        let callWeight = signals.filter(s=>s.signal==="CALL").reduce((sum,s)=>sum + s.confidence, 0);
        let putWeight = signals.filter(s=>s.signal==="PUT").reduce((sum,s)=>sum + s.confidence, 0);
        let totalWeight = callWeight + putWeight;
        
        let callPercent = totalWeight > 0 ? (callWeight / totalWeight) * 100 : 0;
        let putPercent = totalWeight > 0 ? (putWeight / totalWeight) * 100 : 0;
        
        let tfWeight = TIMEFRAMES[selectedTimeframe]?.weight || 0.85;
        
        let finalCallConfidence = callPercent * tfWeight;
        let finalPutConfidence = putPercent * tfWeight;
        
        if(finalCallConfidence > finalPutConfidence && finalCallConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="CALL").sort((a,b)=>b.confidence - a.confidence)[0];
            return{signal:"CALL",confidence:Math.min(finalCallConfidence, 98),strength:best?.strength||"قوية",reason:best?.reason || `${signals.filter(s=>s.signal==="CALL").length}/${tot} استراتيجية للصعود`};
        }
        if(finalPutConfidence > finalCallConfidence && finalPutConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="PUT").sort((a,b)=>b.confidence - a.confidence)[0];
            return{signal:"PUT",confidence:Math.min(finalPutConfidence, 98),strength:best?.strength||"قوية",reason:best?.reason || `${signals.filter(s=>s.signal==="PUT").length}/${tot} استراتيجية للهبوط`};
        }
        return{signal:"NEUTRAL",confidence:0,strength:"",reason:"ثقة منخفضة"};
    }

    // ========== عرض الإشارة ==========
    function showSignal(direction, strength, confidence, reason) {
        let entryPrice = currentPrice > 0 ? currentPrice : 1.10000;
        let optimalEntry = getOptimalEntry(entryPrice, direction);
        let optimalTP = getOptimalTP(optimalEntry, direction);
        let optimalSL = getOptimalSL(optimalEntry, direction);
        
        let isCall = direction === "CALL";
        let mc = isCall ? "#00ffaa" : "#ff4466";
        let icon = isCall ? "إشارة : 🟢" : "إشارة : 🔴";
        let title = isCall ? "شراء CALL" : "بيع PUT";
        let tf = TIMEFRAMES[selectedTimeframe] || {name: currentTimeframeAuto || "غير معروف"};
        
        if(canOpenTrade()) {
            openTrade(direction, entryPrice, confidence, reason);
        }
        
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999991;
            background:rgba(0,0,0,0.6);backdrop-filter:blur(15px);
            border-radius:40px;padding:25px 45px;border:2px solid ${mc};box-shadow:0 0 50px ${mc};
            text-align:center;pointer-events:none;animation:fadeIn 0.3s ease-out;max-width:90%;width:500px;`;
        div.innerHTML = `
            <div style="position:absolute;top:-12px;right:-12px;background:${mc};border-radius:30px;padding:4px 10px;font-size:12px;font-weight:bold;color:#000;">${confidence.toFixed(0)}%</div>
            <div style="font-size:26px;">${icon}</div>
            <div style="font-size:26px;font-weight:bold;color:${mc};margin:12px 0;">${title}</div>
            <div style="font-size:17px;color:#ffd966;margin-bottom:13px;">${isCall?"صعود متوقع 🚀":"هبوط متوقع 💥"}</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:15px;">
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:10px;">الفريم</span><br>
                    <span style="color:${mc};font-size:13px;">${tf.name || currentTimeframeAuto}</span>
                </div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:10px;">القوة</span><br>
                    <span style="color:#ffaa66;font-size:13px;">${strength}</span>
                </div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:10px;">السعر الحالي</span><br>
                    <span style="color:${mc};font-size:13px;">${entryPrice.toFixed(5)}</span>
                </div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:10px;">نقطة الدخول</span><br>
                    <span style="color:#00ffaa;font-size:13px;">${optimalEntry.toFixed(5)}</span>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:15px;">
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:9px;">🎯 جني ربح</span><br>
                    <span style="color:#00ffaa;font-size:11px;">${optimalTP.toFixed(5)}</span>
                </div>
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:9px;">🛑 وقف خسارة</span><br>
                    <span style="color:#ff4466;font-size:11px;">${optimalSL.toFixed(5)}</span>
                </div>
            </div>
            <div style="background:rgba(0,0,0,0.5);border-radius:25px;padding:10px 20px;max-width:400px;">
                <div style="font-size:12px;color:#fff;">${reason}</div>
            </div>
            <div style="margin-top:15px;font-size:9px;color:${mc};">تحليل يعمل على مناطق طلب/عرض | ${getActiveStrategies().length} استراتيجية نشطة | TP:${SETTINGS.takeProfitPips}</div>`;
        
        let style = document.createElement('style');
        style.textContent = `@keyframes fadeIn{0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
        document.head.appendChild(style);
        document.body.appendChild(div);
        setTimeout(()=>{div.remove();style.remove();}, SETTINGS.signalDuration);
    }

    function showSearchingStatus() {
        if(searchStatusDiv) return;
        searchStatusDiv = document.createElement('div');
        searchStatusDiv.id = 'search-status';
        searchStatusDiv.style.cssText = `position:fixed;bottom:100px;right:20px;background:#ff0000aa;
            backdrop-filter:blur(10px);padding:8px 16px;border-radius:30px;z-index:999991;
            direction:rtl;font-size:12px;color:#fff;font-weight:bold;animation:pulse 1s infinite;`;
        searchStatusDiv.innerHTML = `🔍 جاري البحث عن صفقات اترك شارت مفتوح ...`;
        document.body.appendChild(searchStatusDiv);
    }

    function hideSearchingStatus() {
        if(searchStatusDiv){searchStatusDiv.remove();searchStatusDiv=null;}
    }

    function analysisLoop() {
        if(!botRunning) return;
        let now=Date.now();
        if(now-lastSignalTime<calculateWaitTime()) return;
        
        let a=analyzeChart();
        if(a.signal!=="NEUTRAL" && a.confidence>=SETTINGS.minConfidence){
            hideSearchingStatus();
            showSignal(a.signal,a.strength,a.confidence,a.reason);
            lastSignalTime=now;
            updateLastSignal(a);
        } else {
            if(!searchStatusDiv && botRunning) showSearchingStatus();
            updateLastSignal({signal:"NEUTRAL",reason:"جاري التحليل...",confidence:0});
        }
        updateTradesDisplay();
        detectSupplyDemandZones();
    }

    function updateLastSignal(a) {
        let d=document.getElementById('last-signal');
        if(d){
            let color=a.signal==="CALL"?"#00ffaa":a.signal==="PUT"?"#ff4466":"#ffd966";
            let text=a.signal==="CALL"?"شراء":a.signal==="PUT"?"بيع":"تحليل";
            d.innerHTML=`<div style="background:rgba(0,0,0,0.5);border-radius:12px;padding:10px;border-right:3px solid ${color};">
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:${color};font-weight:bold;">${text}</span>
                    <span style="color:#ffd966;">${a.confidence>0?a.confidence.toFixed(0)+'%':''}</span>
                </div>
                <div style="font-size:10px;color:#aaa;margin-top:3px;">${(a.reason||'...').substring(0,40)}</div>
            </div>`;
        }
    }

    // ========== واجهة المستخدم ==========
    function createUI() {
        let ex=document.getElementById('obeida-ui'); if(ex) ex.remove();
        
        let style = document.createElement('style');
        style.textContent = `
            @keyframes pulse { 0% { opacity: 0.7; } 100% { opacity: 1; } }
            @keyframes glow { 0% { box-shadow: 0 0 5px rgba(0,255,170,0.3); } 100% { box-shadow: 0 0 20px rgba(0,255,170,0.6); } }
            .btn-hover { transition: all 0.2s ease; cursor: pointer; }
            .btn-hover:hover { transform: scale(1.02); filter: brightness(1.05); }
        `;
        document.head.appendChild(style);
        
        let ui=document.createElement('div');
        ui.id='obeida-ui';
        ui.style.cssText = `position:fixed;bottom:20px;right:20px;width:380px;max-width:calc(100% - 25px);max-height:90vh;overflow-y:auto;
            background:linear-gradient(145deg,#0a0f1e,#020408);border-radius:28px;
            border:1px solid rgba(255,217,102,0.3);z-index:999990;direction:rtl;
            font-family:'Tahoma','Segoe UI',monospace;box-shadow:0 10px 30px rgba(0,0,0,0.6);
            backdrop-filter:blur(8px);`;
        
        ui.innerHTML=`
            <div style="background:linear-gradient(135deg,#ffd96622,#00000033);padding:14px 18px;border-bottom:1px solid #ffd96655;border-radius:28px 28px 0 0;cursor:move;" id="ui-header">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:15px;">🔥</span>
                        <div>
                            <h3 style="color:#ffd966;margin:0;font-size:15px;font-weight:bold;">Obeida Trading BOT V2</h3>
                            <div style="font-size:9px;color:#88ccff;">${STRATEGIES.length}+ استراتيجية | شارت حقيقي</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="minimize-btn" style="background:#ffd96622;border:none;color:#ffd966;cursor:pointer;font-size:14px;width:28px;height:28px;border-radius:50%;">−</button>
                        <button id="close-ui-btn" style="background:#ff446622;border:none;color:#ff8888;cursor:pointer;font-size:14px;width:28px;height:28px;border-radius:50%;">✕</button>
                    </div>
                </div>
            </div>
            <div id="ui-main-content" style="padding:15px;">
                <div style="background:linear-gradient(135deg,#00ffaa11,#00000044);border-radius:20px;padding:12px;text-align:center;margin-bottom:12px;border:1px solid #00ffaa33;">
                    <div style="font-size:9px;color:#aaa;">💰 السعر الحالي</div>
                    <div style="display:flex;justify-content:center;align-items:baseline;gap:12px;margin-top:5px;">
                        <span id="current-price-display" style="font-size:22px;color:#00ffaa;font-weight:bold;">0.00000</span>
                        <span id="price-diff-display" style="font-size:13px;font-weight:bold;">● 0</span>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                    <div style="background:#00000055;border-radius:18px;padding:10px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">💰 العملة</div>
                        <div id="current-asset-display" style="font-size:13px;color:#00d4ff;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:#00000055;border-radius:18px;padding:10px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">⏱️ الفريم</div>
                        <div id="st-tf-value" style="font-size:13px;color:#ff9800;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                    <div style="background:#00000055;border-radius:18px;padding:10px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">🏦 الحساب</div>
                        <div id="current-account-display" style="font-size:13px;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:#00000055;border-radius:18px;padding:10px;text-align:center;">
                        <div style="font-size:9px;color:#aaa;">📊 فيبوناتشي</div>
                        <div style="font-size:11px;color:#00ffaa;" id="fib-status">✅ مفعل</div>
                    </div>
                </div>
                
                <div id="current-timeframe-display" style="background:#00000055;border-radius:16px;padding:8px;text-align:center;font-size:10px;margin-bottom:12px;"></div>
                
                <div id="supply-demand-levels"></div>
                <div id="fib-levels"></div>
                
                <div style="display:flex;gap:12px;margin-bottom:12px;">
                    <button id="start-btn" class="btn-hover" style="flex:1;padding:12px;background:linear-gradient(95deg,#00aa44,#008833);border:none;border-radius:30px;color:#fff;font-weight:bold;font-size:14px;">▶ بدء التداول</button>
                    <button id="stop-btn" class="btn-hover" style="flex:1;padding:12px;background:linear-gradient(95deg,#aa3333,#882222);border:none;border-radius:30px;color:#fff;display:none;font-weight:bold;font-size:14px;">⏹ إيقاف التداول</button>
                </div>
                
                <div id="status-text" style="background:#00000066;border-radius:16px;padding:10px;text-align:center;font-size:12px;color:#ffd966;margin-bottom:12px;">🔴 التداول متوقف</div>
                
                <div id="last-signal" style="background:rgba(0,0,0,0.4);border-radius:16px;padding:10px;margin-bottom:12px;"></div>
                
                <div id="trades-container"></div>
                
                <div style="display:flex;gap:10px;margin-top:12px;">
                    <button id="settings-btn" class="btn-hover" style="flex:1;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;font-size:11px;">⚙️ الإعدادات</button>
                    <button id="telegram-btn" class="btn-hover" style="flex:1;padding:8px;background:linear-gradient(95deg,#0088cc,#006699);border:none;border-radius:20px;color:#fff;font-size:11px;">📢 تليجرام</button>
                    <button id="fib-toggle" class="btn-hover" style="flex:1;padding:8px;background:#4a6a2a;border:none;border-radius:20px;color:#fff;font-size:11px;">📊 فيبوناتشي</button>
                </div>
                
                <div style="font-size:7px;color:#ffd96688;text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid #ffffff11;">
                    ⚡  تحليل حقيقي كامل | ${STRATEGIES.length} استراتيجية  ⚡
                </div>
            </div>`;
        
        document.body.appendChild(ui);
        
        // سحب الواجهة
        let isDragging = false;
        let dragStartX, dragStartY, uiStartX, uiStartY;
        const header = document.getElementById('ui-header');
        if(header) {
            header.addEventListener('mousedown', (e) => {
                if(e.target.tagName === 'BUTTON') return;
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                const rect = ui.getBoundingClientRect();
                uiStartX = rect.left;
                uiStartY = rect.top;
                ui.style.transition = 'none';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if(!isDragging) return;
                let newLeft = uiStartX + (e.clientX - dragStartX);
                let newTop = uiStartY + (e.clientY - dragStartY);
                newLeft = Math.max(5, Math.min(window.innerWidth - ui.offsetWidth - 5, newLeft));
                newTop = Math.max(5, Math.min(window.innerHeight - ui.offsetHeight - 5, newTop));
                ui.style.left = newLeft + 'px';
                ui.style.top = newTop + 'px';
                ui.style.right = 'auto';
                ui.style.bottom = 'auto';
            });
            document.addEventListener('mouseup', () => {
                isDragging = false;
                ui.style.transition = '';
            });
        }
        
        const minimizeBtn = document.getElementById('minimize-btn');
        const closeBtn = document.getElementById('close-ui-btn');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const telegramBtn = document.getElementById('telegram-btn');
        const fibToggle = document.getElementById('fib-toggle');
        const mainContent = document.getElementById('ui-main-content');
        
        let isMinimized = false;
        if(minimizeBtn) minimizeBtn.onclick = () => {
            isMinimized = !isMinimized;
            if(mainContent) mainContent.style.display = isMinimized ? 'none' : 'block';
            minimizeBtn.innerHTML = isMinimized ? '+' : '−';
            ui.style.width = isMinimized ? 'auto' : '380px';
        };
        
        if(closeBtn) closeBtn.onclick = () => {
            if(botRunning) stopAnalysis();
            ui.remove();
        };
        
        if(startBtn) startBtn.onclick = startAnalysis;
        if(stopBtn) stopBtn.onclick = stopAnalysis;
        if(telegramBtn) telegramBtn.onclick = () => window.open('https://t.me/ObeidaTrading', '_blank');
        if(settingsBtn) settingsBtn.onclick = showSettingsModal;
        if(fibToggle) fibToggle.onclick = () => {
            SETTINGS.useFibonacciLevels = !SETTINGS.useFibonacciLevels;
            fibToggle.style.background = SETTINGS.useFibonacciLevels ? "#4a6a2a" : "#4a2a2a";
            const fibStatus = document.getElementById('fib-status');
            if(fibStatus) fibStatus.innerHTML = SETTINGS.useFibonacciLevels ? '✅ مفعل' : '❌ معطل';
            showNotification(SETTINGS.useFibonacciLevels ? "✅ تم تفعيل فيبوناتشي" : "❌ تم تعطيل فيبوناتشي", "#ffd966");
            updateFibonacciDisplay();
        };
        
        updateTradesDisplay();
        updateSupplyDemandDisplay();
        updateFibonacciDisplay();
    }

    function showSettingsModal() {
        let modal=document.createElement('div');
        modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000001;display:flex;justify-content:center;align-items:center;`;
        modal.innerHTML=`
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:30px;border-radius:30px;border:2px solid #ffd966;width:340px;">
                <h3 style="color:#ffd966;text-align:center;margin-bottom:20px;">⚙️ إعدادات البوت V7</h3>
                <div style="margin-bottom:15px;">
                    <label style="color:#fff;font-size:12px;">🎯 جني الربح (نقطة):</label>
                    <input type="number" id="tp-setting" value="${SETTINGS.takeProfitPips}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="color:#fff;font-size:12px;">🛑 وقف الخسارة (نقطة):</label>
                    <input type="number" id="sl-setting" value="${SETTINGS.stopLossPips}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="color:#fff;font-size:12px;">📊 الحد الأقصى للصفقات اليومية:</label>
                    <input type="number" id="max-trades" value="${SETTINGS.maxTradesPerDay}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="color:#fff;font-size:12px;">🎯 الحد الأدنى للثقة (%):</label>
                    <input type="number" id="min-conf" value="${SETTINGS.minConfidence}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;">
                </div>
                <button id="save-settings" class="btn-hover" style="width:100%;padding:10px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:20px;color:#000;cursor:pointer;font-weight:bold;">حفظ الإعدادات</button>
                <button id="close-settings" class="btn-hover" style="width:100%;margin-top:10px;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;cursor:pointer;">إغلاق</button>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('save-settings').onclick=()=>{
            SETTINGS.takeProfitPips=parseInt(document.getElementById('tp-setting').value) || 50;
            SETTINGS.stopLossPips=parseInt(document.getElementById('sl-setting').value) || 25;
            SETTINGS.maxTradesPerDay=parseInt(document.getElementById('max-trades').value) || 10;
            SETTINGS.minConfidence=parseInt(document.getElementById('min-conf').value) || 75;
            modal.remove();
            updateTradesDisplay();
            showNotification("✅ تم حفظ الإعدادات", "#00ffaa");
        };
        document.getElementById('close-settings').onclick=()=>modal.remove();
    }

    function showPasswordModal() {
        let modal=document.createElement('div');
        modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);
            z-index:1000000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(5px);`;
        modal.innerHTML=`
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:40px;border-radius:50px;border:2px solid #ffd966;text-align:center;width:340px;">
                <div style="font-size:25px;">🔥</div>
                <h2 style="color:#ffd966;margin:10px 0;">Obeida Trading BOT V2</h2>
                <p style="color:#88ccff;font-size:12px;"> تحليل حقيقي مربوط في سوق </p>
                <p style="color:#ffaa66;font-size:11px;">🔑 أدخل كلمة المرور للمتابعة</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور"
                    style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:30px;text-align:center;font-size:14px;">
                <button id="login-btn" class="btn-hover" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;">تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:20px;font-size:11px;">📢 للحصول على كلمة المرور: <span id="tg-link" style="color:#88ccff;cursor:pointer;">@ObeidaTrading</span></p>
                <div style="font-size:9px;color:#555;margin-top:15px;">⚡ تحليل حقيقي ⚡</div>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('login-btn').onclick=()=>{
            if(document.getElementById('pass-input').value===BOT_PASSWORD){
                isAuthenticated=true;
                modal.remove();
                createUI();
                initPriceRadar();
                initAssetDetection();
                initTimeframeDetection();
                initAccountDetection();
                updateFibonacciLevels();
                detectSupplyDemandZones();
            } else {
                alert("❌ كلمة المرور غير صحيحة ❌");
            }
        };
        document.getElementById('tg-link').onclick=()=>window.open('https://t.me/ObeidaTrading','_blank');
        document.getElementById('pass-input').addEventListener('keypress',e=>{if(e.key==='Enter') document.getElementById('login-btn').click();});
    }

    function startAnalysis() {
        if(!isAuthenticated){alert("🔐 الرجاء إدخال كلمة المرور");showPasswordModal();return;}
        if(!selectedTimeframe){
            showNotification("⚠️ الرجاء الانتظار حتى يتم اكتشاف الفريم تلقائياً", "#ffaa66");
            return;
        }
        if(botRunning) return;
        botRunning=true;
        botInterval=setInterval(analysisLoop,SETTINGS.checkInterval);
        document.getElementById('start-btn').style.display='none';
        document.getElementById('stop-btn').style.display='flex';
        document.getElementById('status-text').innerHTML=`🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${selectedTimeframe}`;
        showSearchingStatus();
    }

    function stopAnalysis() {
        if(!botRunning) return;
        clearInterval(botInterval); botRunning=false;
        document.getElementById('start-btn').style.display='flex';
        document.getElementById('stop-btn').style.display='none';
        document.getElementById('status-text').innerHTML='🔴 التداول متوقف';
        hideSearchingStatus();
    }

    console.log(`✨ Obeida Trading Bot v2 - ${STRATEGIES.length} استراتيجية محسّنة حسب نوع التداول ✨`);
    showPasswordModal();

    window.ObeidaPro = {
        start: startAnalysis,
        stop: stopAnalysis,
        status: ()=>botRunning?"يعمل":"متوقف",
        getCurrentPrice: ()=>currentPrice,
        getTimeframe: ()=>selectedTimeframe,
        getCurrentAsset: ()=>currentAsset,
        getAccountType: ()=>currentAccountType,
        getActiveStrategies: ()=>getActiveStrategies().map(s=>s._name),
        getActiveCount: ()=>getActiveStrategies().length,
        getFibonacciLevels: ()=>fibonacciLevels,
        getDemandZones: ()=>demandZones,
        getSupplyZones: ()=>supplyZones,
        version: "V2.0 ULTIMATE - Obeida Trading",
        strategies: STRATEGIES.length
    };

})();
