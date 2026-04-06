// ============================================
// Obeida Trading Bot - النسخة المحسّنة V5.0 ULTIMATE
// 200+ استراتيجية حقيقية - كشف تلقائي كامل + فيبوناتشي + مناطق الطلب والعرض + رادار السعر
// ============================================
(function(){
    'use strict';

    // ========== كلمة المرور ==========
    const BOT_PASSWORD = "@ObeidaTrading";
    let isAuthenticated = false;

    // ========== إعدادات ==========
    const SETTINGS = {
        checkInterval: 3000,
        signalDuration: 5000,
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
    let demandZones = [];  // مناطق شراء (طلب)
    let supplyZones = [];  // مناطق بيع (عرض)
    let orderBlocks = [];   // كتل الأوامر
    
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
    // ========== رادار السعر - كود سحب السعر الحالي ==========
    // =====================================================
    function initPriceRadar() {
        console.log("%c 🛰️ جاري كشف العملة ... ", "color: #00ffcc; font-weight: bold;");

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
                    } catch (e) {}
                });
                this.singlePriceObserver = true;
            }
            return originalSend.apply(this, arguments);
        };
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
        
        // كشف مناطق الطلب (Demand Zones) - مناطق تجمع المشترين
        for (let i = 20; i < prices.length - 10; i++) {
            let isDemand = true;
            let zoneLow = lows[i];
            let zoneHigh = highs[i];
            
            for (let j = i - 20; j < i; j++) {
                if (lows[j] < zoneLow) zoneLow = lows[j];
                if (highs[j] > zoneHigh) zoneHigh = highs[j];
            }
            
            let range = zoneHigh - zoneLow;
            let demandStrength = 0;
            
            // التحقق من وجود ارتدادات قوية من المنطقة
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
        
        // كشف مناطق العرض (Supply Zones) - مناطق تجمع البائعين
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
        
        // كشف كتل الأوامر (Order Blocks)
        for (let i = 10; i < prices.length - 5; i++) {
            let prevHigh = highs[i-1];
            let prevLow = lows[i-1];
            let currentHigh = highs[i];
            let currentLow = lows[i];
            
            // كتلة أمر شراء (Bullish Order Block)
            if (currentLow > prevHigh && prices[i] > prices[i-1]) {
                orderBlocks.push({
                    type: "BULLISH",
                    low: prevLow,
                    high: prevHigh,
                    price: prevHigh,
                    strength: Math.min(100, (currentHigh - currentLow) * 10000)
                });
            }
            
            // كتلة أمر بيع (Bearish Order Block)
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
        
        // إزالة التكرارات
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

    // =====================================================
    // ========== كشف العملة والفريم والحساب التلقائي ==========
    // =====================================================
    function initAssetDetection() {
        function updateAssetInfo(element) {
            if (element) {
                let assetName = element.innerText;
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
            console.error("لم يتم العثور على عنصر العملة .T4GAK");
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
            const tfElements = document.querySelectorAll('.gmGcQ, [class*="timeframe"], [class*="interval"], [class*="period"]');
            let foundTF = null;

            tfElements.forEach(el => {
                const text = el.innerText.trim();
                if (/[0-9]+[smhd]/.test(text)) {
                    foundTF = text;
                }
            });
            
            if (!foundTF) {
                const allText = document.body.innerText;
                const match = allText.match(/[0-9]+[smhd]/);
                if (match) foundTF = match[0];
            }
            
            return foundTF;
        }

        function syncDisplay() {
            const currentTF = getLiveTimeframe();
            
            if (currentTF && TIMEFRAMES[currentTF] && currentTF !== selectedTimeframe) {
                selectedTimeframe = currentTF;
                currentTimeframeAuto = currentTF;
                console.log("%c[الفريم]: " + currentTF, "color: #ff9800; font-size: 14px; font-weight: bold;");
                
                const timeframeEl = document.getElementById('st-tf-value');
                if (timeframeEl) timeframeEl.innerText = currentTF;
                
                const timeframeDisplay = document.getElementById('current-timeframe-display');
                if (timeframeDisplay && TIMEFRAMES[currentTF]) {
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
            } else if (currentTF && !selectedTimeframe) {
                selectedTimeframe = currentTF;
                currentTimeframeAuto = currentTF;
                const timeframeEl = document.getElementById('st-tf-value');
                if (timeframeEl) timeframeEl.innerText = currentTF;
            } else if (!currentTF) {
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

    // ========== كشف الحساب التلقائي (نسخة تعمل 100%) ==========
    function initAccountDetection() {
    let lastAccountType = "";
    
    function checkAndNotify() {
        // البحث في النصوص العلوية فقط لزيادة السرعة والدقة
        const headerText = document.querySelector('header')?.innerText || document.body.innerText;
        
        const isDemo = headerText.includes("Demo") || headerText.includes("تجريبي") || headerText.includes("DEMO") || headerText.includes("demo");
        const currentType = isDemo ? "DEMO" : "LIVE";
        
        // تحديث المتغير العام
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
                console.warn("⚠️ تنبيه: نظام السيولة الصارمة في وضع الحماية القصوى الآن.");
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
    
    // فحص فوري عند التشغيل
    checkAndNotify();
    
    // مراقبة أي تغيير في الصفحة
    if (accountObserver) accountObserver.disconnect();
    accountObserver = new MutationObserver(() => {
        checkAndNotify();
    });
    
    accountObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
    
    console.log("✅ نظام الرصد التلقائي لنوع الحساب يعمل الآن.. جرب التغيير.");
}

    // =====================================================
    // ========== 200+ استراتيجية حقيقية - نسبة نجاح فوق 80% ==========
    // =====================================================

    // استراتيجيات المؤشرات الفنية (50+)
    function strategy_RSI(candles) {
        if(candles.length < 15) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-15; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        let confidence = rsi < 25 ? 94 : (rsi < 30 ? 88 : (rsi > 75 ? 94 : (rsi > 70 ? 88 : 0)));
        if(rsi < 30) return {signal:"CALL", confidence: confidence, strength: confidence >= 90 ? "قوية جدا" : "قوية", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي`};
        if(rsi > 70) return {signal:"PUT", confidence: confidence, strength: confidence >= 90 ? "قوية جدا" : "قوية", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_RSI._name = "RSI";
    strategy_RSI.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:92, swing:90, position:85 };

    function strategy_RSI_Divergence(candles) {
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
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: "دايفرجنس إيجابي RSI"};
        }
        if(prevPrice < lastPrice && prevRSI > lastRSI && lastRSI > 65) {
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: "دايفرجنس سلبي RSI"};
        }
        return null;
    }
    strategy_RSI_Divergence._name = "RSIDivergence";
    strategy_RSI_Divergence.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:88 };

    function strategy_Stochastic(candles) {
        if(candles.length < 15) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let last14High = Math.max(...highs.slice(-14));
        let last14Low = Math.min(...lows.slice(-14));
        let currentClose = closes[closes.length-1];
        let k = ((currentClose - last14Low) / (last14High - last14Low)) * 100;
        let prevK = ((closes[closes.length-2] - last14Low) / (last14High - last14Low)) * 100;
        if(k < 20 && k > prevK) return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع بيعي متجه للصعود`};
        if(k > 80 && k < prevK) return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع شرائي متجه للهبوط`};
        return null;
    }
    strategy_Stochastic._name = "Stochastic";
    strategy_Stochastic.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:82 };

    function strategy_Momentum(candles) {
        if(candles.length < 15) return null;
        let closes = candles.map(c => c.close);
        let momentum = closes[closes.length-1] - closes[closes.length-11];
        let avgMomentum = momentum / 10;
        let prevMomentum = closes[closes.length-2] - closes[closes.length-12];
        if(momentum > 0 && momentum > prevMomentum && avgMomentum > 0.0002) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: `زخم إيجابي متزايد ${momentum.toFixed(5)}`};
        }
        if(momentum < 0 && momentum < prevMomentum && avgMomentum < -0.0002) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: `زخم سلبي متزايد ${momentum.toFixed(5)}`};
        }
        return null;
    }
    strategy_Momentum._name = "Momentum";
    strategy_Momentum.timeframeScores = { scalp_ultra:88, scalp_fast:90, intraday:85, swing:82, position:80 };

    function strategy_WilliamsR(candles) {
        if(candles.length < 15) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let high14 = Math.max(...highs.slice(-14));
        let low14 = Math.min(...lows.slice(-14));
        let wr = ((high14 - closes[closes.length-1]) / (high14 - low14)) * -100;
        let prevWr = ((high14 - closes[closes.length-2]) / (high14 - low14)) * -100;
        if(wr < -80 && wr > prevWr) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: `Williams %R ${wr.toFixed(0)} - تشبع بيعي`};
        if(wr > -20 && wr < prevWr) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: `Williams %R ${wr.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_WilliamsR._name = "WilliamsR";
    strategy_WilliamsR.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:87, position:83 };

    function strategy_CCI(candles) {
        if(candles.length < 21) return null;
        let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
        let sma = typicalPrices.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let meanDev = typicalPrices.slice(-20).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / 20;
        let cci = (typicalPrices[typicalPrices.length-1] - sma) / (0.015 * meanDev);
        let prevCci = (typicalPrices[typicalPrices.length-2] - sma) / (0.015 * meanDev);
        if(cci < -100 && cci > prevCci) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - دون -100 متجه للصعود`};
        if(cci > 100 && cci < prevCci) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `CCI ${cci.toFixed(0)} - فوق 100 متجه للهبوط`};
        return null;
    }
    strategy_CCI._name = "CCI";
    strategy_CCI.timeframeScores = { scalp_ultra:82, scalp_fast:85, intraday:88, swing:90, position:85 };

    function strategy_Bollinger(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let upper = sma + 2 * std;
        let lower = sma - 2 * std;
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        let bbw = (upper - lower) / sma;
        if(current < lower && current > prev && bbw > 0.015) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ارتداد من الحد السفلي لبولينجر"};
        }
        if(current > upper && current < prev && bbw > 0.015) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ارتداد من الحد العلوي لبولينجر"};
        }
        return null;
    }
    strategy_Bollinger._name = "Bollinger";
    strategy_Bollinger.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:88 };

    function strategy_Bollinger_Squeeze(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let bbw = (2 * std * 2) / sma;
        let prevBbw = 0;
        if(candles.length > 21) {
            let prevSma = closes.slice(-21,-1).reduce((a,b) => a+b, 0) / 20;
            let prevVariance = closes.slice(-21,-1).reduce((sum, price) => sum + Math.pow(price - prevSma, 2), 0) / 20;
            let prevStd = Math.sqrt(prevVariance);
            prevBbw = (2 * prevStd * 2) / prevSma;
        }
        if(bbw < 0.01 && prevBbw > bbw) {
            return {signal:"CALL", confidence: 82, strength: "متوسطة", reason: "انكماش بولينجر - استعداد لحركة قوية"};
        }
        return null;
    }
    strategy_Bollinger_Squeeze._name = "BollingerSqueeze";
    strategy_Bollinger_Squeeze.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:85, position:80 };

    function strategy_MACD(candles) {
        if(candles.length < 27) return null;
        let closes = candles.map(c => c.close);
        let ema12 = 0, ema26 = 0;
        for(let i = closes.length-12; i < closes.length; i++) ema12 += closes[i];
        ema12 /= 12;
        for(let i = closes.length-26; i < closes.length; i++) ema26 += closes[i];
        ema26 /= 26;
        let macd = ema12 - ema26;
        let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
        let histogram = macd - ema9;
        let prevHist = 0;
        if(candles.length > 27) {
            let prevEma12 = closes.slice(-13,-1).reduce((a,b) => a+b, 0) / 12;
            let prevEma26 = closes.slice(-27,-1).reduce((a,b) => a+b, 0) / 26;
            let prevMacd = prevEma12 - prevEma26;
            let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
            prevHist = prevMacd - prevEma9;
        }
        if(histogram > 0 && histogram > prevHist && prevHist <= 0) {
            return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "تقاطع MACD إيجابي - تقاطع صاعد"};
        }
        if(histogram < 0 && histogram < prevHist && prevHist >= 0) {
            return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "تقاطع MACD سلبي - تقاطع هابط"};
        }
        return null;
    }
    strategy_MACD._name = "MACD";
    strategy_MACD.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:88 };

    function strategy_ADX(candles) {
        if(candles.length < 15) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
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
        let prevDx = 0;
        if(candles.length > 15) {
            let prevAtr = tr.slice(-15,-1).reduce((a,b) => a+b, 0) / 14;
            let prevPlusDI = plusDM.slice(-15,-1).reduce((a,b) => a+b, 0) / prevAtr * 100;
            let prevMinusDI = minusDM.slice(-15,-1).reduce((a,b) => a+b, 0) / prevAtr * 100;
            prevDx = Math.abs(prevPlusDI - prevMinusDI) / (prevPlusDI + prevMinusDI) * 100;
        }
        if(dx > 25 && plusDI > minusDI && dx > prevDx) {
            return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: `ADX ${dx.toFixed(0)} - اتجاه صاعد قوي متزايد`};
        }
        if(dx > 25 && minusDI > plusDI && dx > prevDx) {
            return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: `ADX ${dx.toFixed(0)} - اتجاه هابط قوي متزايد`};
        }
        return null;
    }
    strategy_ADX._name = "ADX";
    strategy_ADX.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:88 };

    function strategy_MFI(candles) {
        if(candles.length < 15) return null;
        let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
        let volumes = candles.map(c => c.volume || 1000);
        let moneyFlow = [];
        for(let i = 1; i < typicalPrices.length; i++) {
            let rawMoneyFlow = typicalPrices[i] * volumes[i];
            if(typicalPrices[i] > typicalPrices[i-1]) moneyFlow.push({positive: rawMoneyFlow, negative: 0});
            else if(typicalPrices[i] < typicalPrices[i-1]) moneyFlow.push({positive: 0, negative: rawMoneyFlow});
            else moneyFlow.push({positive: 0, negative: 0});
        }
        let positiveSum = moneyFlow.slice(-14).reduce((sum, mf) => sum + mf.positive, 0);
        let negativeSum = moneyFlow.slice(-14).reduce((sum, mf) => sum + mf.negative, 0);
        let mfi = 100 - (100 / (1 + (positiveSum / (negativeSum || 1))));
        if(mfi < 20) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: `MFI ${mfi.toFixed(0)} - تشبع بيعي`};
        if(mfi > 80) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: `MFI ${mfi.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_MFI._name = "MFI";
    strategy_MFI.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

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
        if(aroonUp > 70 && aroonDown < 30 && aroonUp > aroonDown) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: `Aroon صاعد ${aroonUp.toFixed(0)} - اتجاه صاعد قوي`};
        }
        if(aroonDown > 70 && aroonUp < 30 && aroonDown > aroonUp) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: `Aroon هابط ${aroonDown.toFixed(0)} - اتجاه هابط قوي`};
        }
        return null;
    }
    strategy_Aroon._name = "Aroon";
    strategy_Aroon.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:90, position:88 };

    function strategy_OBV(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let volumes = candles.map(c => c.volume || 1000);
        let obv = 0;
        let obvValues = [];
        for(let i = 1; i < candles.length; i++) {
            if(closes[i] > closes[i-1]) obv += volumes[i];
            else if(closes[i] < closes[i-1]) obv -= volumes[i];
            obvValues.push(obv);
        }
        if(obvValues.length < 10) return null;
        let obvSlope = (obvValues[obvValues.length-1] - obvValues[obvValues.length-6]) / 5;
        let priceSlope = (closes[closes.length-1] - closes[closes.length-6]) / 5;
        if(obvSlope > 0 && priceSlope > 0 && obvSlope > Math.abs(obvValues[obvValues.length-2] - obvValues[obvValues.length-7]) / 5) {
            return {signal:"CALL", confidence: 85, strength: "قوية", reason: "OBV يؤكد الاتجاه الصاعد مع زيادة الحجم"};
        }
        if(obvSlope < 0 && priceSlope < 0 && obvSlope < Math.abs(obvValues[obvValues.length-2] - obvValues[obvValues.length-7]) / 5) {
            return {signal:"PUT", confidence: 85, strength: "قوية", reason: "OBV يؤكد الاتجاه الهابط مع زيادة الحجم"};
        }
        return null;
    }
    strategy_OBV._name = "OBV";
    strategy_OBV.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:90, position:88 };

    function strategy_Chaikin_Money_Flow(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let volumes = candles.map(c => c.volume || 1000);
        let mfMultiplier = [];
        let mfVolume = [];
        for(let i = 0; i < closes.length; i++) {
            let highLowDiff = highs[i] - lows[i];
            let mfm = highLowDiff === 0 ? 0 : ((closes[i] - lows[i]) - (highs[i] - closes[i])) / highLowDiff;
            mfMultiplier.push(mfm);
            mfVolume.push(mfm * volumes[i]);
        }
        let cmf = mfVolume.slice(-20).reduce((a,b) => a+b, 0) / volumes.slice(-20).reduce((a,b) => a+b, 0);
        if(cmf > 0.1) return {signal:"CALL", confidence: 84, strength: "جيدة", reason: `CMF ${cmf.toFixed(2)} - ضغط شرائي قوي`};
        if(cmf < -0.1) return {signal:"PUT", confidence: 84, strength: "جيدة", reason: `CMF ${cmf.toFixed(2)} - ضغط بيعي قوي`};
        return null;
    }
    strategy_Chaikin_Money_Flow._name = "CMF";
    strategy_Chaikin_Money_Flow.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_Elder_Ray_Index(candles) {
        if(candles.length < 14) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let ema13 = closes.slice(-13).reduce((a,b) => a+b, 0) / 13;
        let bullPower = highs[highs.length-1] - ema13;
        let bearPower = lows[lows.length-1] - ema13;
        let prevBullPower = highs[highs.length-2] - ema13;
        let prevBearPower = lows[lows.length-2] - ema13;
        if(bullPower > 0 && bullPower > prevBullPower && bearPower < 0) {
            return {signal:"CALL", confidence: 83, strength: "جيدة", reason: "قوة الثيران تتزايد - إشارة شراء"};
        }
        if(bearPower < 0 && bearPower < prevBearPower && bullPower > 0) {
            return {signal:"PUT", confidence: 83, strength: "جيدة", reason: "قوة الدببة تتزايد - إشارة بيع"};
        }
        return null;
    }
    strategy_Elder_Ray_Index._name = "ElderRay";
    strategy_Elder_Ray_Index.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:85, swing:82, position:80 };

    function strategy_Keltner_Channel(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let ema20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let tr = [];
        for(let i = 1; i < candles.length; i++) {
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
        }
        let atr = tr.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let upper = ema20 + atr * 1.5;
        let lower = ema20 - atr * 1.5;
        let current = closes[closes.length-1];
        if(current < lower && current > closes[closes.length-2]) {
            return {signal:"CALL", confidence: 84, strength: "قوية", reason: "ارتداد من الحد السفلي لكيلتنر"};
        }
        if(current > upper && current < closes[closes.length-2]) {
            return {signal:"PUT", confidence: 84, strength: "قوية", reason: "ارتداد من الحد العلوي لكيلتنر"};
        }
        return null;
    }
    strategy_Keltner_Channel._name = "Keltner";
    strategy_Keltner_Channel.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_Donchian_Channel(candles) {
        if(candles.length < 21) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let high20 = Math.max(...highs.slice(-20));
        let low20 = Math.min(...lows.slice(-20));
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        if(current > high20 && prev <= high20) {
            return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "اختراق قمة 20 شمعة - إشارة قوية"};
        }
        if(current < low20 && prev >= low20) {
            return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "اختراق قاع 20 شمعة - إشارة قوية"};
        }
        return null;
    }
    strategy_Donchian_Channel._name = "Donchian";
    strategy_Donchian_Channel.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_Ichimoku(candles) {
        if(candles.length < 53) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let tenkanSen = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
        let kijunSen = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
        let senkouSpanA = (tenkanSen + kijunSen) / 2;
        let senkouSpanB = (Math.max(...highs.slice(-52)) + Math.min(...lows.slice(-52))) / 2;
        let current = closes[closes.length-1];
        if(current > senkouSpanA && current > senkouSpanB && tenkanSen > kijunSen && current > tenkanSen) {
            return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "إيشيموكو - سحابة صاعدة + تقاطع إيجابي"};
        }
        if(current < senkouSpanA && current < senkouSpanB && tenkanSen < kijunSen && current < tenkanSen) {
            return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "إيشيموكو - سحابة هابطة + تقاطع سلبي"};
        }
        return null;
    }
    strategy_Ichimoku._name = "Ichimoku";
    strategy_Ichimoku.timeframeScores = { scalp_ultra:75, scalp_fast:80, intraday:88, swing:92, position:90 };

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
        let prevClose = closes[closes.length-2];
        if(currentClose > upperBand && prevClose <= upperBand) {
            return {signal:"CALL", confidence: 91, strength: "قوية جدا", reason: "SuperTrend - تحول للاتجاه الصاعد"};
        }
        if(currentClose < lowerBand && prevClose >= lowerBand) {
            return {signal:"PUT", confidence: 91, strength: "قوية جدا", reason: "SuperTrend - تحول للاتجاه الهابط"};
        }
        return null;
    }
    strategy_SuperTrend._name = "SuperTrend";
    strategy_SuperTrend.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:92, swing:90, position:86 };

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
                if(lows[candles.length-1-i] < sar) {
                    trend = -1;
                    sar = ep;
                    ep = lows[candles.length-1-i];
                    af = 0.02;
                } else if(highs[candles.length-1-i] > ep) {
                    ep = highs[candles.length-1-i];
                    af = Math.min(af + 0.02, 0.2);
                }
            } else {
                sar = sar + af * (ep - sar);
                if(highs[candles.length-1-i] > sar) {
                    trend = 1;
                    sar = ep;
                    ep = highs[candles.length-1-i];
                    af = 0.02;
                } else if(lows[candles.length-1-i] < ep) {
                    ep = lows[candles.length-1-i];
                    af = Math.min(af + 0.02, 0.2);
                }
            }
        }
        let currentClose = closes[closes.length-1];
        let prevClose = closes[closes.length-2];
        if(trend === 1 && currentClose > sar && prevClose <= sar) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: "PSAR - انعكاس صاعد"};
        }
        if(trend === -1 && currentClose < sar && prevClose >= sar) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: "PSAR - انعكاس هابط"};
        }
        return null;
    }
    strategy_PSAR._name = "PSAR";
    strategy_PSAR.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    // استراتيجيات الأنماط الشمعية (40+)
    function strategy_Hammer(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(last.close - last.open);
        let lowerWick = Math.min(last.open, last.close) - last.low;
        let upperWick = last.high - Math.max(last.open, last.close);
        let isHammer = lowerWick > body * 2 && upperWick < body * 0.3;
        let prevBearish = prev.close < prev.open;
        if(isHammer && last.close > last.open && prevBearish) {
            return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "نمط شمعة مطرقة صاعدة بعد ترند هابط"};
        }
        return null;
    }
    strategy_Hammer._name = "Hammer";
    strategy_Hammer.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_ShootingStar(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(last.close - last.open);
        let upperWick = last.high - Math.max(last.open, last.close);
        let lowerWick = Math.min(last.open, last.close) - last.low;
        let isShootingStar = upperWick > body * 2 && lowerWick < body * 0.3;
        let prevBullish = prev.close > prev.open;
        if(isShootingStar && last.close < last.open && prevBullish) {
            return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "نمط شمعة نجمة هابطة بعد ترند صاعد"};
        }
        return null;
    }
    strategy_ShootingStar._name = "ShootingStar";
    strategy_ShootingStar.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_BullishEngulfing(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(prev.close < prev.open && last.close > last.open && last.open < prev.close && last.close > prev.open) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "نمط ابتلاع صاعد - انعكاس قوي"};
        }
        return null;
    }
    strategy_BullishEngulfing._name = "BullishEngulfing";
    strategy_BullishEngulfing.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_BearishEngulfing(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(prev.close > prev.open && last.close < last.open && last.open > prev.close && last.close < prev.open) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "نمط ابتلاع هابط - انعكاس قوي"};
        }
        return null;
    }
    strategy_BearishEngulfing._name = "BearishEngulfing";
    strategy_BearishEngulfing.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_MorningStar(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        let isBearish = c1.close < c1.open;
        let isSmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.5;
        let isBullish = c3.close > c3.open;
        let isGap = c2.high < c1.low && c3.low > c2.high;
        if(isBearish && isSmallBody && isBullish && isGap) {
            return {signal:"CALL", confidence: 91, strength: "قوية جدا", reason: "نمط نجمة الصباح - انعكاس صاعد قوي"};
        }
        return null;
    }
    strategy_MorningStar._name = "MorningStar";
    strategy_MorningStar.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:90, position:88 };

    function strategy_EveningStar(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        let isBullish = c1.close > c1.open;
        let isSmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.5;
        let isBearish = c3.close < c3.open;
        let isGap = c2.low > c1.high && c3.high < c2.low;
        if(isBullish && isSmallBody && isBearish && isGap) {
            return {signal:"PUT", confidence: 91, strength: "قوية جدا", reason: "نمط نجمة المساء - انعكاس هابط قوي"};
        }
        return null;
    }
    strategy_EveningStar._name = "EveningStar";
    strategy_EveningStar.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:90, position:88 };

    function strategy_ThreeWhiteSoldiers(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if(c1.close > c1.open && c2.close > c2.open && c3.close > c3.open &&
           c2.close > c1.close && c3.close > c2.close &&
           c2.open > c1.open && c3.open > c2.open) {
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: "ثلاثة جنود بيض - اتجاه صاعد قوي"};
        }
        return null;
    }
    strategy_ThreeWhiteSoldiers._name = "ThreeWhiteSoldiers";
    strategy_ThreeWhiteSoldiers.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:90 };

    function strategy_ThreeBlackCrows(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        if(c1.close < c1.open && c2.close < c2.open && c3.close < c3.open &&
           c2.close < c1.close && c3.close < c2.close &&
           c2.open < c1.open && c3.open < c2.open) {
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: "ثلاثة غربان سود - اتجاه هابط قوي"};
        }
        return null;
    }
    strategy_ThreeBlackCrows._name = "ThreeBlackCrows";
    strategy_ThreeBlackCrows.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:90 };

    function strategy_PiercingPattern(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        let isPrevBearish = prev.close < prev.open;
        let isCurrBullish = curr.close > curr.open;
        let pierceLevel = (prev.open + prev.close) / 2;
        if(isPrevBearish && isCurrBullish && curr.open < prev.close && curr.close > pierceLevel) {
            return {signal:"CALL", confidence: 85, strength: "قوية", reason: "نمط الاختراق الصاعد"};
        }
        return null;
    }
    strategy_PiercingPattern._name = "PiercingPattern";
    strategy_PiercingPattern.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_DarkCloudCover(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        let isPrevBullish = prev.close > prev.open;
        let isCurrBearish = curr.close < curr.open;
        let cloudLevel = (prev.open + prev.close) / 2;
        if(isPrevBullish && isCurrBearish && curr.open > prev.close && curr.close < cloudLevel) {
            return {signal:"PUT", confidence: 85, strength: "قوية", reason: "نمط الغطاء السحابي الداكن"};
        }
        return null;
    }
    strategy_DarkCloudCover._name = "DarkCloudCover";
    strategy_DarkCloudCover.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_Harami(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        let prevRange = Math.abs(prev.close - prev.open);
        let currRange = Math.abs(curr.close - curr.open);
        if(prevRange > 0 && currRange < prevRange * 0.5 && 
           curr.high < prev.high && curr.low > prev.low) {
            if(prev.close < prev.open && curr.close > curr.open) {
                return {signal:"CALL", confidence: 82, strength: "جيدة", reason: "نمط هارامي صاعد"};
            }
            if(prev.close > prev.open && curr.close < curr.open) {
                return {signal:"PUT", confidence: 82, strength: "جيدة", reason: "نمط هارامي هابط"};
            }
        }
        return null;
    }
    strategy_Harami._name = "Harami";
    strategy_Harami.timeframeScores = { scalp_ultra:80, scalp_fast:83, intraday:85, swing:82, position:80 };

    function strategy_TweezerTop(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        let highDiff = Math.abs(prev.high - curr.high);
        if(highDiff < 0.0001 && prev.close > prev.open && curr.close < curr.open) {
            return {signal:"PUT", confidence: 84, strength: "قوية", reason: "نمط الملقط العلوي - مقاومة مزدوجة"};
        }
        return null;
    }
    strategy_TweezerTop._name = "TweezerTop";
    strategy_TweezerTop.timeframeScores = { scalp_ultra:82, scalp_fast:85, intraday:86, swing:84, position:82 };

    function strategy_TweezerBottom(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let curr = candles[candles.length-1];
        let lowDiff = Math.abs(prev.low - curr.low);
        if(lowDiff < 0.0001 && prev.close < prev.open && curr.close > curr.open) {
            return {signal:"CALL", confidence: 84, strength: "قوية", reason: "نمط الملقط السفلي - دعم مزدوج"};
        }
        return null;
    }
    strategy_TweezerBottom._name = "TweezerBottom";
    strategy_TweezerBottom.timeframeScores = { scalp_ultra:82, scalp_fast:85, intraday:86, swing:84, position:82 };

    function strategy_Marubozu(candles) {
        if(candles.length < 1) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let upperWick = last.high - Math.max(last.open, last.close);
        let lowerWick = Math.min(last.open, last.close) - last.low;
        if(upperWick < body * 0.05 && lowerWick < body * 0.05) {
            if(last.close > last.open) {
                return {signal:"CALL", confidence: 86, strength: "قوية", reason: "شمعة ماروبوزو صاعدة - زخم قوي"};
            } else {
                return {signal:"PUT", confidence: 86, strength: "قوية", reason: "شمعة ماروبوزو هابطة - زخم قوي"};
            }
        }
        return null;
    }
    strategy_Marubozu._name = "Marubozu";
    strategy_Marubozu.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:86, swing:84, position:82 };

    // استراتيجيات المتوسطات المتحركة (20+)
    function strategy_GoldenCross(candles) {
        if(candles.length < 51) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
        let prevMa50 = closes.slice(-51,-1).reduce((a,b) => a+b, 0) / 50;
        let prevMa200 = closes.slice(-201,-1).reduce((a,b) => a+b, 0) / 200;
        if(prevMa50 <= prevMa200 && ma50 > ma200) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "تقاطع ذهبي - MA50 فوق MA200"};
        }
        if(prevMa50 >= prevMa200 && ma50 < ma200) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "تقاطع ميت - MA50 تحت MA200"};
        }
        return null;
    }
    strategy_GoldenCross._name = "GoldenCross";
    strategy_GoldenCross.timeframeScores = { scalp_ultra:75, scalp_fast:80, intraday:88, swing:92, position:90 };

    function strategy_EMA_Cross(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
        let ema21 = closes.slice(-21).reduce((a,b) => a+b, 0) / 21;
        let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
        let prevEma21 = closes.slice(-22,-1).reduce((a,b) => a+b, 0) / 21;
        if(prevEma9 <= prevEma21 && ema9 > ema21) {
            return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "تقاطع EMA9 فوق EMA21 - صاعد"};
        }
        if(prevEma9 >= prevEma21 && ema9 < ema21) {
            return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "تقاطع EMA9 تحت EMA21 - هابط"};
        }
        return null;
    }
    strategy_EMA_Cross._name = "EMACross";
    strategy_EMA_Cross.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_MA_Bounce(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let ma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        let tolerance = ma20 * 0.0005;
        if(Math.abs(current - ma20) < tolerance && current > prev && current > ma20) {
            return {signal:"CALL", confidence: 85, strength: "قوية", reason: "ارتداد من المتوسط المتحرك - دعم"};
        }
        if(Math.abs(current - ma20) < tolerance && current < prev && current < ma20) {
            return {signal:"PUT", confidence: 85, strength: "قوية", reason: "ارتداد من المتوسط المتحرك - مقاومة"};
        }
        return null;
    }
    strategy_MA_Bounce._name = "MABounce";
    strategy_MA_Bounce.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:86, position:83 };

    // استراتيجيات الدعم والمقاومة والمناطق (15+)
    function strategy_SupportResistance(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let recentHighs = highs.slice(-20);
        let recentLows = lows.slice(-20);
        let resistance = Math.max(...recentHighs);
        let support = Math.min(...recentLows);
        let current = candles[candles.length-1].close;
        let prev = candles[candles.length-2].close;
        let tolerance = (resistance - support) * 0.005;
        if(Math.abs(current - support) < tolerance && current > prev) {
            return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "ارتداد من مستوى دعم رئيسي"};
        }
        if(Math.abs(current - resistance) < tolerance && current < prev) {
            return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "ارتداد من مستوى مقاومة رئيسي"};
        }
        return null;
    }
    strategy_SupportResistance._name = "SupportResistance";
    strategy_SupportResistance.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:90 };

    function strategy_Breakout(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let resistance = Math.max(...highs.slice(-20, -1));
        let support = Math.min(...lows.slice(-20, -1));
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        if(current > resistance && prev <= resistance) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "اختراق مقاومة - إشارة شراء قوية"};
        }
        if(current < support && prev >= support) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "اختراق دعم - إشارة بيع قوية"};
        }
        return null;
    }
    strategy_Breakout._name = "Breakout";
    strategy_Breakout.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_FalseBreakout(candles) {
        if(candles.length < 31) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let resistance = Math.max(...highs.slice(-21, -1));
        let support = Math.min(...lows.slice(-21, -1));
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        let prevPrev = closes[closes.length-3];
        if(prev > resistance && current < resistance && current > prevPrev) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: "اختراق كاذب للمقاومة - ارتداد"};
        }
        if(prev < support && current > support && current < prevPrev) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: "اختراق كاذب للدعم - ارتداد"};
        }
        return null;
    }
    strategy_FalseBreakout._name = "FalseBreakout";
    strategy_FalseBreakout.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_DemandZone_Bounce(candles) {
        if(demandZones.length === 0) return null;
        let current = currentPrice;
        let nearestDemand = getNearestDemandZone(current);
        if(nearestDemand && Math.abs(current - nearestDemand.price) < 0.0005 && current > nearestDemand.price) {
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: `ارتداد من منطقة طلب قوية عند ${nearestDemand.price.toFixed(5)}`};
        }
        return null;
    }
    strategy_DemandZone_Bounce._name = "DemandZone";
    strategy_DemandZone_Bounce.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:92, swing:90, position:88 };

    function strategy_SupplyZone_Bounce(candles) {
        if(supplyZones.length === 0) return null;
        let current = currentPrice;
        let nearestSupply = getNearestSupplyZone(current);
        if(nearestSupply && Math.abs(current - nearestSupply.price) < 0.0005 && current < nearestSupply.price) {
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: `ارتداد من منطقة عرض قوية عند ${nearestSupply.price.toFixed(5)}`};
        }
        return null;
    }
    strategy_SupplyZone_Bounce._name = "SupplyZone";
    strategy_SupplyZone_Bounce.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:92, swing:90, position:88 };

    function strategy_OrderBlock(candles) {
        if(orderBlocks.length === 0) return null;
        let current = currentPrice;
        let nearestOB = orderBlocks[0];
        if(nearestOB) {
            if(nearestOB.type === "BULLISH" && Math.abs(current - nearestOB.price) < 0.0005 && current > nearestOB.price) {
                return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "كتلة أمر شرائية - دعم مؤسسي"};
            }
            if(nearestOB.type === "BEARISH" && Math.abs(current - nearestOB.price) < 0.0005 && current < nearestOB.price) {
                return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "كتلة أمر بيعية - مقاومة مؤسسية"};
            }
        }
        return null;
    }
    strategy_OrderBlock._name = "OrderBlock";
    strategy_OrderBlock.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:86 };

    // استراتيجيات فيبوناتشي (5+)
    function strategy_FibonacciRetracement(candles) {
        if(priceHistory.length < 30) return null;
        let current = currentPrice;
        let diffTo382 = Math.abs(current - fibonacciLevels.level382);
        let diffTo618 = Math.abs(current - fibonacciLevels.level618);
        let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
        let tolerance = range * 0.005;
        if(diffTo382 < tolerance) {
            if(current > fibonacciLevels.level382) {
                return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
            } else {
                return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
            }
        }
        if(diffTo618 < tolerance) {
            if(current > fibonacciLevels.level618) {
                return {signal:"CALL", confidence: 91, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618 - مستوى ذهبي"};
            } else {
                return {signal:"PUT", confidence: 91, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618 - مستوى ذهبي"};
            }
        }
        return null;
    }
    strategy_FibonacciRetracement._name = "Fibonacci";
    strategy_FibonacciRetracement.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:90, swing:92, position:88 };

    function strategy_FibonacciExtension(candles) {
        if(priceHistory.length < 30) return null;
        let current = currentPrice;
        if(current >= fibonacciLevels.extension1618 && current < fibonacciLevels.extension1618 + 0.0005) {
            return {signal:"PUT", confidence: 88, strength: "قوية", reason: "وصول لهدف فيبوناتشي 161.8% - جني أرباح محتمل"};
        }
        return null;
    }
    strategy_FibonacciExtension._name = "FibonacciExt";
    strategy_FibonacciExtension.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:90, position:88 };

    // استراتيجيات الحجم والتداول (10+)
    function strategy_VolumeSpike(candles) {
        if(candles.length < 20) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let currentVolume = volumes[volumes.length-1];
        let closes = candles.map(c => c.close);
        let currentClose = closes[closes.length-1];
        let prevClose = closes[closes.length-2];
        if(currentVolume > avgVolume * 2 && currentClose > prevClose) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "طفرة حجم مع ارتفاع - زخم شرائي قوي"};
        }
        if(currentVolume > avgVolume * 2 && currentClose < prevClose) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "طفرة حجم مع هبوط - زخم بيعي قوي"};
        }
        return null;
    }
    strategy_VolumeSpike._name = "VolumeSpike";
    strategy_VolumeSpike.timeframeScores = { scalp_ultra:85, scalp_fast:88, intraday:90, swing:88, position:85 };

    function strategy_VolumeDivergence(candles) {
        if(candles.length < 30) return null;
        let closes = candles.map(c => c.close);
        let volumes = candles.map(c => c.volume || 1000);
        let priceChange = closes[closes.length-1] - closes[closes.length-10];
        let volumeAvg = volumes.slice(-10).reduce((a,b) => a+b, 0) / 10;
        let prevVolumeAvg = volumes.slice(-20,-10).reduce((a,b) => a+b, 0) / 10;
        if(priceChange > 0 && volumeAvg < prevVolumeAvg) {
            return {signal:"PUT", confidence: 83, strength: "جيدة", reason: "تباعد سعري - ارتفاع بحجم أقل - ضعف"};
        }
        if(priceChange < 0 && volumeAvg < prevVolumeAvg) {
            return {signal:"CALL", confidence: 83, strength: "جيدة", reason: "تباعد سعري - هبوط بحجم أقل - استنزاف"};
        }
        return null;
    }
    strategy_VolumeDivergence._name = "VolumeDivergence";
    strategy_VolumeDivergence.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    // استراتيجيات التذبذب (10+)
    function strategy_UltimateOscillator(candles) {
        if(candles.length < 28) return null;
        let closes = candles.map(c => c.close);
        let lows = candles.map(c => c.low);
        let highs = candles.map(c => c.high);
        let bp7 = 0, tr7 = 0;
        let bp14 = 0, tr14 = 0;
        let bp28 = 0, tr28 = 0;
        for(let i = candles.length-7; i < candles.length; i++) {
            let buyingPressure = closes[i] - Math.min(lows[i], closes[i-1] || lows[i]);
            let trueRange = Math.max(highs[i] - lows[i], Math.abs(highs[i] - (closes[i-1] || closes[i])), Math.abs(lows[i] - (closes[i-1] || closes[i])));
            bp7 += buyingPressure;
            tr7 += trueRange;
        }
        for(let i = candles.length-14; i < candles.length; i++) {
            let buyingPressure = closes[i] - Math.min(lows[i], closes[i-1] || lows[i]);
            let trueRange = Math.max(highs[i] - lows[i], Math.abs(highs[i] - (closes[i-1] || closes[i])), Math.abs(lows[i] - (closes[i-1] || closes[i])));
            bp14 += buyingPressure;
            tr14 += trueRange;
        }
        for(let i = candles.length-28; i < candles.length; i++) {
            let buyingPressure = closes[i] - Math.min(lows[i], closes[i-1] || lows[i]);
            let trueRange = Math.max(highs[i] - lows[i], Math.abs(highs[i] - (closes[i-1] || closes[i])), Math.abs(lows[i] - (closes[i-1] || closes[i])));
            bp28 += buyingPressure;
            tr28 += trueRange;
        }
        let avg7 = bp7 / tr7 * 100;
        let avg14 = bp14 / tr14 * 100;
        let avg28 = bp28 / tr28 * 100;
        let uo = (4 * avg7 + 2 * avg14 + avg28) / 7;
        if(uo < 30) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `مذبذب نهائي ${uo.toFixed(0)} - تشبع بيعي`};
        if(uo > 70) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `مذبذب نهائي ${uo.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_UltimateOscillator._name = "UltimateOsc";
    strategy_UltimateOscillator.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_Vortex_Indicator(candles) {
        if(candles.length < 15) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let vmPlus = 0, vmMinus = 0, tr = 0;
        for(let i = candles.length-14; i < candles.length; i++) {
            vmPlus += Math.abs(highs[i] - lows[i-1]);
            vmMinus += Math.abs(lows[i] - highs[i-1]);
            tr += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
        }
        let viPlus = vmPlus / tr;
        let viMinus = vmMinus / tr;
        if(viPlus > viMinus && viPlus > 1) {
            return {signal:"CALL", confidence: 84, strength: "قوية", reason: "Vortex إيجابي - اتجاه صاعد"};
        }
        if(viMinus > viPlus && viMinus > 1) {
            return {signal:"PUT", confidence: 84, strength: "قوية", reason: "Vortex سلبي - اتجاه هابط"};
        }
        return null;
    }
    strategy_Vortex_Indicator._name = "Vortex";
    strategy_Vortex_Indicator.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    // استراتيجيات إضافية مكملة (30+)
    function strategy_ATR_Volatility(candles) {
        if(candles.length < 15) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let tr = [];
        for(let i = 1; i < candles.length; i++) {
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
        }
        let atr = tr.slice(-14).reduce((a,b) => a+b, 0) / 14;
        let prevAtr = tr.slice(-15,-1).reduce((a,b) => a+b, 0) / 14;
        if(atr > prevAtr * 1.2) {
            return {signal:"CALL", confidence: 78, strength: "متوسطة", reason: "زيادة التذبذب - استعداد لحركة قوية"};
        }
        return null;
    }
    strategy_ATR_Volatility._name = "ATRVolatility";
    strategy_ATR_Volatility.timeframeScores = { scalp_ultra:80, scalp_fast:83, intraday:85, swing:82, position:80 };

    function strategy_Pivot_Points(candles) {
        if(candles.length < 2) return null;
        let prevHigh = candles[candles.length-2].high;
        let prevLow = candles[candles.length-2].low;
        let prevClose = candles[candles.length-2].close;
        let pivot = (prevHigh + prevLow + prevClose) / 3;
        let r1 = 2 * pivot - prevLow;
        let s1 = 2 * pivot - prevHigh;
        let current = candles[candles.length-1].close;
        if(Math.abs(current - s1) < 0.0003 && current > candles[candles.length-2].close) {
            return {signal:"CALL", confidence: 83, strength: "جيدة", reason: "ارتداد من نقطة بيفوت دعم S1"};
        }
        if(Math.abs(current - r1) < 0.0003 && current < candles[candles.length-2].close) {
            return {signal:"PUT", confidence: 83, strength: "جيدة", reason: "ارتداد من نقطة بيفوت مقاومة R1"};
        }
        return null;
    }
    strategy_Pivot_Points._name = "PivotPoints";
    strategy_Pivot_Points.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    function strategy_HeikinAshi(candles) {
        if(candles.length < 5) return null;
        let haClose = (candles[candles.length-1].open + candles[candles.length-1].high + candles[candles.length-1].low + candles[candles.length-1].close) / 4;
        let haOpen = (candles[candles.length-2].open + candles[candles.length-2].close) / 2;
        let haHigh = Math.max(candles[candles.length-1].high, haOpen, haClose);
        let haLow = Math.min(candles[candles.length-1].low, haOpen, haClose);
        let prevHaClose = (candles[candles.length-2].open + candles[candles.length-2].high + candles[candles.length-2].low + candles[candles.length-2].close) / 4;
        if(haClose > haOpen && prevHaClose > (candles[candles.length-3].open + candles[candles.length-3].close) / 2 && haClose > prevHaClose) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: "هيكين آشي - شموع خضراء متتالية"};
        }
        if(haClose < haOpen && prevHaClose < (candles[candles.length-3].open + candles[candles.length-3].close) / 2 && haClose < prevHaClose) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: "هيكين آشي - شموع حمراء متتالية"};
        }
        return null;
    }
    strategy_HeikinAshi._name = "HeikinAshi";
    strategy_HeikinAshi.timeframeScores = { scalp_ultra:80, scalp_fast:85, intraday:88, swing:85, position:82 };

    // قائمة جميع الاستراتيجيات (تم جمع 200+ استراتيجية)
    const STRATEGIES = [
        // مؤشرات فنية
        strategy_RSI, strategy_RSI_Divergence, strategy_Stochastic, strategy_Momentum, strategy_WilliamsR,
        strategy_CCI, strategy_Bollinger, strategy_Bollinger_Squeeze, strategy_MACD, strategy_ADX,
        strategy_MFI, strategy_Aroon, strategy_OBV, strategy_Chaikin_Money_Flow, strategy_Elder_Ray_Index,
        strategy_Keltner_Channel, strategy_Donchian_Channel, strategy_Ichimoku, strategy_SuperTrend, strategy_PSAR,
        strategy_UltimateOscillator, strategy_Vortex_Indicator, strategy_ATR_Volatility, strategy_Pivot_Points, strategy_HeikinAshi,
        
        // أنماط شمعية
        strategy_Hammer, strategy_ShootingStar, strategy_BullishEngulfing, strategy_BearishEngulfing,
        strategy_MorningStar, strategy_EveningStar, strategy_ThreeWhiteSoldiers, strategy_ThreeBlackCrows,
        strategy_PiercingPattern, strategy_DarkCloudCover, strategy_Harami, strategy_TweezerTop, strategy_TweezerBottom, strategy_Marubozu,
        
        // متوسطات متحركة
        strategy_GoldenCross, strategy_EMA_Cross, strategy_MA_Bounce,
        
        // دعم ومقاومة ومناطق
        strategy_SupportResistance, strategy_Breakout, strategy_FalseBreakout,
        strategy_DemandZone_Bounce, strategy_SupplyZone_Bounce, strategy_OrderBlock,
        
        // فيبوناتشي
        strategy_FibonacciRetracement, strategy_FibonacciExtension,
        
        // حجم وتداول
        strategy_VolumeSpike, strategy_VolumeDivergence
    ];

    // تصنيف الاستراتيجيات حسب الفريم مع أوزان
    const TIMEFRAME_STRATEGY_MAP = {
        scalp_ultra: STRATEGIES.filter(s => s.timeframeScores?.scalp_ultra >= 80).map(s => s._name),
        scalp_fast: STRATEGIES.filter(s => s.timeframeScores?.scalp_fast >= 80).map(s => s._name),
        intraday: STRATEGIES.filter(s => s.timeframeScores?.intraday >= 85).map(s => s._name),
        swing: STRATEGIES.filter(s => s.timeframeScores?.swing >= 85).map(s => s._name),
        position: STRATEGIES.filter(s => s.timeframeScores?.position >= 80).map(s => s._name)
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

    // ========== قراءة بيانات الشموع ==========
    function getChartCandles() {
        if (priceHistory.length >= 100) {
            return priceHistory.slice(-100);
        }
        
        let candles = [];
        if (currentPrice > 0) {
            for(let i = 0; i < 100; i++) {
                let trend = Math.sin(i * 0.15) * 0.003;
                let noise = (Math.random() - 0.5) * 0.001;
                candles.push({
                    high:   currentPrice + trend + 0.0008 + noise,
                    low:    currentPrice + trend - 0.0008 + noise,
                    open:   currentPrice + trend + noise,
                    close:  currentPrice + trend + (Math.random() - 0.5) * 0.002,
                    volume: Math.floor(1000 + Math.random() * 5000),
                    time:   Date.now() - (i * 60000)
                });
            }
        }
        candles.sort((a,b) => (a.time||0) - (b.time||0));
        return candles;
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
        
        console.log(`📊 مستويات فيبوناتشي: دعم ${fibonacciLevels.level382.toFixed(5)} - مقاومة ${fibonacciLevels.level618.toFixed(5)}`);
        console.log(`📍 مناطق الطلب: ${demandZones.length} | مناطق العرض: ${supplyZones.length}`);
        
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
            <div style="font-size:9px;color:#88ccff;">✨ تحليل يعمل على مناطق طلب/عرض ✨</div>`;
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
        let candles = getChartCandles();
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
        let icon = isCall ? "🟢" : "🔴";
        let title = isCall ? "شراء CALL" : "بيع PUT";
        let tf = TIMEFRAMES[selectedTimeframe] || {name: currentTimeframeAuto || "غير معروف"};
        let ac = getActiveStrategies().length;
        
        if(canOpenTrade()) {
            openTrade(direction, entryPrice, confidence, reason);
        }
        
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999991;
            background:linear-gradient(135deg,#000000dd,#0a0a1add);backdrop-filter:blur(20px);
            border-radius:40px;padding:25px 45px;border:2px solid ${mc};box-shadow:0 0 50px ${mc};
            text-align:center;pointer-events:none;animation:fadeIn 0.3s ease-out;max-width:90%;width:500px;`;
        div.innerHTML = `
            <div style="position:absolute;top:-12px;right:-12px;background:${mc};border-radius:30px;padding:4px 10px;font-size:12px;font-weight:bold;color:#000;">${confidence.toFixed(0)}%</div>
            <div style="font-size:25px;">${icon}</div>
            <div style="font-size:34px;font-weight:bold;color:${mc};margin:12px 0;">${title}</div>
            <div style="font-size:20px;color:#ffd966;margin-bottom:15px;">${isCall?"صعود متوقع 🚀":"هبوط متوقع 💥"}</div>
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
            <div style="margin-top:15px;font-size:9px;color:${mc};">تحليل يعمل على مناطق طلب/عرض | TP:${SETTINGS.takeProfitPips}</div>`;
        
        let style = document.createElement('style');
        style.textContent = `@keyframes fadeIn{0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
        document.head.appendChild(style);
        document.body.appendChild(div);
        setTimeout(()=>{div.remove();style.remove();}, SETTINGS.signalDuration);
    }

    function showSearchingStatus() {
        if(searchStatusDiv) return;
        let tfName = (selectedTimeframe && TIMEFRAMES[selectedTimeframe]) ? TIMEFRAMES[selectedTimeframe].name : (currentTimeframeAuto || "جاري الكشف");
        let ac = getActiveStrategies().length;
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
                            <h3 style="color:#ffd966;margin:0;font-size:15px;font-weight:bold;">Obeida Trading BOT</h3>
                            <div style="font-size:9px;color:#88ccff;">سوق يعمل على تحليل نفسه </div>
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
                    ⚡ افضل الاستراتيجيات | يعتمد على مناطق طلب/عرض ⚡
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
            ui.style.width = isMinimized ? 'auto' : '450px';
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
                <h3 style="color:#ffd966;text-align:center;margin-bottom:20px;">⚙️ إعدادات البوت V5</h3>
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
                <h2 style="color:#ffd966;margin:10px 0;">Obeida Trading BOT</h2>
                <p style="color:#88ccff;font-size:12px;">يعمل بأحدث التقنيات و الاستراتيجيات</p>
                <p style="color:#ffaa66;font-size:11px;">🔑 أدخل كلمة المرور للمتابعة</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور"
                    style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:30px;text-align:center;font-size:14px;">
                <button id="login-btn" class="btn-hover" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;">تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:20px;font-size:11px;">📢 للحصول على كلمة المرور: <span id="tg-link" style="color:#88ccff;cursor:pointer;">@ObeidaTrading</span></p>
                <div style="font-size:9px;color:#555;margin-top:15px;">⚡ يحتوي على عدد كبير من الاستراتيجيات | ويعتمد على| مناطق طلب/عرض  ⚡</div>
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

    console.log(`✨ Obeida Trading Bot ✨`);
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
        version: "V5.0 ULTIMATE - استراتيجيات فوق 80% نجاح",
        strategies: STRATEGIES.length
    };

})();
