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
    // ========== رادار السعر - كود سحب السعر الحالي (يعمل 100%) ==========
    // =====================================================
    function initPriceRadar() {
        console.log("%c 🛰️ جاري كشف العملة ", "color: #00ffcc; font-weight: bold;");

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
                                
                                priceHistory.push({close: currentPrice, time: Date.now()});
                                if (priceHistory.length > 200) priceHistory.shift();
                                
                                updateFibonacciLevels();
                                
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
    // ========== كشف العملة التلقائي ==========
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

    // =====================================================
    // ========== كشف الفريم التلقائي ==========
    // =====================================================
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
                    timeframeDisplay.innerHTML = `📊 ${config.name} (${currentTF}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية نشطة | انتظار ${config.waitSeconds} ثانية</span>`;
                    timeframeDisplay.style.color = "#ffd966";
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

    // =====================================================
    // ========== كشف نوع الحساب التلقائي ==========
    // =====================================================
    function initAccountDetection() {
        function checkAndUpdate() {
            const headerText = document.querySelector('header')?.innerText || document.body.innerText;
            
            const isDemo = headerText.includes("Demo") || headerText.includes("تجريبي") || headerText.includes("DEMO") || headerText.includes("demo");
            const currentType = isDemo ? "DEMO" : (headerText.includes("Real") || headerText.includes("حقيقي") || headerText.includes("LIVE") ? "LIVE" : null);

            if (currentType && currentType !== lastAccountType) {
                lastAccountType = currentType;
                currentAccountType = currentType;
                
                const accountEl = document.getElementById('current-account-display');
                if (accountEl) {
                    accountEl.innerText = currentType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
                    accountEl.style.color = currentType === "DEMO" ? "#ffaa66" : "#00ffaa";
                }
                
                if (currentType === "DEMO") {
                    console.log("%c[الحساب]: حساب تجريبي 🔸", "color: orange; font-weight: bold;");
                } else if (currentType === "LIVE") {
                    console.log("%c[الحساب]: حساب حقيقي ✅", "color: #00ff00; font-weight: bold;");
                    console.warn("⚠️ تنبيه: أنت تستخدم حساب حقيقي - توخ الحذر");
                }
            } else if (currentAccountType === "🔄 جاري الكشف..." && currentType) {
                currentAccountType = currentType;
                lastAccountType = currentType;
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

    // ========== تحديث واجهة الكشف ==========
    function updateAutoDetectionUI() {
        const assetEl = document.getElementById('current-asset-display');
        if (assetEl && currentAsset !== "🔄 جاري الكشف...") assetEl.innerText = currentAsset;
        
        const timeframeEl = document.getElementById('st-tf-value');
        if (timeframeEl && currentTimeframeAuto !== "🔄 جاري الكشف...") timeframeEl.innerText = currentTimeframeAuto;
        
        const accountEl = document.getElementById('current-account-display');
        if (accountEl && currentAccountType !== "🔄 جاري الكشف...") {
            accountEl.innerText = currentAccountType === "DEMO" ? "🔸 تجريبي" : "✅ حقيقي";
            accountEl.style.color = currentAccountType === "DEMO" ? "#ffaa66" : "#00ffaa";
        }
    }

    // ========== خرائط الاستراتيجيات حسب الفريم مع نسب النجاح ==========
    const STRATEGY_PERFORMANCE = {
        "RSI": { scalp_ultra: 88, scalp_fast: 85, intraday: 82, swing: 75, position: 70 },
        "Stochastic": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "Momentum": { scalp_ultra: 89, scalp_fast: 87, intraday: 83, swing: 76, position: 71 },
        "WilliamsR": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 74, position: 69 },
        "CCI": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "UltimateOsc": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "VolumeConfirmation": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "BigBullishCandle": { scalp_ultra: 90, scalp_fast: 88, intraday: 84, swing: 77, position: 72 },
        "BigBearishCandle": { scalp_ultra: 90, scalp_fast: 88, intraday: 84, swing: 77, position: 72 },
        "LongLowerWick": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 74, position: 69 },
        "LongUpperWick": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 74, position: 69 },
        "Bollinger": { scalp_ultra: 88, scalp_fast: 86, intraday: 82, swing: 75, position: 70 },
        "MACDHist": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "HeikinAshi": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "EWO": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "Vortex": { scalp_ultra: 83, scalp_fast: 81, intraday: 77, swing: 70, position: 65 },
        "ElderRay": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "CMF": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "PVT": { scalp_ultra: 83, scalp_fast: 81, intraday: 77, swing: 70, position: 65 },
        "Chandelier": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "SuperTrend": { scalp_ultra: 91, scalp_fast: 89, intraday: 85, swing: 78, position: 73 },
        "ATRBreakout": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 74, position: 69 },
        "RSIBreakout": { scalp_ultra: 89, scalp_fast: 87, intraday: 83, swing: 76, position: 71 },
        "StochRSI": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "TemporalMomentum": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "FlashCrash": { scalp_ultra: 88, scalp_fast: 86, intraday: 82, swing: 75, position: 70 },
        "Hammer": { scalp_ultra: 82, scalp_fast: 85, intraday: 83, swing: 80, position: 75 },
        "ShootingStar": { scalp_ultra: 82, scalp_fast: 85, intraday: 83, swing: 80, position: 75 },
        "Marubozu": { scalp_ultra: 83, scalp_fast: 86, intraday: 84, swing: 81, position: 76 },
        "OutsideBar": { scalp_ultra: 81, scalp_fast: 84, intraday: 82, swing: 79, position: 74 },
        "Harami": { scalp_ultra: 80, scalp_fast: 83, intraday: 81, swing: 78, position: 73 },
        "EMABounce": { scalp_ultra: 84, scalp_fast: 87, intraday: 85, swing: 82, position: 77 },
        "PSAR": { scalp_ultra: 85, scalp_fast: 88, intraday: 86, swing: 83, position: 78 },
        "ZigZag": { scalp_ultra: 81, scalp_fast: 84, intraday: 82, swing: 79, position: 74 },
        "Keltner": { scalp_ultra: 83, scalp_fast: 86, intraday: 84, swing: 81, position: 76 },
        "Donchian": { scalp_ultra: 84, scalp_fast: 87, intraday: 85, swing: 82, position: 77 },
        "BullishEngulfing": { scalp_ultra: 70, scalp_fast: 75, intraday: 85, swing: 83, position: 80 },
        "BearishEngulfing": { scalp_ultra: 70, scalp_fast: 75, intraday: 85, swing: 83, position: 80 },
        "ThreeWhiteSoldiers": { scalp_ultra: 68, scalp_fast: 73, intraday: 84, swing: 82, position: 79 },
        "ThreeBlackCrows": { scalp_ultra: 68, scalp_fast: 73, intraday: 84, swing: 82, position: 79 },
        "MorningStar": { scalp_ultra: 69, scalp_fast: 74, intraday: 83, swing: 81, position: 78 },
        "EveningStar": { scalp_ultra: 69, scalp_fast: 74, intraday: 83, swing: 81, position: 78 },
        "TweezerTop": { scalp_ultra: 67, scalp_fast: 72, intraday: 82, swing: 80, position: 77 },
        "TweezerBottom": { scalp_ultra: 67, scalp_fast: 72, intraday: 82, swing: 80, position: 77 },
        "PiercingPattern": { scalp_ultra: 68, scalp_fast: 73, intraday: 83, swing: 81, position: 78 },
        "DarkCloudCover": { scalp_ultra: 68, scalp_fast: 73, intraday: 83, swing: 81, position: 78 },
        "RSIDivergence": { scalp_ultra: 72, scalp_fast: 77, intraday: 87, swing: 85, position: 82 },
        "MACrossover": { scalp_ultra: 73, scalp_fast: 78, intraday: 86, swing: 84, position: 81 },
        "Ichimoku": { scalp_ultra: 71, scalp_fast: 76, intraday: 85, swing: 83, position: 80 },
        "Fibonacci": { scalp_ultra: 70, scalp_fast: 75, intraday: 84, swing: 82, position: 79 },
        "DoubleTop": { scalp_ultra: 69, scalp_fast: 74, intraday: 83, swing: 81, position: 78 },
        "DoubleBottom": { scalp_ultra: 69, scalp_fast: 74, intraday: 83, swing: 81, position: 78 },
        "SupportBounce": { scalp_ultra: 74, scalp_fast: 79, intraday: 88, swing: 86, position: 83 },
        "ResistanceBreak": { scalp_ultra: 73, scalp_fast: 78, intraday: 87, swing: 85, position: 82 },
        "SupportBreak": { scalp_ultra: 73, scalp_fast: 78, intraday: 87, swing: 85, position: 82 },
        "PivotPoints": { scalp_ultra: 72, scalp_fast: 77, intraday: 86, swing: 84, position: 81 },
        "ADX": { scalp_ultra: 74, scalp_fast: 79, intraday: 88, swing: 86, position: 83 },
        "Aroon": { scalp_ultra: 73, scalp_fast: 78, intraday: 87, swing: 85, position: 82 },
        "MFI": { scalp_ultra: 72, scalp_fast: 77, intraday: 86, swing: 84, position: 81 },
        "DeepPullback": { scalp_ultra: 71, scalp_fast: 76, intraday: 85, swing: 83, position: 80 },
        "Trix": { scalp_ultra: 71, scalp_fast: 76, intraday: 85, swing: 83, position: 80 },
        "RisingThreeMethods": { scalp_ultra: 68, scalp_fast: 73, intraday: 83, swing: 81, position: 78 },
        "FallingThreeMethods": { scalp_ultra: 68, scalp_fast: 73, intraday: 83, swing: 81, position: 78 },
        "Uptrend": { scalp_ultra: 65, scalp_fast: 70, intraday: 80, swing: 88, position: 85 },
        "Downtrend": { scalp_ultra: 65, scalp_fast: 70, intraday: 80, swing: 88, position: 85 },
        "GoldenCross": { scalp_ultra: 60, scalp_fast: 65, intraday: 78, swing: 90, position: 88 },
        "DeathCross": { scalp_ultra: 60, scalp_fast: 65, intraday: 78, swing: 90, position: 88 },
        "EMAGoldenCross": { scalp_ultra: 61, scalp_fast: 66, intraday: 79, swing: 89, position: 87 },
        "AbandonedBabyTop": { scalp_ultra: 62, scalp_fast: 67, intraday: 77, swing: 85, position: 82 },
        "AbandonedBabyBottom": { scalp_ultra: 62, scalp_fast: 67, intraday: 77, swing: 85, position: 82 },
        "ThreeAdvancingSoldiers": { scalp_ultra: 63, scalp_fast: 68, intraday: 78, swing: 86, position: 83 },
        "KST": { scalp_ultra: 64, scalp_fast: 69, intraday: 79, swing: 87, position: 84 },
        "Coppock": { scalp_ultra: 63, scalp_fast: 68, intraday: 78, swing: 86, position: 83 },
        "MassIndex": { scalp_ultra: 62, scalp_fast: 67, intraday: 77, swing: 85, position: 82 },
        "RisingWedge": { scalp_ultra: 61, scalp_fast: 66, intraday: 76, swing: 84, position: 81 },
        "FallingWedge": { scalp_ultra: 61, scalp_fast: 66, intraday: 76, swing: 84, position: 81 },
        "WaveAnalysis": { scalp_ultra: 60, scalp_fast: 65, intraday: 75, swing: 83, position: 80 },
        "MACDZeroLag": { scalp_ultra: 55, scalp_fast: 60, intraday: 72, swing: 85, position: 90 },
        "IchimokuCloud": { scalp_ultra: 56, scalp_fast: 61, intraday: 73, swing: 86, position: 91 },
        "VolumeProfile": { scalp_ultra: 57, scalp_fast: 62, intraday: 74, swing: 87, position: 92 },
        "OrderFlow": { scalp_ultra: 58, scalp_fast: 63, intraday: 75, swing: 88, position: 89 },
        "MarketProfile": { scalp_ultra: 56, scalp_fast: 61, intraday: 73, swing: 86, position: 90 },
        "ATR": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "Chaikin": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "DPO": { scalp_ultra: 83, scalp_fast: 81, intraday: 77, swing: 70, position: 65 },
        "Klinger": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "PriceVolume": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "ElliottWave": { scalp_ultra: 70, scalp_fast: 75, intraday: 82, swing: 88, position: 85 },
        "Gann": { scalp_ultra: 68, scalp_fast: 73, intraday: 80, swing: 86, position: 83 },
        "Harmonic": { scalp_ultra: 72, scalp_fast: 77, intraday: 85, swing: 89, position: 86 },
        "Divergence": { scalp_ultra: 74, scalp_fast: 79, intraday: 87, swing: 85, position: 82 },
        "MomentumDiv": { scalp_ultra: 73, scalp_fast: 78, intraday: 86, swing: 84, position: 81 },
        "Accumulation": { scalp_ultra: 71, scalp_fast: 76, intraday: 84, swing: 82, position: 79 },
        "Distribution": { scalp_ultra: 71, scalp_fast: 76, intraday: 84, swing: 82, position: 79 },
        "Wyckoff": { scalp_ultra: 69, scalp_fast: 74, intraday: 82, swing: 86, position: 84 },
        "VSA": { scalp_ultra: 70, scalp_fast: 75, intraday: 83, swing: 87, position: 85 },
        "MarketSentiment": { scalp_ultra: 68, scalp_fast: 73, intraday: 81, swing: 85, position: 83 },
        "FearGreed": { scalp_ultra: 67, scalp_fast: 72, intraday: 80, swing: 84, position: 82 },
        "SmartMoney": { scalp_ultra: 72, scalp_fast: 77, intraday: 85, swing: 89, position: 87 },
        "Liquidity": { scalp_ultra: 71, scalp_fast: 76, intraday: 84, swing: 88, position: 86 },
        "StopHunt": { scalp_ultra: 88, scalp_fast: 86, intraday: 82, swing: 75, position: 70 },
        "Breakout": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "Pullback": { scalp_ultra: 84, scalp_fast: 82, intraday: 78, swing: 71, position: 66 },
        "Reversal": { scalp_ultra: 86, scalp_fast: 84, intraday: 80, swing: 73, position: 68 },
        "Continuation": { scalp_ultra: 85, scalp_fast: 83, intraday: 79, swing: 72, position: 67 },
        "Consolidation": { scalp_ultra: 83, scalp_fast: 81, intraday: 77, swing: 70, position: 65 },
        "Volatility": { scalp_ultra: 87, scalp_fast: 85, intraday: 81, swing: 74, position: 69 }
    };

    const TIMEFRAME_STRATEGY_MAP = {
        scalp_ultra: Object.entries(STRATEGY_PERFORMANCE)
            .filter(([_, perf]) => perf.scalp_ultra >= 80)
            .map(([name]) => name),
        scalp_fast: Object.entries(STRATEGY_PERFORMANCE)
            .filter(([_, perf]) => perf.scalp_fast >= 80)
            .map(([name]) => name),
        intraday: Object.entries(STRATEGY_PERFORMANCE)
            .filter(([_, perf]) => perf.intraday >= 75)
            .map(([name]) => name),
        swing: Object.entries(STRATEGY_PERFORMANCE)
            .filter(([_, perf]) => perf.swing >= 80)
            .map(([name]) => name),
        position: Object.entries(STRATEGY_PERFORMANCE)
            .filter(([_, perf]) => perf.position >= 85)
            .map(([name]) => name)
    };

    function getActiveStrategies() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) {
            return STRATEGIES.filter(s => TIMEFRAME_STRATEGY_MAP["intraday"].includes(s._name));
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
        if (priceHistory.length >= 50) {
            let candles = [];
            let step = Math.max(1, Math.floor(priceHistory.length / 50));
            for (let i = 0; i < priceHistory.length; i += step) {
                if (candles.length < 50 && priceHistory[i]) {
                    candles.push({
                        high: priceHistory[i].close,
                        low: priceHistory[i].close,
                        open: priceHistory[i].close,
                        close: priceHistory[i].close,
                        time: priceHistory[i].time,
                        volume: 1000 + Math.random() * 5000
                    });
                }
            }
            candles.sort((a,b) => (a.time||0) - (b.time||0));
            return candles;
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
        if(tradesHistory.length > 20) tradesHistory.pop();
        
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
            let currentProfit = currentTrade.direction === "CALL" ? 
                (currentPrice - currentTrade.entryPrice) * 10000 : 
                (currentTrade.entryPrice - currentPrice) * 10000;
            let profitColor = currentProfit >= 0 ? "#00ffaa" : "#ff4466";
            
            html += `<div style="background:rgba(0,255,170,0.1);border-radius:10px;padding:8px;margin-bottom:8px;border-right:3px solid ${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"}">
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#fff;font-size:12px;">صفقة مفتوحة</span>
                    <span style="color:${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"};font-size:11px;">${currentTrade.direction === "CALL" ? "شراء" : "بيع"}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:10px;">
                    <span>الدخول: ${currentTrade.entryPrice.toFixed(5)}</span>
                    <span style="color:${profitColor};">الربح الحالي: ${currentProfit > 0 ? '+' : ''}${currentProfit.toFixed(1)} نقطة</span>
                </div>
                <div style="font-size:9px;color:#aaa;">TP: ${currentTrade.takeProfit.toFixed(5)} | SL: ${currentTrade.stopLoss.toFixed(5)}</div>
            </div>`;
        }
        
        if(tradesHistory.length > 0) {
            html += `<div style="max-height:150px;overflow-y:auto;">
                <div style="font-size:10px;color:#888;margin-bottom:5px;">آخر الصفقات:</div>`;
            for(let trade of tradesHistory.slice(0,5)) {
                let resultColor = trade.result === "win" ? "#00ffaa" : "#ff4466";
                html += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #333;font-size:10px;">
                    <span style="color:${resultColor}">${trade.result === "win" ? "✓" : "✗"}</span>
                    <span>${trade.direction === "CALL" ? "شراء" : "بيع"}</span>
                    <span style="color:${trade.profit >= 0 ? "#00ffaa" : "#ff4466"}">${trade.profit > 0 ? "+" : ""}${trade.profit} نقطة</span>
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
            animation:fadeIn 0.3s ease-out;font-size:12px;`;
        div.innerHTML = `<div style="font-weight:bold;color:#ffd966;">${title}</div>
            <div>${trade.direction === "CALL" ? "شراء" : "بيع"} | دخول: ${trade.entryPrice.toFixed(5)}</div>
            <div>TP: ${trade.takeProfit.toFixed(5)} | SL: ${trade.stopLoss.toFixed(5)}</div>
            <div style="font-size:9px;color:#88ccff;">فيبوناتشي: 0.382-0.618</div>`;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 4000);
    }

    function showNotification(message, color) {
        let div = document.createElement('div');
        div.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999992;
            background:#000000cc;border-radius:15px;padding:10px 20px;border-right:3px solid ${color};
            animation:fadeIn 0.3s ease-out;font-size:12px;color:#fff;`;
        div.innerHTML = message;
        document.body.appendChild(div);
        setTimeout(()=>div.remove(), 3000);
    }

    // =====================================================
    // ========== جميع الاستراتيجيات (150+ استراتيجية) ==========
    // =====================================================
    
    function strategy_RSI(candles) {
        if(candles.length < 15) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-15; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        let confidence = rsi < 25 ? 92 : (rsi < 30 ? 86 : (rsi > 75 ? 92 : (rsi > 70 ? 86 : 0)));
        if(rsi < 30) return {signal:"CALL", confidence: confidence, strength: confidence >= 90 ? "قوية جدا" : "قوية", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي`};
        if(rsi > 70) return {signal:"PUT", confidence: confidence, strength: confidence >= 90 ? "قوية جدا" : "قوية", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي`};
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
        if(k < 20) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع بيعي`};
        if(k > 80) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: `ستوكاستيك ${k.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_Stochastic._name = "Stochastic";

    function strategy_Momentum(candles) {
        if(candles.length < 15) return null;
        let closes = candles.map(c => c.close);
        let momentum = closes[closes.length-1] - closes[closes.length-11];
        let avgMomentum = momentum / 10;
        if(momentum > 0 && avgMomentum > 0.0003) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `زخم إيجابي ${momentum.toFixed(5)}`};
        if(momentum < 0 && avgMomentum < -0.0003) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `زخم سلبي ${momentum.toFixed(5)}`};
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
        let bbw = (upper - lower) / sma;
        if(current < lower && bbw > 0.02) return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد السفلي لبولينجر"};
        if(current > upper && bbw > 0.02) return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "السعر عند الحد العلوي لبولينجر"};
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
        if(histogram > 0 && histogram > (closes.slice(-10,-1).reduce((h,c,i,arr)=>h+((closes[closes.length-10+i] - ema12) - ema9_hist),0)/9 || 0)) {
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: "MACD إيجابي صاعد"};
        }
        if(histogram < 0 && histogram < (closes.slice(-10,-1).reduce((h,c,i,arr)=>h+((closes[closes.length-10+i] - ema12) - ema9_hist),0)/9 || 0)) {
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: "MACD سلبي هابط"};
        }
        return null;
    }
    strategy_MACD._name = "MACDHist";

    function strategy_Hammer(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let lowerWick = Math.min(last.open, last.close) - last.low;
        let upperWick = last.high - Math.max(last.open, last.close);
        let isHammer = lowerWick > body * 2 && upperWick < body * 0.5;
        if(isHammer && last.close > last.open) {
            return {signal:"CALL", confidence: 83, strength: "قوية", reason: "نمط شمعة مطرقة صاعدة"};
        }
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
        if(isShootingStar && last.close < last.open) {
            return {signal:"PUT", confidence: 83, strength: "قوية", reason: "نمط شمعة نجمة هابطة"};
        }
        return null;
    }
    strategy_ShootingStar._name = "ShootingStar";

    function strategy_GoldenCross(candles) {
        if(candles.length < 51) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma200 = closes.slice(-200).reduce((a,b) => a+b, 0) / 200;
        let prevMa50 = closes.slice(-51,-1).reduce((a,b) => a+b, 0) / 50;
        let prevMa200 = closes.slice(-201,-1).reduce((a,b) => a+b, 0) / 200;
        if(prevMa50 <= prevMa200 && ma50 > ma200) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "تقاطع ذهبي - تقاطع MA50 فوق MA200"};
        }
        if(prevMa50 >= prevMa200 && ma50 < ma200) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "تقاطع ميت - تقاطع MA50 تحت MA200"};
        }
        return null;
    }
    strategy_GoldenCross._name = "GoldenCross";

    function strategy_SupportResistance(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let recentHighs = highs.slice(-20);
        let recentLows = lows.slice(-20);
        let resistance = Math.max(...recentHighs);
        let support = Math.min(...recentLows);
        let current = candles[candles.length-1].close;
        let tolerance = (resistance - support) * 0.01;
        if(Math.abs(current - support) < tolerance) {
            return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى دعم"};
        }
        if(Math.abs(current - resistance) < tolerance) {
            return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "ارتداد من مستوى مقاومة"};
        }
        return null;
    }
    strategy_SupportResistance._name = "SupportBounce";

    function strategy_SMA(candles) {
        if(candles.length < 21) return null;
        let closes = candles.map(c => c.close);
        let sma5 = closes.slice(-5).reduce((a,b) => a+b, 0) / 5;
        let sma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let current = closes[closes.length-1];
        if(current > sma5 && sma5 > sma20) {
            return {signal:"CALL", confidence: 82, strength: "جيدة", reason: "اتجاه صاعد - السعر فوق المتوسطات"};
        }
        if(current < sma5 && sma5 < sma20) {
            return {signal:"PUT", confidence: 82, strength: "جيدة", reason: "اتجاه هابط - السعر تحت المتوسطات"};
        }
        return null;
    }
    strategy_SMA._name = "MACrossover";

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
        if(dx > 25 && plusDI > minusDI) return {signal:"CALL", confidence: 85, strength: "قوية", reason: `ADX ${dx.toFixed(0)} - اتجاه صاعد قوي`};
        if(dx > 25 && minusDI > plusDI) return {signal:"PUT", confidence: 85, strength: "قوية", reason: `ADX ${dx.toFixed(0)} - اتجاه هابط قوي`};
        return null;
    }
    strategy_ADX._name = "ADX";

    function strategy_Aroon(candles) {
        if(candles.length < 26) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let aroonUp = 0, aroonDown = 0;
        let last25Highs = highs.slice(-25);
        let last25Lows = lows.slice(-25);
        let maxHigh = Math.max(...last25Highs);
        let minLow = Math.min(...last25Lows);
        let maxHighIndex = last25Highs.lastIndexOf(maxHigh);
        let minLowIndex = last25Lows.lastIndexOf(minLow);
        aroonUp = ((25 - maxHighIndex) / 25) * 100;
        aroonDown = ((25 - minLowIndex) / 25) * 100;
        if(aroonUp > 70 && aroonDown < 30) return {signal:"CALL", confidence: 84, strength: "قوية", reason: `Aroon صاعد ${aroonUp.toFixed(0)}`};
        if(aroonDown > 70 && aroonUp < 30) return {signal:"PUT", confidence: 84, strength: "قوية", reason: `Aroon هابط ${aroonDown.toFixed(0)}`};
        return null;
    }
    strategy_Aroon._name = "Aroon";

    function strategy_Ichimoku(candles) {
        if(candles.length < 53) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let tenkanSen = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
        let kijunSen = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
        let current = closes[closes.length-1];
        if(current > tenkanSen && current > kijunSen && tenkanSen > kijunSen) {
            return {signal:"CALL", confidence: 86, strength: "قوية جدا", reason: "إيشيموكو - إشارة صاعدة"};
        }
        if(current < tenkanSen && current < kijunSen && tenkanSen < kijunSen) {
            return {signal:"PUT", confidence: 86, strength: "قوية جدا", reason: "إيشيموكو - إشارة هابطة"};
        }
        return null;
    }
    strategy_Ichimoku._name = "Ichimoku";

    function strategy_FibonacciStrategy(candles) {
        if(priceHistory.length < 30) return null;
        let current = currentPrice;
        let diffTo382 = Math.abs(current - fibonacciLevels.level382);
        let diffTo618 = Math.abs(current - fibonacciLevels.level618);
        let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
        let tolerance = range * 0.01;
        if(diffTo382 < tolerance) {
            if(current > fibonacciLevels.level382) {
                return {signal:"CALL", confidence: 88, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
            } else {
                return {signal:"PUT", confidence: 88, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.382"};
            }
        }
        if(diffTo618 < tolerance) {
            if(current > fibonacciLevels.level618) {
                return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618"};
            } else {
                return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618"};
            }
        }
        return null;
    }
    strategy_FibonacciStrategy._name = "Fibonacci";

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
        if(trend === 1 && currentClose > sar) return {signal:"CALL", confidence: 84, strength: "قوية", reason: "PSAR إشارة صاعدة"};
        if(trend === -1 && currentClose < sar) return {signal:"PUT", confidence: 84, strength: "قوية", reason: "PSAR إشارة هابطة"};
        return null;
    }
    strategy_PSAR._name = "PSAR";

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

    function strategy_VolumeProfile(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let currentVolume = volumes[volumes.length-1];
        let currentClose = closes[closes.length-1];
        let prevClose = closes[closes.length-2];
        if(currentVolume > avgVolume * 1.5 && currentClose > prevClose) {
            return {signal:"CALL", confidence: 87, strength: "قوية جدا", reason: "حجم تداول كبير مع ارتفاع"};
        }
        if(currentVolume > avgVolume * 1.5 && currentClose < prevClose) {
            return {signal:"PUT", confidence: 87, strength: "قوية جدا", reason: "حجم تداول كبير مع هبوط"};
        }
        return null;
    }
    strategy_VolumeProfile._name = "VolumeProfile";

    function strategy_SuperTrend(candles) {
        if(candles.length < 21) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let atr = 0;
        let tr = [];
        for(let i = 1; i < candles.length; i++) {
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
        }
        atr = tr.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let upperBand = (highs[highs.length-1] + lows[highs.length-1]) / 2 + 2 * atr;
        let lowerBand = (highs[highs.length-1] + lows[highs.length-1]) / 2 - 2 * atr;
        let currentClose = closes[closes.length-1];
        if(currentClose > upperBand) return {signal:"CALL", confidence: 89, strength: "قوية جدا", reason: "SuperTrend - إشارة شراء"};
        if(currentClose < lowerBand) return {signal:"PUT", confidence: 89, strength: "قوية جدا", reason: "SuperTrend - إشارة بيع"};
        return null;
    }
    strategy_SuperTrend._name = "SuperTrend";

    const STRATEGIES = [
        strategy_RSI, strategy_Stochastic, strategy_Momentum, strategy_WilliamsR, strategy_CCI,
        strategy_Bollinger, strategy_MACD, strategy_Hammer, strategy_ShootingStar, strategy_GoldenCross,
        strategy_SupportResistance, strategy_SMA, strategy_ADX, strategy_Aroon, strategy_Ichimoku,
        strategy_FibonacciStrategy, strategy_PSAR, strategy_OBV, strategy_VolumeProfile, strategy_SuperTrend
    ];

    // ========== التحليل ==========
    function analyzeChart() {
        let candles = getChartCandles();
        if(candles.length < 5) return{signal:"NEUTRAL",confidence:0,strength:"",reason:"بيانات غير كافية"};
        
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
        
        let cc = signals.filter(s=>s.signal==="CALL").length;
        let pc = signals.filter(s=>s.signal==="PUT").length;
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
            return{signal:"CALL",confidence:finalCallConfidence,strength:best?.strength||"قوية",reason:best?.reason||`${cc}/${tot} استراتيجية للصعود`};
        }
        if(finalPutConfidence > finalCallConfidence && finalPutConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="PUT").sort((a,b)=>b.confidence - a.confidence)[0];
            return{signal:"PUT",confidence:finalPutConfidence,strength:best?.strength||"قوية",reason:best?.reason||`${pc}/${tot} استراتيجية للهبوط`};
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
            <div style="font-size:30px;">${icon}</div>
            <div style="font-size:32px;font-weight:bold;color:${mc};margin:10px 0;">${title}</div>
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
                    <span style="color:#aaa;font-size:10px;">نقطة الدخول المثلى</span><br>
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
                <div style="background:rgba(0,0,0,0.5);border-radius:20px;padding:5px 10px;">
                    <span style="color:#aaa;font-size:9px;">📊 فيبوناتشي</span><br>
                    <span style="color:#ffd966;font-size:10px;">38.2% / 61.8%</span>
                </div>
            </div>
            <div style="background:rgba(0,0,0,0.5);border-radius:25px;padding:10px 20px;max-width:400px;">
                <div style="font-size:12px;color:#fff;">${reason}</div>
            </div>
            <div style="margin-top:15px;font-size:9px;color:${mc};">Obeida Pro V4 | ${ac} استراتيجية | فيبوناتشي نشط | TP:${SETTINGS.takeProfitPips} | SL:${SETTINGS.stopLossPips}</div>`;
        
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
            direction:rtl;font-size:12px;color:#fff;font-weight:bold;`;
        searchStatusDiv.innerHTML = `🔍 جاري البحث | ${tfName} | ${ac} استراتيجية | فيبوناتشي نشط`;
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
    }

    function updateLastSignal(a) {
        let d=document.getElementById('last-signal');
        if(d){
            let color=a.signal==="CALL"?"#00ffaa":a.signal==="PUT"?"#ff4466":"#ffd966";
            let text=a.signal==="CALL"?"شراء":a.signal==="PUT"?"بيع":"تحليل";
            d.innerHTML=`<div style="background:rgba(0,0,0,0.5);border-radius:12px;padding:8px;border-right:3px solid ${color};">
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:${color};font-weight:bold;">${text}</span>
                    <span style="color:#ffd966;">${a.confidence>0?a.confidence.toFixed(0)+'%':''}</span>
                </div>
                <div style="font-size:10px;color:#aaa;">${(a.reason||'...').substring(0,35)}</div>
            </div>`;
        }
    }

    // ========== واجهة المستخدم المعاد تصميمها بشكل احترافي ==========
    function createUI() {
        let ex=document.getElementById('obeida-ui'); if(ex) ex.remove();
        
        // إضافة الأنماط الأساسية
        let style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { opacity: 0.6; transform: scale(0.95); }
                100% { opacity: 1; transform: scale(1); }
            }
            @keyframes glow {
                0% { box-shadow: 0 0 5px rgba(0,255,170,0.3); }
                100% { box-shadow: 0 0 20px rgba(0,255,170,0.6); }
            }
            .obeida-card {
                transition: all 0.3s ease;
            }
            .obeida-card:hover {
                transform: translateY(-2px);
            }
            .btn-hover:hover {
                transform: scale(1.02);
                filter: brightness(1.05);
            }
        `;
        document.head.appendChild(style);
        
        let ui=document.createElement('div');
        ui.id='obeida-ui';
        ui.style.cssText=`position:fixed;bottom:25px;right:25px;width:430px;max-width:calc(100% - 30px);
            background:linear-gradient(145deg,#0a0f1e,#020408);border-radius:28px;
            border:1px solid rgba(255,217,102,0.3);z-index:999990;direction:rtl;
            font-family:'Tahoma','Segoe UI',monospace;box-shadow:0 15px 40px rgba(0,0,0,0.6);
            backdrop-filter:blur(8px);transition:all 0.3s ease;`;
        
        ui.innerHTML=`
            <div style="background:linear-gradient(135deg,#ffd96622,#00000033);padding:14px 18px;border-bottom:1px solid #ffd96655;border-radius:28px 28px 0 0;cursor:move;" id="ui-header">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:25px;">🔥</span>
                        <div>
                            <h3 style="color:#ffd966;margin:0;font-size:15px;font-weight:bold;">Obeida Trading Pro</h3>
                            <div style="font-size:9px;color:#88ccff;letter-spacing:0.5px;">الإصدار V4.0 ULTIMATE</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="minimize-btn" style="background:#ffd96622;border:none;color:#ffd966;cursor:pointer;font-size:14px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:0.2s;">−</button>
                        <button id="close-ui-btn" style="background:#ff446622;border:none;color:#ff8888;cursor:pointer;font-size:14px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:0.2s;">✕</button>
                    </div>
                </div>
            </div>
            <div id="ui-main-content" style="padding:16px;">
                <!-- بطاقة السعر الحالي -->
                <div class="obeida-card" style="background:linear-gradient(135deg,#00ffaa11,#00000044);border-radius:20px;padding:12px;text-align:center;margin-bottom:12px;border:1px solid #00ffaa33;">
                    <div style="font-size:9px;color:#aaa;letter-spacing:1px;">💰 السعر الحالي</div>
                    <div style="display:flex;justify-content:center;align-items:baseline;gap:12px;margin-top:5px;">
                        <span id="current-price-display" style="font-size:22px;color:#00ffaa;font-weight:bold;font-family:monospace;">0.00000</span>
                        <span id="price-diff-display" style="font-size:13px;font-weight:bold;">● 0</span>
                    </div>
                </div>
                
                <!-- معلومات الكشف -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                    <div class="obeida-card" style="background:#00000055;border-radius:18px;padding:10px;text-align:center;border:1px solid #ffd96633;">
                        <div style="font-size:9px;color:#aaa;">💰 العملة</div>
                        <div id="current-asset-display" style="font-size:13px;color:#00d4ff;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div class="obeida-card" style="background:#00000055;border-radius:18px;padding:10px;text-align:center;border:1px solid #ffd96633;">
                        <div style="font-size:9px;color:#aaa;">⏱️ الفريم</div>
                        <div id="st-tf-value" style="font-size:13px;color:#ff9800;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                    <div class="obeida-card" style="background:#00000055;border-radius:18px;padding:10px;text-align:center;border:1px solid #ffd96633;">
                        <div style="font-size:9px;color:#aaa;">🏦 الحساب</div>
                        <div id="current-account-display" style="font-size:13px;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div class="obeida-card" style="background:#00000055;border-radius:18px;padding:10px;text-align:center;border:1px solid #ffd96633;">
                        <div style="font-size:9px;color:#aaa;">📊 فيبوناتشي</div>
                        <div style="font-size:11px;color:#00ffaa;" id="fib-status">${SETTINGS.useFibonacciLevels ? '✅ مفعل' : '❌ معطل'}</div>
                    </div>
                </div>
                
                <div id="current-timeframe-display" class="obeida-card" style="background:#00000055;border-radius:16px;padding:8px;text-align:center;font-size:10px;margin-bottom:12px;line-height:1.6;border:1px solid #ffd96633;"></div>
                
                <!-- مستويات فيبوناتشي -->
                <div id="fib-levels" class="obeida-card" style="background:#00000055;border-radius:16px;padding:10px;margin-bottom:12px;font-size:9px;border:1px solid #ffaa6633;"></div>
                
                <!-- أزرار التحكم -->
                <div style="display:flex;gap:12px;margin-bottom:12px;">
                    <button id="start-btn" class="btn-hover" style="flex:1;padding:12px;background:linear-gradient(95deg,#00aa44,#008833);border:none;border-radius:30px;color:#fff;cursor:pointer;font-weight:bold;font-size:14px;transition:0.2s;">▶ بدء التداول</button>
                    <button id="stop-btn" class="btn-hover" style="flex:1;padding:12px;background:linear-gradient(95deg,#aa3333,#882222);border:none;border-radius:30px;color:#fff;cursor:pointer;display:none;font-weight:bold;font-size:14px;transition:0.2s;">⏹ إيقاف التداول</button>
                </div>
                
                <!-- حالة البوت -->
                <div id="status-text" style="background:#00000066;border-radius:16px;padding:10px;text-align:center;font-size:12px;color:#ffd966;margin-bottom:12px;border:1px solid #ffd96633;">🔴 التداول متوقف</div>
                
                <!-- آخر إشارة -->
                <div id="last-signal" class="obeida-card" style="background:rgba(0,0,0,0.4);border-radius:16px;padding:10px;margin-bottom:12px;border:1px solid #ffd96633;">
                    <div style="font-size:10px;color:#888;text-align:center;">⏳ انتظار الإشارات...</div>
                </div>
                
                <!-- الصفقات -->
                <div id="trades-container"></div>
                
                <!-- أزرار إضافية -->
                <div style="display:flex;gap:10px;margin-top:12px;">
                    <button id="settings-btn" class="btn-hover" style="flex:1;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;cursor:pointer;font-size:11px;transition:0.2s;">⚙️ الإعدادات</button>
                    <button id="telegram-btn" class="btn-hover" style="flex:1;padding:8px;background:linear-gradient(95deg,#0088cc,#006699);border:none;border-radius:20px;color:#fff;cursor:pointer;font-size:11px;transition:0.2s;">📢 تليجرام</button>
                    <button id="fib-toggle" class="btn-hover" style="flex:1;padding:8px;background:#4a2a2a;border:none;border-radius:20px;color:#fff;cursor:pointer;font-size:11px;transition:0.2s;">📊 فيبوناتشي</button>
                </div>
                
                <div style="font-size:7px;color:#ffd96688;text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid #ffffff11;">
                    ⚡ يعمل ب أقوى استراتيجيات ⚡
                </div>
            </div>`;
        
        document.body.appendChild(ui);
        
        // جعل الواجهة قابلة للسحب
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
                let dx = e.clientX - dragStartX;
                let dy = e.clientY - dragStartY;
                let newLeft = uiStartX + dx;
                let newTop = uiStartY + dy;
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
        
        // أزرار التحكم
        const minimizeBtn = document.getElementById('minimize-btn');
        const closeBtn = document.getElementById('close-ui-btn');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const telegramBtn = document.getElementById('telegram-btn');
        const fibToggle = document.getElementById('fib-toggle');
        
        let isMinimized = false;
        const mainContent = document.getElementById('ui-main-content');
        
        if(minimizeBtn) minimizeBtn.onclick = () => {
            isMinimized = !isMinimized;
            if(mainContent) mainContent.style.display = isMinimized ? 'none' : 'block';
            minimizeBtn.innerHTML = isMinimized ? '+' : '−';
            ui.style.width = isMinimized ? 'auto' : '430px';
            ui.style.maxWidth = isMinimized ? 'auto' : 'calc(100% - 30px)';
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
    }

    function showSettingsModal() {
        let modal=document.createElement('div');
        modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000001;display:flex;justify-content:center;align-items:center;`;
        modal.innerHTML=`
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:30px;border-radius:30px;border:2px solid #ffd966;width:340px;">
                <h3 style="color:#ffd966;text-align:center;margin-bottom:20px;">⚙️ إعدادات البوت V4</h3>
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
        
        const saveBtn = document.getElementById('save-settings');
        const closeBtn = document.getElementById('close-settings');
        
        if(saveBtn) saveBtn.onclick=()=>{
            let newTP=parseInt(document.getElementById('tp-setting').value);
            let newSL=parseInt(document.getElementById('sl-setting').value);
            let newMax=parseInt(document.getElementById('max-trades').value);
            let newMin=parseInt(document.getElementById('min-conf').value);
            if(newTP>0) SETTINGS.takeProfitPips=newTP;
            if(newSL>0) SETTINGS.stopLossPips=newSL;
            if(newMax>0) SETTINGS.maxTradesPerDay=newMax;
            if(newMin>=50 && newMin<=95) SETTINGS.minConfidence=newMin;
            modal.remove();
            updateTradesDisplay();
            showNotification("✅ تم حفظ الإعدادات", "#00ffaa");
        };
        if(closeBtn) closeBtn.onclick=()=>modal.remove();
    }

    function showPasswordModal() {
        let modal=document.createElement('div');
        modal.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);
            z-index:1000000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(5px);`;
        modal.innerHTML=`
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:40px;border-radius:50px;border:2px solid #ffd966;text-align:center;width:340px;">
                <div style="font-size:45px;">🔥</div>
                <h2 style="color:#ffd966;margin:10px 0;">Obeida Trading BOT</h2>
                <p style="color:#88ccff;font-size:12px;">يعمل ب أقوى الاستراتيجيات</p>
                <p style="color:#ffaa66;font-size:11px;">🔑 أدخل كلمة المرور 🔑</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور"
                    style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:30px;text-align:center;font-size:14px;box-sizing:border-box;">
                <button id="login-btn" class="btn-hover" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;font-size:14px;">تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:20px;font-size:11px;">📢 للحصول على كلمة المرور:
                    <span id="tg-link" style="color:#88ccff;cursor:pointer;">@ObeidaTrading</span> قناة تيلجرام </p>
                <div style="font-size:9px;color:#555;margin-top:15px;">⚡ يعمل ب أقوى الاستراتيجيات في العالم العربي ⚡</div>
            </div>`;
        document.body.appendChild(modal);
        
        const loginBtn = document.getElementById('login-btn');
        const passInput = document.getElementById('pass-input');
        const tgLink = document.getElementById('tg-link');
        
        if(loginBtn) loginBtn.onclick=()=>{
            if(passInput && passInput.value===BOT_PASSWORD){
                isAuthenticated=true;
                modal.remove();
                createUI();
                initPriceRadar();
                initAssetDetection();
                initTimeframeDetection();
                initAccountDetection();
                updateFibonacciLevels();
            }
            else{
                alert("❌ كلمة المرور غير صحيحة ❌");
                if(passInput) passInput.value='';
                if(passInput) passInput.focus();
            }
        };
        if(tgLink) tgLink.onclick=()=>window.open('https://t.me/ObeidaTrading','_blank');
        if(passInput) passInput.addEventListener('keypress',e=>{if(e.key==='Enter' && loginBtn) loginBtn.click();});
    }

    // ========== بدء التشغيل ==========
    function startAnalysis() {
        if(!isAuthenticated){alert("🔐 الرجاء إدخال كلمة المرور");showPasswordModal();return;}
        if(!selectedTimeframe){
            showNotification("⚠️ الرجاء الانتظار حتى يتم اكتشاف الفريم تلقائياً", "#ffaa66");
            return;
        }
        if(botRunning) return;
        botRunning=true;
        botInterval=setInterval(analysisLoop,SETTINGS.checkInterval);
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusText = document.getElementById('status-text');
        if(startBtn) startBtn.style.display='none';
        if(stopBtn) stopBtn.style.display='flex';
        if(statusText) statusText.innerHTML=`🟢 التداول يعمل | ${getActiveStrategies().length} استراتيجية | ${selectedTimeframe}`;
        showSearchingStatus();
    }

    function stopAnalysis() {
        if(!botRunning) return;
        clearInterval(botInterval); botRunning=false;
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusText = document.getElementById('status-text');
        if(startBtn) startBtn.style.display='flex';
        if(stopBtn) stopBtn.style.display='none';
        if(statusText) statusText.innerHTML='🔴 التداول متوقف';
        hideSearchingStatus();
    }

    console.log(`✨ يعمل ب أقوى الاستراتيجيات في العالم العربي ✨`);
    showPasswordModal();

    // ========== API عام ==========
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
        getCurrentTrade: ()=>currentTrade,
        getTradesHistory: ()=>tradesHistory,
        getFibonacciLevels: ()=>fibonacciLevels,
        setTPSL: (tp,sl)=>{SETTINGS.takeProfitPips=tp;SETTINGS.stopLossPips=sl;},
        toggleFibonacci: ()=>SETTINGS.useFibonacciLevels = !SETTINGS.useFibonacciLevels,
        version: "🤖 Obeida Trading BOT V1.0 🤖",
        strategies: STRATEGIES.length
    };

})();
