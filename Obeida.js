(function(){
    'use strict';

    // ========== كلمة المرور ==========
    const BOT_PASSWORD = "@ObeidaTrading";
    let isAuthenticated = false;

    // ========== إعدادات ==========
    const SETTINGS = {
        checkInterval: 500, // فحص كل نصف ثانية بدلاً من 3 ثوانٍ (للسكالبينج)
        signalDuration: 3000, // مدة عرض الإشارة 3 ثواني فقط
        minConfidence: 82, // رفع دقة الفلتر لضمان نسبة الـ 80%
        takeProfitPips: 80,
        stopLossPips: 35,
        maxTradesPerDay: 8,
        useFibonacciLevels: true,
        useSmartEntry: true,
        useMultiTimeframeConfirm: true,
        useSupplyDemand: true,
        autoExecuteTrades: true
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
    let lastExecutedSignal = null;
    let lastSignalPrice = 0; // لمنع تكرار الإشارات
    let lastTradeInfo = { // ذاكرة لمنع تكرار الصفقات في نفس المنطقة
        candleId: null,
        asset: null,
        type: null,
        entryPrice: 0
    };
    
    // ========== متغيرات الكشف التلقائي ==========
    let currentAsset = "🔄 جاري الكشف...";
    let currentAccountType = "🔄 جاري الكشف...";
    let currentTimeframeAuto = "🔄 جاري الكشف...";
    let lastAccountType = "";
    let currentLiquidity = "100%";
    
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
    let liquidityObserver = null;
    let lastAsset = "";
    let lastTimeframe = "";

    // ========== الفريمات المدعومة ==========
    const TIMEFRAMES = {
        "5s":  { seconds: 5,     waitSeconds: 5,      name: "5 ثوان",   category: "scalp_ultra", weight: 0.70, order: 1 },
        "10s": { seconds: 10,    waitSeconds: 5,      name: "10 ثوان",  category: "scalp_ultra", weight: 0.72, order: 2 },
        "15s": { seconds: 15,    waitSeconds: 5,      name: "15 ثانية", category: "scalp_ultra", weight: 0.75, order: 3 },
        "30s": { seconds: 30,    waitSeconds: 5,      name: "30 ثانية", category: "scalp_ultra", weight: 0.78, order: 4 },
        "1m":  { seconds: 60,    waitSeconds: 10,     name: "1 دقيقة",  category: "scalp_fast",  weight: 0.82, order: 5 },
        "2m":  { seconds: 120,   waitSeconds: 15,     name: "2 دقائق",  category: "scalp_fast",  weight: 0.85, order: 6 },
        "3m":  { seconds: 180,   waitSeconds: 20,     name: "3 دقائق",  category: "scalp_fast",  weight: 0.87, order: 7 },
        "5m":  { seconds: 300,   waitSeconds: 30,     name: "5 دقائق",  category: "intraday",    weight: 0.90, order: 8 },
        "10m": { seconds: 600,   waitSeconds: 60,     name: "10 دقائق", category: "intraday",    weight: 0.92, order: 9 },
        "15m": { seconds: 900,   waitSeconds: 90,     name: "15 دقيقة", category: "intraday",    weight: 0.94, order: 10 },
        "30m": { seconds: 1800,  waitSeconds: 180,    name: "30 دقيقة", category: "intraday",    weight: 0.95, order: 11 },
        "1h":  { seconds: 3600,  waitSeconds: 300,    name: "1 ساعة",   category: "swing",       weight: 0.96, order: 12 },
        "4h":  { seconds: 14400, waitSeconds: 600,    name: "4 ساعات",  category: "swing",       weight: 0.95, order: 13 },
        "1d":  { seconds: 86400, waitSeconds: 1800,   name: "يومي",     category: "position",    weight: 0.93, order: 14 }
    };

    // =====================================================
    // ========== أقوى 25 بصمة رقمية للشموع (Candle Signatures) ==========
    // =====================================================
    
    const CANDLE_SIGNATURES = {
        // أولاً: شموع الرفض والانعكاس (أقوى 10)
        SNIPER_PINBAR: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return (lowerWick >= body * 3) && (upperWick <= total * 0.1);
        },
        INVERTED_SNIPER: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (upperWick >= body * 3) && (lowerWick <= total * 0.1);
        },
        DRAGONFLY_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (body <= total * 0.05) && (lowerWick >= total * 0.9);
        },
        GRAVESTONE_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return (body <= total * 0.05) && (upperWick >= total * 0.9);
        },
        LONG_LEGGED_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (Math.abs(upperWick - lowerWick) <= total * 0.1) && (body <= total * 0.05);
        },
        BULLISH_REJECTION: (c) => {
            const body = Math.abs(c.close - c.open);
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return lowerWick > (upperWick + body) * 2;
        },
        BEARISH_REJECTION: (c) => {
            const body = Math.abs(c.close - c.open);
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return upperWick > (lowerWick + body) * 2;
        },
        SHAVED_HEAD: (c) => {
            return c.close > c.open && c.high === c.close;
        },
        SHAVED_BOTTOM: (c) => {
            return c.close < c.open && c.low === c.close;
        },
        TWEEZER_BOTTOM: (c, prev) => {
            if(!prev) return false;
            const body = Math.abs(c.close - c.open);
            const prevBody = Math.abs(prev.close - prev.open);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const prevLowerWick = Math.min(prev.open, prev.close) - prev.low;
            return Math.abs(c.low - prev.low) <= 0.00001 && lowerWick > body && prevLowerWick > prevBody;
        },
        
        // ثانياً: شموع الزخم والقوة المؤسساتية (أقوى 8)
        INSTITUTIONAL_MARUBOZU: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            return body >= total * 0.95;
        },
        FULL_ENGULFING: (c, prev) => {
            if(!prev) return false;
            return c.high > prev.high && c.low < prev.low && c.close > prev.high;
        },
        ELEPHANT_BAR: (c, avgBody) => {
            const body = Math.abs(c.close - c.open);
            return body >= avgBody * 3;
        },
        THREE_WHITE_SOLDIERS: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const body1 = Math.abs(c1.close - c1.open);
            const body2 = Math.abs(c2.close - c2.open);
            const body3 = Math.abs(c3.close - c3.open);
            const total1 = c1.high - c1.low;
            const total2 = c2.high - c2.low;
            const total3 = c3.high - c3.low;
            return (c1.close > c1.open && c2.close > c2.open && c3.close > c3.open) &&
                   (c2.close > c1.close && c3.close > c2.close) &&
                   ((c1.high - Math.max(c1.open, c1.close)) / total1 < 0.1) &&
                   ((c2.high - Math.max(c2.open, c2.close)) / total2 < 0.1) &&
                   ((c3.high - Math.max(c3.open, c3.close)) / total3 < 0.1);
        },
        THREE_BLACK_CROWS: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const body1 = Math.abs(c1.close - c1.open);
            const body2 = Math.abs(c2.close - c2.open);
            const body3 = Math.abs(c3.close - c3.open);
            const total1 = c1.high - c1.low;
            const total2 = c2.high - c2.low;
            const total3 = c3.high - c3.low;
            return (c1.close < c1.open && c2.close < c2.open && c3.close < c3.open) &&
                   (c2.close < c1.close && c3.close < c2.close) &&
                   ((Math.min(c1.open, c1.close) - c1.low) / total1 < 0.1) &&
                   ((Math.min(c2.open, c2.close) - c2.low) / total2 < 0.1) &&
                   ((Math.min(c3.open, c3.close) - c3.low) / total3 < 0.1);
        },
        KICKING_PATTERN: (c, prev) => {
            if(!prev) return false;
            const prevBody = Math.abs(prev.close - prev.open);
            const prevTotal = prev.high - prev.low;
            const isPrevMarubozu = prevBody >= prevTotal * 0.95;
            const isGapUp = c.low > prev.high;
            const isCurrentBullish = c.close > c.open;
            return isPrevMarubozu && isGapUp && isCurrentBullish;
        },
        PIERCING_LINE: (c, prev) => {
            if(!prev) return false;
            const prevMidPoint = (prev.open + prev.close) / 2;
            return c.close > prevMidPoint && prev.close < prev.open && c.close > c.open;
        },
        
        // ثالثاً: شموع الفخاخ والسيولة (أقوى 7)
        LIQUIDITY_SWEEP: (c, recentLows) => {
            const minLow = Math.min(...recentLows);
            return c.low < minLow && c.close > minLow;
        },
        SPRING_CANDLE: (c, support) => {
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return c.low < support && c.close > support && (lowerWick / total) >= 0.7;
        },
        UPTHRUST: (c, resistance) => {
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return c.high > resistance && c.close < resistance && (upperWick / total) >= 0.7;
        },
        INSIDE_BAR_BREAKOUT: (c, prev) => {
            if(!prev) return false;
            const isInside = c.high <= prev.high && c.low >= prev.low;
            const isBreakout = c.high > prev.high;
            return isInside && isBreakout;
        },
        NR7: (c, prevCandles) => {
            const currentTotal = c.high - c.low;
            for(let pc of prevCandles) {
                if((pc.high - pc.low) < currentTotal) return false;
            }
            return true;
        },
        EXHAUSTION_BAR: (c, avgTotal, trend) => {
            const total = c.high - c.low;
            return total > avgTotal * 4;
        },
        FAIR_VALUE_GAP_STARTER: (c, prev, prev2) => {
            if(!prev || !prev2) return false;
            return c.low > prev.high && prev.low > prev2.high;
        }
    };
    
    // =====================================================
    // ========== الاستراتيجيات المحسّنة (120+ استراتيجية) بنسبة ثقة 90%+ ==========
    // =====================================================

    // ----- أولاً: سكالبينج فائق السرعة (Ultra Scalp) - إطار 5ث/1د -----
    
    // Micro-Gap Fill
    function strategy_MicroGapFill(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let gap = Math.abs(curr.open - prev.close);
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        let body = Math.abs(curr.close - curr.open);
        if(gap > 0.0002 && lowerWick > body * 3 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "CALL")) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Micro-Gap Fill + ارتداد من فجوة", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_MicroGapFill._name = "Micro-Gap Fill";
    strategy_MicroGapFill.category = "scalp_ultra";
    
    // Tick Volume Spike
    function strategy_TickVolumeSpike(candles) {
        if(candles.length < 21) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(currentVol >= avgVol * 3 && curr.close > candles[candles.length-2].high && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Tick Volume Spike + اختراق", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TickVolumeSpike._name = "Tick Volume Spike";
    strategy_TickVolumeSpike.category = "scalp_ultra";
    
    // 5-Sec Momentum Burst
    function strategy_MomentumBurst(candles) {
        if(candles.length < 15) return null;
        let atr = calculateATR(candles, 14);
        let curr = candles[candles.length-1];
        let momentum = (curr.close - curr.open) / 5;
        let rsi = calculateRSI(candles, 7);
        if(momentum > atr * 0.5 && rsi > 70 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "Momentum Burst + RSI قوي", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MomentumBurst._name = "5-Sec Momentum Burst";
    strategy_MomentumBurst.category = "scalp_ultra";
    
    // Order Flow Scalp
    function strategy_OrderFlowScalp(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-1];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-3];
        let tolerance = 0.00001;
        if(Math.abs(c1.low - c2.low) < tolerance && Math.abs(c2.low - c3.low) < tolerance) {
            let total = c1.high - c1.low;
            let body = Math.abs(c1.close - c1.open);
            if(total / body > 4 && checkLiquidity()) {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Order Flow - قاع ثلاثي", candlePattern: "BULLISH_REJECTION"};
            }
        }
        return null;
    }
    strategy_OrderFlowScalp._name = "Order Flow Scalp";
    strategy_OrderFlowScalp.category = "scalp_ultra";
    
    // Fast SMA Bounce
    function strategy_FastSMABounce(candles) {
        if(candles.length < 6) return null;
        let closes = candles.map(c => c.close);
        let sma5 = closes.slice(-5).reduce((a,b) => a+b, 0) / 5;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let sma5Prev = closes.slice(-6, -1).reduce((a,b) => a+b, 0) / 5;
        let slope = sma5 - sma5Prev;
        if(curr.low <= sma5 && curr.close > sma5 && slope > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "ارتداد من SMA 5 + ميل إيجابي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_FastSMABounce._name = "Fast SMA Bounce";
    strategy_FastSMABounce.category = "scalp_ultra";
    
    // V-Shape Recovery
    function strategy_VShapeRecovery(candles) {
        if(candles.length < 6) return null;
        let atr = calculateATR(candles, 14);
        let prices = candles.map(c => c.close);
        let priceDrop = prices[candles.length-5] - Math.min(...prices.slice(-5));
        let curr = candles[candles.length-1];
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        let total = curr.high - curr.low;
        if(priceDrop > atr * 3 && (lowerWick / total) > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "V-Shape Recovery + PinBar", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_VShapeRecovery._name = "V-Shape Recovery";
    strategy_VShapeRecovery.category = "scalp_ultra";
    
    // Flash Breakout
    function strategy_FlashBreakout(candles) {
        if(candles.length < 11) return null;
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let range10 = Math.max(...candles.slice(-10).map(c => c.high)) - Math.min(...candles.slice(-10).map(c => c.low));
        let curr = candles[candles.length-1];
        let body = Math.abs(curr.close - curr.open);
        let total = curr.high - curr.low;
        if(range10 < avgBody * 2 && (body / total) > 0.95 && curr.close > Math.max(...candles.slice(-10).map(c => c.high)) && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Flash Breakout - Marubozu يكسر القمة", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FlashBreakout._name = "Flash Breakout";
    strategy_FlashBreakout.category = "scalp_ultra";
    
    // Micro-Rejection
    function strategy_MicroRejection(candles) {
        if(candles.length < 2) return null;
        let resistance = getResistanceLevel(candles);
        let curr = candles[candles.length-1];
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        let body = Math.abs(curr.close - curr.open);
        if(Math.abs(curr.high - resistance) < 0.0001 && upperWick > body * 2 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "Micro-Rejection من مقاومة", candlePattern: "INVERTED_SNIPER"};
        }
        return null;
    }
    strategy_MicroRejection._name = "Micro-Rejection";
    strategy_MicroRejection.category = "scalp_ultra";
    
    // Instant Imbalance
    function strategy_InstantImbalance(candles) {
        if(candles.length < 2) return null;
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let curr = candles[candles.length-1];
        let next = candles[candles.length-2];
        let body = Math.abs(curr.close - curr.open);
        let midPoint = (next.open + next.close) / 2;
        if(body > avgBody * 4 && next.open > midPoint && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Instant Imbalance - اختلال لحظي", candlePattern: "ELEPHANT_BAR"};
        }
        return null;
    }
    strategy_InstantImbalance._name = "Instant Imbalance";
    strategy_InstantImbalance.category = "scalp_ultra";
    
    // Scalp-X Velocity
    function strategy_ScalpXVelocity(candles) {
        if(candles.length < 2) return null;
        let speed = Math.abs(currentPrice - candles[candles.length-2].close) * 1000;
        let adx = calculateADX(candles, 14);
        if(speed > 2 && adx > 30 && checkLiquidity()) {
            let direction = currentPrice > candles[candles.length-2].close ? "CALL" : "PUT";
            let confidence = 92;
            let reason = direction === "CALL" ? "سرعة صاعدة + ADX قوي" : "سرعة هابطة + ADX قوي";
            return {signal: direction, confidence: confidence, strength: "قوية", reason: reason, candlePattern: direction === "CALL" ? "INSTITUTIONAL_MARUBOZU" : "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_ScalpXVelocity._name = "Scalp-X Velocity";
    strategy_ScalpXVelocity.category = "scalp_ultra";
    
    // Pivot Point Quick
    function strategy_PivotPointQuick(candles) {
        if(candles.length < 2) return null;
        let pivot = calculatePivotS1(candles);
        let curr = candles[candles.length-1];
        let stoch = calculateStochastic(candles);
        if(curr.low <= pivot && curr.close > pivot && stoch < 20 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "ارتداد من Pivot S1 + ستوكاستيك", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_PivotPointQuick._name = "Pivot Point Quick";
    strategy_PivotPointQuick.category = "scalp_ultra";
    
    // Secondary Trend Scalp
    function strategy_SecondaryTrendScalp(candles) {
        if(candles.length < 2) return null;
        let trend = getTrend(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        if(trend === "BULLISH" && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "اتجاه صاعد + انفجار حجم", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SecondaryTrendScalp._name = "Secondary Trend Scalp";
    strategy_SecondaryTrendScalp.category = "scalp_ultra";
    
    // ----- ثانياً: سكالبينج سريع (Fast Scalp) - إطار 1د -----
    
    // Bollinger Squeeze
    function strategy_BollingerSqueeze(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let upper = sma + 2 * std;
        let lower = sma - 2 * std;
        let bbw = (upper - lower) / sma;
        let curr = candles[candles.length-1];
        if(bbw < 0.001 && curr.close > upper && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Bollinger Squeeze انفجار لأعلى", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BollingerSqueeze._name = "Bollinger Squeeze";
    strategy_BollingerSqueeze.category = "scalp_fast";
    
    // RSI 20/80 Reverse with Divergence
    function strategy_RSIReverse(candles) {
        if(candles.length < 30) return null;
        let rsi = calculateRSI(candles, 14);
        let closes = candles.map(c => c.close);
        let rsiValues = [];
        for(let i = 25; i < candles.length; i++) {
            let slice = candles.slice(i-25, i);
            rsiValues.push(calculateRSI(slice, 14));
        }
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        let lastRSI = rsiValues[rsiValues.length-1];
        let prevRSI = rsiValues[rsiValues.length-6];
        if(rsi < 20 && prevPrice > lastPrice && prevRSI < lastRSI && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "RSI تشبع بيعي + دايفرجنس إيجابي", candlePattern: "BULLISH_REJECTION"};
        }
        if(rsi > 80 && prevPrice < lastPrice && prevRSI > lastRSI && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "RSI تشبع شرائي + دايفرجنس سلبي", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_RSIReverse._name = "RSI 20/80 Reverse";
    strategy_RSIReverse.category = "scalp_fast";
    
    // Stochastic Cross-Fast
    function strategy_StochasticCrossFast(candles) {
        if(candles.length < 15) return null;
        let stoch = calculateStochasticFull(candles);
        let ema50 = calculateEMA(candles, 50);
        let ema50Prev = calculateEMAPrev(candles, 50);
        if(stoch.k < 20 && stoch.k > stoch.d && stoch.kPrev < stoch.dPrev && ema50 > ema50Prev && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "تقاطع ستوكاستيك + EMA إيجابي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_StochasticCrossFast._name = "Stochastic Cross-Fast";
    strategy_StochasticCrossFast.category = "scalp_fast";
    
    // Engulfing Confirmation
    function strategy_EngulfingConfirmation(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(curr.close - curr.open);
        let prevBody = Math.abs(prev.close - prev.open);
        if(curr.close > prev.high && body > prevBody * 2 && curr.close > curr.open && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ابتلاع صاعد مؤكد", candlePattern: "FULL_ENGULFING"};
        }
        return null;
    }
    strategy_EngulfingConfirmation._name = "Engulfing Confirmation";
    strategy_EngulfingConfirmation.category = "scalp_fast";
    
    // Pin Bar Sniper
    function strategy_PinBarSniper(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        if(lowerWick >= total * 0.7 && upperWick <= total * 0.1 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Pin Bar Sniper - ارتداد قوي", candlePattern: "SNIPER_PINBAR"};
        }
        if(upperWick >= total * 0.7 && lowerWick <= total * 0.1 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: "Pin Bar Sniper - رفض قوي", candlePattern: "INVERTED_SNIPER"};
        }
        return null;
    }
    strategy_PinBarSniper._name = "Pin Bar Sniper";
    strategy_PinBarSniper.category = "scalp_fast";
    
    // EMA 9/21 Pullback
    function strategy_EMAPullback(candles) {
        if(candles.length < 22) return null;
        let ema9 = calculateEMA(candles, 9);
        let ema21 = calculateEMA(candles, 21);
        let curr = candles[candles.length-1];
        if(curr.low <= ema9 && curr.close > ema9 && ema9 > ema21 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "ارتداد من EMA 9 في ترند صاعد", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_EMAPullback._name = "EMA 9/21 Pullback";
    strategy_EMAPullback.category = "scalp_fast";
    
    // Support Flip
    function strategy_SupportFlip(candles) {
        if(candles.length < 2) return null;
        let resistance = getResistanceLevel(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        if(Math.abs(curr.high - resistance) < 0.0001 && upperWick > total * 0.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 91, strength: "قوية", reason: "تحول الدعم لمقاومة + رفض", candlePattern: "INVERTED_SNIPER"};
        }
        return null;
    }
    strategy_SupportFlip._name = "Support Flip";
    strategy_SupportFlip.category = "scalp_fast";
    
    // M1 Trend Rider
    function strategy_TrendRider(candles) {
        if(candles.length < 51) return null;
        let ema50 = calculateEMA(candles, 50);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        if(curr.close > ema50 && volumes[volumes.length-1] > volumes[volumes.length-2] && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "فوق EMA 50 + حجم متزايد", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TrendRider._name = "M1 Trend Rider";
    strategy_TrendRider.category = "scalp_fast";
    
    // Double Bottom Scalp
    function strategy_DoubleBottomScalp(candles) {
        if(candles.length < 20) return null;
        let lows = candles.map(c => c.low);
        let recentLows = lows.slice(-20);
        let min1 = Math.min(...recentLows.slice(0, -10));
        let min2 = Math.min(...recentLows.slice(-10));
        let macd = calculateMACD(candles);
        if(Math.abs(min1 - min2) < 0.0001 && macd.hist > macd.prevHist && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "قاع مزدوج + MACD إيجابي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_DoubleBottomScalp._name = "Double Bottom Scalp";
    strategy_DoubleBottomScalp.category = "scalp_fast";
    
    // Channel Break
    function strategy_ChannelBreak(candles) {
        if(candles.length < 20) return null;
        let highs = candles.map(c => c.high);
        let upperChannel = highs.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let rsi = calculateRSI(candles, 14);
        let curr = candles[candles.length-1];
        if(curr.close > upperChannel && rsi < 70 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "اختراق قناة + RSI غير مشبع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ChannelBreak._name = "Channel Break";
    strategy_ChannelBreak.category = "scalp_fast";
    
    // Volume Profile Quick
    function strategy_VolumeProfileQuick(candles) {
        if(candles.length < 2) return null;
        let poc = calculatePOC(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(curr.close > poc && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "فوق POC + حجم مرتفع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_VolumeProfileQuick._name = "Volume Profile Quick";
    strategy_VolumeProfileQuick.category = "scalp_fast";
    
    // MACD Zero Cross
    function strategy_MACDZeroCross(candles) {
        if(candles.length < 27) return null;
        let macd = calculateMACD(candles);
        let ema20 = calculateEMA(candles, 20);
        let curr = candles[candles.length-1];
        if(macd.macd > 0 && macd.prevMacd <= 0 && curr.close > ema20 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "MACD يعبر الصفر + فوق EMA20", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MACDZeroCross._name = "MACD Zero Cross";
    strategy_MACDZeroCross.category = "scalp_fast";
    
    // ----- ثالثاً: تداول يومي (Intraday) - إطار 5د/15د -----
    
    // London Open Breakout
    function strategy_LondonOpenBreakout(candles) {
        if(candles.length < 2) return null;
        let currentHour = new Date().getUTCHours();
        if(currentHour === 8) {
            let range = calculateOpeningRange(candles, 15);
            let curr = candles[candles.length-1];
            if(curr.close > range.high && checkLiquidity()) {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "London Open Breakout", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            }
        }
        return null;
    }
    strategy_LondonOpenBreakout._name = "London Open Breakout";
    strategy_LondonOpenBreakout.category = "intraday";
    
    // Daily VWAP Bounce
    function strategy_VWAPBounce(candles) {
        if(candles.length < 2) return null;
        let vwap = calculateVWAP(candles);
        let curr = candles[candles.length-1];
        let vwapSlope = vwap - calculateVWAPPrev(candles);
        if(curr.low <= vwap && curr.close > vwap && vwapSlope > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "ارتداد من VWAP + ميل إيجابي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_VWAPBounce._name = "Daily VWAP Bounce";
    strategy_VWAPBounce.category = "intraday";
    
    // Golden Zone Fib
    function strategy_GoldenZoneFib(candles) {
        if(priceHistory.length < 50) return null;
        let retracement = calculateFibRetracement(candles);
        let curr = candles[candles.length-1];
        let isBullishEngulfing = CANDLE_SIGNATURES.FULL_ENGULFING(curr, candles[candles.length-2]);
        if(Math.abs(retracement - 0.618) < 0.05 && isBullishEngulfing && checkLiquidity()) {
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "منطقة فيبوناتشي الذهبية + ابتلاع صاعد", candlePattern: "FULL_ENGULFING"};
        }
        return null;
    }
    strategy_GoldenZoneFib._name = "Golden Zone Fib";
    strategy_GoldenZoneFib.category = "intraday";
    
    // Demand Zone Entry
    function strategy_DemandZoneEntry(candles) {
        if(demandZones.length === 0) return null;
        let demandZone = getNearestDemandZone(currentPrice);
        let rsi = calculateRSI(candles, 14);
        if(demandZone && currentPrice >= demandZone.price && currentPrice <= demandZone.high && rsi < 30 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "دخول من منطقة طلب + RSI تشبع بيعي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_DemandZoneEntry._name = "Demand Zone Entry";
    strategy_DemandZoneEntry.category = "intraday";
    
    // Supply Zone Exit
    function strategy_SupplyZoneExit(candles) {
        if(supplyZones.length === 0) return null;
        let supplyZone = getNearestSupplyZone(currentPrice);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        if(supplyZone && currentPrice >= supplyZone.low && currentPrice <= supplyZone.high && (upperWick / total) > 0.6 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "منطقة عرض + شوتينج ستار", candlePattern: "INVERTED_SNIPER"};
        }
        return null;
    }
    strategy_SupplyZoneExit._name = "Supply Zone Exit";
    strategy_SupplyZoneExit.category = "intraday";
    
    // Market Structure Shift
    function strategy_MarketStructureShift(candles) {
        if(candles.length < 10) return null;
        let curr = candles[candles.length-1];
        let prevHigh = Math.max(...candles.slice(-10, -1).map(c => c.high));
        let fvg = detectFVG(candles);
        if(curr.close > prevHigh && fvg && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "تحول هيكل السوق + FVG", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MarketStructureShift._name = "Market Structure Shift";
    strategy_MarketStructureShift.category = "intraday";
    
    // Opening Range Break
    function strategy_OpeningRangeBreak(candles) {
        if(candles.length < 60) return null;
        let openingRange = getOpeningRange(candles, 60);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-61, -1).reduce((a,b) => a+b, 0) / 60;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(curr.close > openingRange.high && currentVol > avgVol && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "اختراق نطاق الافتتاح + حجم", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_OpeningRangeBreak._name = "Opening Range Break";
    strategy_OpeningRangeBreak.category = "intraday";
    
    // Mid-Day Consolidation
    function strategy_MidDayConsolidation(candles) {
        if(candles.length < 21) return null;
        let stdDev = calculateStdDev(candles.slice(-20).map(c => c.close));
        let curr = candles[candles.length-1];
        let avgBody = candles.slice(-20).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 20;
        let body = Math.abs(curr.close - curr.open);
        if(stdDev < avgBody * 0.5 && body > avgBody * 2 && checkLiquidity()) {
            let direction = curr.close > curr.open ? "CALL" : "PUT";
            return {signal: direction, confidence: 91, strength: "قوية", reason: "اختراق من منطقة تجميع", candlePattern: direction === "CALL" ? "INSTITUTIONAL_MARUBOZU" : "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_MidDayConsolidation._name = "Mid-Day Consolidation";
    strategy_MidDayConsolidation.category = "intraday";
    
    // Pullback to Key Level
    function strategy_PullbackToKeyLevel(candles) {
        if(candles.length < 2) return null;
        let keyLevel = getDailySRL(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let wick = Math.min(curr.open, curr.close) - curr.low;
        if(Math.abs(curr.low - keyLevel) < 0.0001 && (wick / total) > 0.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "ارتداد من مستوى مفتاح + فتيلة", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_PullbackToKeyLevel._name = "Pullback to Key Level";
    strategy_PullbackToKeyLevel.category = "intraday";
    
    // Triple Top Reject
    function strategy_TripleTopReject(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lastHighs = highs.slice(-30);
        let peaks = findPeaks(lastHighs);
        let rsi = calculateRSI(candles, 14);
        if(peaks.length >= 3 && rsi < 50 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 93, strength: "قوية", reason: "قمة ثلاثية + RSI متراجع", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_TripleTopReject._name = "Triple Top Reject";
    strategy_TripleTopReject.category = "intraday";
    
    // News Momentum Fade
    function strategy_NewsMomentumFade(candles) {
        if(candles.length < 2) return null;
        let atr = calculateATR(candles, 14);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let priceDeviation = Math.abs(currentPrice - candles[candles.length-2].close) / atr;
        if(priceDeviation > 3 && currentVol > avgVol * 2 && checkLiquidity()) {
            let direction = currentPrice > candles[candles.length-2].close ? "PUT" : "CALL";
            return {signal: direction, confidence: 90, strength: "قوية", reason: "تصحيح بعد اندفاع أخباري", candlePattern: direction === "CALL" ? "BULLISH_REJECTION" : "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_NewsMomentumFade._name = "News Momentum Fade";
    strategy_NewsMomentumFade.category = "intraday";
    
    // Higher High Break
    function strategy_HigherHighBreak(candles) {
        if(candles.length < 2) return null;
        let prevDayHigh = getPrevDayHigh(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        if(curr.close > prevDayHigh && volumes[volumes.length-1] > volumes[volumes.length-2] && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "كسر قمة اليوم السابق + حجم", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_HigherHighBreak._name = "Higher High Break";
    strategy_HigherHighBreak.category = "intraday";
    
    // ----- رابعاً: تداول تأرجح (Swing) - إطار 4س/يومي -----
    
    // Hidden Divergence
    function strategy_HiddenDivergence(candles) {
        if(candles.length < 30) return null;
        let closes = candles.map(c => c.close);
        let rsiValues = [];
        for(let i = 25; i < candles.length; i++) {
            let slice = candles.slice(i-25, i);
            rsiValues.push(calculateRSI(slice, 14));
        }
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        let lastRSI = rsiValues[rsiValues.length-1];
        let prevRSI = rsiValues[rsiValues.length-6];
        if(lastPrice > prevPrice && lastRSI < prevRSI && lastRSI < 50 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس خفي صاعد", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_HiddenDivergence._name = "Hidden Divergence";
    strategy_HiddenDivergence.category = "swing";
    
    // H4 Order Block
    function strategy_H4OrderBlock(candles) {
        if(orderBlocks.length === 0) return null;
        let nearestOB = orderBlocks[0];
        if(nearestOB && Math.abs(currentPrice - nearestOB.price) < 0.0005) {
            if(nearestOB.type === "BULLISH") {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ارتداد من Order Block صاعد", candlePattern: "BULLISH_REJECTION"};
            }
        }
        return null;
    }
    strategy_H4OrderBlock._name = "H4 Order Block";
    strategy_H4OrderBlock.category = "swing";
    
    // Trendline Anchor
    function strategy_TrendlineAnchor(candles) {
        if(candles.length < 30) return null;
        let trendlineTouch = checkTrendlineTouch(candles, 3);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(trendlineTouch && (lowerWick / total) > 0.6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "اللمسة الثالثة على ترندلاين + PinBar", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_TrendlineAnchor._name = "Trendline Anchor";
    strategy_TrendlineAnchor.category = "swing";
    
    // Weekly Support Hold
    function strategy_WeeklySupportHold(candles) {
        if(candles.length < 2) return null;
        let weeklySupport = getWeeklySupport(candles);
        let curr = candles[candles.length-1];
        if(curr.low < weeklySupport && curr.close > weeklySupport && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "صمود الدعم الأسبوعي", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_WeeklySupportHold._name = "Weekly Support Hold";
    strategy_WeeklySupportHold.category = "swing";
    
    // Cup and Handle
    function strategy_CupAndHandle(candles) {
        if(candles.length < 50) return null;
        let cupPattern = detectCupAndHandle(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        let handleVol = volumes.slice(-10).reduce((a,b) => a+b, 0) / 10;
        let breakoutVol = volumes[volumes.length-1];
        if(cupPattern && curr.close > cupPattern.resistance && breakoutVol > handleVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "كوب ومقبض + حجم اختراق", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_CupAndHandle._name = "Cup and Handle";
    strategy_CupAndHandle.category = "swing";
    
    // Head and Shoulders
    function strategy_HeadAndShoulders(candles) {
        if(candles.length < 50) return null;
        let pattern = detectHeadAndShoulders(candles);
        if(pattern && currentPrice < pattern.neckline && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: "رأس وكتفين - كسر الرقبة", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_HeadAndShoulders._name = "Head and Shoulders";
    strategy_HeadAndShoulders.category = "swing";
    
    // Corrective Wave End
    function strategy_CorrectiveWaveEnd(candles) {
        if(candles.length < 100) return null;
        let waveCEnd = detectElliottWaveCEnd(candles);
        let fibExt = fibonacciLevels.extension1618;
        if(waveCEnd && Math.abs(currentPrice - fibExt) < 0.0005 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "نهاية الموجة التصحيحية C + فيبو 161.8", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_CorrectiveWaveEnd._name = "Corrective Wave End";
    strategy_CorrectiveWaveEnd.category = "swing";
    
    // Swing Liquidity Run
    function strategy_SwingLiquidityRun(candles) {
        if(candles.length < 20) return null;
        let swingLow = Math.min(...candles.slice(-20).map(c => c.low));
        let curr = candles[candles.length-1];
        if(curr.low < swingLow && curr.close > swingLow && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "سحب سيولة من القاع + استرداد", candlePattern: "LIQUIDITY_SWEEP"};
        }
        return null;
    }
    strategy_SwingLiquidityRun._name = "Swing Liquidity Run";
    strategy_SwingLiquidityRun.category = "swing";
    
    // Bollinger Band Walk
    function strategy_BollingerBandWalk(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let upper = sma + 2 * std;
        let adx = calculateADX(candles, 14);
        let last3Closes = closes.slice(-3);
        let allAbove = last3Closes.every(c => c > upper);
        if(allAbove && adx > 25 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "المشي على بولينجر + ADX قوي", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BollingerBandWalk._name = "Bollinger Band Walk";
    strategy_BollingerBandWalk.category = "swing";
    
    // MACD Long Signal
    function strategy_MACDLongSignal(candles) {
        if(candles.length < 200) return null;
        let macd = calculateMACD(candles);
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        if(macd.macd > macd.signal && macd.prevMacd <= macd.prevSignal && curr.close > ema200 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "تقاطع MACD صاعد + فوق EMA200", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MACDLongSignal._name = "MACD Long Signal";
    strategy_MACDLongSignal.category = "swing";
    
    // SuperTrend Cycle
    function strategy_SuperTrendCycle(candles) {
        if(candles.length < 2) return null;
        let superTrend = calculateSuperTrend(candles);
        let cci = calculateCCI(candles, 20);
        if(superTrend === "UP" && cci > 100 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "SuperTrend أخضر + CCI موجب", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SuperTrendCycle._name = "SuperTrend Cycle";
    strategy_SuperTrendCycle.category = "swing";
    
    // Price Action Sandwich
    function strategy_PriceActionSandwich(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        let bigGreen = (c1.close - c1.open) > 0 && Math.abs(c1.close - c1.open) > Math.abs(c2.close - c2.open) * 2;
        let smallRed = c2.close < c2.open;
        let bigGreen2 = (c3.close - c3.open) > 0 && Math.abs(c3.close - c3.open) > Math.abs(c2.close - c2.open) * 2;
        if(bigGreen && smallRed && bigGreen2 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ساندويتش شموع - استمرارية صاعدة", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_PriceActionSandwich._name = "Price Action Sandwich";
    strategy_PriceActionSandwich.category = "swing";
    
    // ----- خامساً: تداول طويل الأمد (Position) - إطار أسبوعي -----
    
    // Golden Cross
    function strategy_GoldenCross(candles) {
        if(candles.length < 200) return null;
        let ema50 = calculateEMA(candles, 50);
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        if(ema50 > ema200 && curr.close > ema50 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "تقاطع ذهبي EMA 50/200", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_GoldenCross._name = "Golden Cross";
    strategy_GoldenCross.category = "position";
    
    // Monthly Breakout
    function strategy_MonthlyBreakout(candles) {
        if(candles.length < 12) return null;
        let yearlyHigh = Math.max(...candles.slice(-12).map(c => c.high));
        let volumes = candles.map(c => c.volume || 1000);
        let yearlyAvgVol = volumes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let curr = candles[candles.length-1];
        if(curr.close > yearlyHigh && volumes[volumes.length-1] > yearlyAvgVol && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "كسر قمة 12 شهر + حجم", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MonthlyBreakout._name = "Monthly Breakout";
    strategy_MonthlyBreakout.category = "position";
    
    // Institutional Buy
    function strategy_InstitutionalBuy(candles) {
        if(candles.length < 180) return null;
        let accumulation = detectAccumulationPhase(candles);
        if(accumulation && accumulation.duration > 6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "مرحلة تجميع مؤسساتي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_InstitutionalBuy._name = "Institutional Buy";
    strategy_InstitutionalBuy.category = "position";
    
    // Economic Cycle Entry
    function strategy_EconomicCycleEntry(candles) {
        if(candles.length < 30) return null;
        let monthlyRSI = calculateRSI(candles, 30);
        let curr = candles[candles.length-1];
        if(monthlyRSI < 40 && curr.low === Math.min(...candles.slice(-30).map(c => c.low)) && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "نقطة تحول بعد RSI منخفض", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_EconomicCycleEntry._name = "Economic Cycle Entry";
    strategy_EconomicCycleEntry.category = "position";
    
    // All-Time High Break
    function strategy_ATHBreak(candles) {
        if(candles.length < 2) return null;
        let ath = Math.max(...candles.map(c => c.high));
        let curr = candles[candles.length-1];
        if(curr.close > ath && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "كسر القمة التاريخية", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ATHBreak._name = "All-Time High Break";
    strategy_ATHBreak.category = "position";
    
    // 200-Day EMA Hold
    function strategy_EMA200Hold(candles) {
        if(candles.length < 200) return null;
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(Math.abs(curr.low - ema200) < 0.0001 && (lowerWick / total) > 0.6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "صمود EMA200 + مطرقة", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_EMA200Hold._name = "200-Day EMA Hold";
    strategy_EMA200Hold.category = "position";
    
    // Sector Strength
    function strategy_SectorStrength(candles) {
        if(candles.length < 50) return null;
        let symbolPerf = calculateSymbolPerformance(candles);
        let sectorPerf = getSectorPerformance();
        if(symbolPerf > sectorPerf && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "أداء أفضل من القطاع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SectorStrength._name = "Sector Strength";
    strategy_SectorStrength.category = "position";
    
    // Long-Term Divergence
    function strategy_LongTermDivergence(candles) {
        if(candles.length < 50) return null;
        let weeklyMACD = calculateMACD(candles.slice(0, Math.floor(candles.length/7)));
        let closes = candles.map(c => c.close);
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        if(prevPrice > lastPrice && weeklyMACD.macd > weeklyMACD.prevMacd && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس إيجابي أسبوعي", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_LongTermDivergence._name = "Long-Term Divergence";
    strategy_LongTermDivergence.category = "position";
    
    // Accumulation Zone (Wyckoff Spring)
    function strategy_AccumulationZone(candles) {
        if(candles.length < 2) return null;
        let support = getWyckoffSupport(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(curr.low < support && curr.close > support && (lowerWick / total) > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Wyckoff Spring - زنبرك تجميع", candlePattern: "SPRING_CANDLE"};
        }
        return null;
    }
    strategy_AccumulationZone._name = "Accumulation Zone";
    strategy_AccumulationZone.category = "position";
    
    // Inflation Hedge
    function strategy_InflationHedge(candles) {
        if(candles.length < 30) return null;
        let cpiCorrelation = getCPICorrelation();
        if(cpiCorrelation > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "تحوط تضخمي", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_InflationHedge._name = "Inflation Hedge";
    strategy_InflationHedge.category = "position";
    
    // Market Value Play
    function strategy_MarketValuePlay(candles) {
        if(candles.length < 2) return null;
        let fairValue = getFairValue();
        let curr = candles[candles.length-1];
        if(curr.close < fairValue && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "سعر أقل من القيمة العادلة", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_MarketValuePlay._name = "Market Value Play";
    strategy_MarketValuePlay.category = "position";
    
    // Decade Support Bounce
    function strategy_DecadeSupportBounce(candles) {
        if(candles.length < 120) return null;
        let decadeSupport = getDecadeSupport(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(Math.abs(curr.low - decadeSupport) < 0.0001 && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ارتداد من دعم 10 سنوات", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_DecadeSupportBounce._name = "Decade Support Bounce";
    strategy_DecadeSupportBounce.category = "position";
    
    // ========== الاستراتيجيات الأصلية المحفوظة ==========
    
    function strategy_RSI(candles) {
        if(candles.length < 14) return null;
        let gains = 0, losses = 0;
        for(let i = candles.length-14; i < candles.length-1; i++){
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        if(rsi < 30 && checkLiquidity()) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي`};
        if(rsi > 70 && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي`};
        return null;
    }
    strategy_RSI._name = "RSI";
    strategy_RSI.category = "all";
    
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
        if(prevPrice > lastPrice && prevRSI < lastRSI && lastRSI < 35 && checkLiquidity()) {
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس إيجابي RSI", candlePattern: "BULLISH_REJECTION"};
        }
        if(prevPrice < lastPrice && prevRSI > lastRSI && lastRSI > 65 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس سلبي RSI", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_RSI_Divergence._name = "RSI Divergence";
    strategy_RSI_Divergence.category = "intraday";
    
    function strategy_Stochastic(candles) {
        if(candles.length < 14) return null;
        let closes = candles.map(c => c.close);
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let high14 = Math.max(...highs.slice(-14));
        let low14 = Math.min(...lows.slice(-14));
        let k = ((closes[closes.length-1] - low14) / (high14 - low14)) * 100;
        let prevK = ((closes[closes.length-2] - low14) / (high14 - low14)) * 100;
        if(k < 20 && k > prevK && checkLiquidity()) return {signal:"CALL", confidence: 89, strength: "قوية", reason: "ستوكاستيك تشبع بيعي", candlePattern: "BULLISH_REJECTION"};
        if(k > 80 && k < prevK && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 89, strength: "قوية", reason: "ستوكاستيك تشبع شرائي", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_Stochastic._name = "Stochastic";
    strategy_Stochastic.category = "scalp_ultra";
    
    function strategy_Momentum(candles) {
        if(candles.length < 5) return null;
        let closes = candles.map(c => c.close);
        let mom1 = closes[closes.length-1] - closes[closes.length-2];
        let mom2 = closes[closes.length-2] - closes[closes.length-3];
        let mom3 = closes[closes.length-3] - closes[closes.length-4];
        if(mom1 > 0 && mom1 > mom2 && mom2 > mom3 && checkLiquidity()) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "زخم صاعد متسارع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        if(mom1 < 0 && mom1 < mom2 && mom2 < mom3 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "زخم هابط متسارع", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_Momentum._name = "Momentum";
    strategy_Momentum.category = "scalp_fast";
    
    function strategy_WilliamsR(candles) {
        if(candles.length < 14) return null;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let high14 = Math.max(...highs.slice(-14));
        let low14 = Math.min(...lows.slice(-14));
        let wr = ((high14 - closes[closes.length-1]) / (high14 - low14)) * -100;
        let prevWr = ((high14 - closes[closes.length-2]) / (high14 - low14)) * -100;
        if(wr < -80 && wr > prevWr && checkLiquidity()) return {signal:"CALL", confidence: 88, strength: "قوية", reason: "Williams %R تشبع بيعي", candlePattern: "BULLISH_REJECTION"};
        if(wr > -20 && wr < prevWr && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 88, strength: "قوية", reason: "Williams %R تشبع شرائي", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_WilliamsR._name = "Williams %R";
    strategy_WilliamsR.category = "all";
    
    function strategy_CCI(candles) {
        if(candles.length < 20) return null;
        let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
        let sma = typicalPrices.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let meanDev = typicalPrices.slice(-20).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / 20;
        let cci = (typicalPrices[typicalPrices.length-1] - sma) / (0.015 * meanDev);
        let prevCci = (typicalPrices[typicalPrices.length-2] - sma) / (0.015 * meanDev);
        if(cci < -100 && cci > prevCci && checkLiquidity()) return {signal:"CALL", confidence: 85, strength: "قوية", reason: "CCI ارتداد من -100", candlePattern: "BULLISH_REJECTION"};
        if(cci > 100 && cci < prevCci && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 85, strength: "قوية", reason: "CCI ارتداد من +100", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_CCI._name = "CCI";
    strategy_CCI.category = "intraday";
    
    function strategy_BollingerBands(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let lower = sma - 2 * std;
        let upper = sma + 2 * std;
        let current = closes[closes.length-1];
        let prev = closes[closes.length-2];
        if(current < lower && current > prev && checkLiquidity()) return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ارتداد من بولينجر السفلي", candlePattern: "BULLISH_REJECTION"};
        if(current > upper && current < prev && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ارتداد من بولينجر العلوي", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_BollingerBands._name = "Bollinger Bands";
    strategy_BollingerBands.category = "all";
    
    function strategy_MACD(candles) {
        if(candles.length < 27) return null;
        let closes = candles.map(c => c.close);
        let ema12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let ema26 = closes.slice(-26).reduce((a,b) => a+b, 0) / 26;
        let macd = ema12 - ema26;
        let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
        let hist = macd - ema9;
        if(candles.length > 27) {
            let prevEma12 = closes.slice(-13,-1).reduce((a,b) => a+b, 0) / 12;
            let prevEma26 = closes.slice(-27,-1).reduce((a,b) => a+b, 0) / 26;
            let prevMacd = prevEma12 - prevEma26;
            let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
            let prevHist = prevMacd - prevEma9;
            if(hist > 0 && prevHist <= 0 && checkLiquidity()) return {signal:"CALL", confidence: 87, strength: "قوية", reason: "تقاطع MACD صاعد", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            if(hist < 0 && prevHist >= 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 87, strength: "قوية", reason: "تقاطع MACD هابط", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_MACD._name = "MACD";
    strategy_MACD.category = "all";
    
    function strategy_MACD_Divergence(candles) {
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
        if(prevPrice > lastPrice && prevMACD < lastMACD && lastMACD < 0 && checkLiquidity()) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس إيجابي MACD", candlePattern: "BULLISH_REJECTION"};
        if(prevPrice < lastPrice && prevMACD > lastMACD && lastMACD > 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس سلبي MACD", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_MACD_Divergence._name = "MACD Divergence";
    strategy_MACD_Divergence.category = "intraday";
    
    function strategy_BullishEngulfing(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(prev.close < prev.open && last.close > last.open && last.open < prev.close && last.close > prev.open && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ابتلاع صاعد - انعكاس", candlePattern: "FULL_ENGULFING"};
        }
        return null;
    }
    strategy_BullishEngulfing._name = "Bullish Engulfing";
    strategy_BullishEngulfing.category = "all";
    
    function strategy_BearishEngulfing(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(prev.close > prev.open && last.close < last.open && last.open > prev.close && last.close < prev.open && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ابتلاع هابط - انعكاس", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_BearishEngulfing._name = "Bearish Engulfing";
    strategy_BearishEngulfing.category = "all";
    
    function strategy_SupportResistance(candles) {
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
        if(current > resistance && current > prev && body > avgBody * 1.5 && checkLiquidity()) return {signal:"CALL", confidence: 89, strength: "قوية", reason: "اختراق مقاومة", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        if(current < support && current < prev && body > avgBody * 1.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 89, strength: "قوية", reason: "اختراق دعم", candlePattern: "BEARISH_REJECTION"};
        if(Math.abs(current - resistance) < 0.0005 && current < resistance && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 85, strength: "قوية", reason: "ارتداد من مقاومة", candlePattern: "INVERTED_SNIPER"};
        if(Math.abs(current - support) < 0.0005 && current > support && checkLiquidity()) return {signal:"CALL", confidence: 85, strength: "قوية", reason: "ارتداد من دعم", candlePattern: "SNIPER_PINBAR"};
        return null;
    }
    strategy_SupportResistance._name = "Support & Resistance";
    strategy_SupportResistance.category = "all";
    
    function strategy_DemandZoneBounce(candles) {
        if(demandZones.length === 0) return null;
        let current = currentPrice;
        let nearestDemand = getNearestDemandZone(current);
        if(nearestDemand && Math.abs(current - nearestDemand.price) < 0.0006 && current > nearestDemand.price && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: "ارتداد من منطقة طلب قوية", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_DemandZoneBounce._name = "Demand Zone Bounce";
    strategy_DemandZoneBounce.category = "all";
    
    function strategy_SupplyZoneBounce(candles) {
        if(supplyZones.length === 0) return null;
        let current = currentPrice;
        let nearestSupply = getNearestSupplyZone(current);
        if(nearestSupply && Math.abs(current - nearestSupply.price) < 0.0006 && current < nearestSupply.price && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: "ارتداد من منطقة عرض قوية", candlePattern: "INVERTED_SNIPER"};
        }
        return null;
    }
    strategy_SupplyZoneBounce._name = "Supply Zone Bounce";
    strategy_SupplyZoneBounce.category = "all";
    
    function strategy_FibonacciRetracement(candles) {
        if(priceHistory.length < 50) return null;
        let current = currentPrice;
        let diffTo382 = Math.abs(current - fibonacciLevels.level382);
        let diffTo618 = Math.abs(current - fibonacciLevels.level618);
        let range = fibonacciLevels.level1000 - fibonacciLevels.level0;
        let tolerance = range * 0.01;
        let closes = candles.map(c => c.close);
        let trend = closes[closes.length-1] > closes[closes.length-11] ? "UP" : "DOWN";
        if(diffTo382 < tolerance && checkLiquidity()) {
            if(trend === "UP") return {signal:"CALL", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382", candlePattern: "BULLISH_REJECTION"};
            if(trend === "DOWN" && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382", candlePattern: "BEARISH_REJECTION"};
        }
        if(diffTo618 < tolerance && trend === "UP" && checkLiquidity()) return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "ارتداد من فيبوناتشي 0.618", candlePattern: "SNIPER_PINBAR"};
        return null;
    }
    strategy_FibonacciRetracement._name = "Fibonacci Retracement";
    strategy_FibonacciRetracement.category = "swing";
    
    function strategy_VolumeSpike(candles) {
        if(candles.length < 5) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-5, -1).reduce((a,b) => a+b, 0) / 4;
        let currentVol = volumes[volumes.length-1];
        let closes = candles.map(c => c.close);
        if(currentVol > avgVol * 2 && closes[closes.length-1] > closes[closes.length-2] && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "انفجار حجم مع صعود", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        if(currentVol > avgVol * 2 && closes[closes.length-1] < closes[closes.length-2] && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 89, strength: "قوية", reason: "انفجار حجم مع هبوط", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_VolumeSpike._name = "Volume Spike";
    strategy_VolumeSpike.category = "all";
    
    // استراتيجيات إضافية محفوظة
    function strategy_UltraScalp_PriceAction(candles) {
        if(candles.length < 3) return null;
        let last = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(last.close - last.open);
        let prevBody = Math.abs(prev.close - prev.open);
        if(last.close > last.open && body > prevBody * 1.5 && last.close > prev.high && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "شمعة صاعدة قوية - اختراق", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        if(last.close < last.open && body > prevBody * 1.5 && last.close < prev.low && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "شمعة هابطة قوية - اختراق", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_UltraScalp_PriceAction._name = "UltraScalp_PriceAction";
    strategy_UltraScalp_PriceAction.category = "scalp_ultra";
    
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
        if(rsi < 35 && macd > 0 && checkLiquidity()) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "RSI منخفض + MACD إيجابي", candlePattern: "BULLISH_REJECTION"};
        if(rsi > 65 && macd < 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "RSI مرتفع + MACD سلبي", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_FastScalp_RSI_MACD._name = "FastScalp_RSI_MACD";
    strategy_FastScalp_RSI_MACD.category = "scalp_fast";
    
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
        if(bbw < 0.02 && prevBbw > bbw * 1.2 && checkLiquidity()) {
            let current = closes[closes.length-1];
            let prev = closes[closes.length-2];
            if(current > prev) return {signal:"CALL", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - صعود متوقع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            if(current < prev && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - هبوط متوقع", candlePattern: "BEARISH_REJECTION"};
        }
        return null;
    }
    strategy_Intraday_Bollinger_Squeeze._name = "Intraday_Bollinger";
    strategy_Intraday_Bollinger_Squeeze.category = "intraday";
    
    function strategy_Swing_OrderBlock(candles) {
        if(orderBlocks.length === 0) return null;
        let current = currentPrice;
        let nearestOB = orderBlocks[0];
        if(nearestOB && Math.abs(current - nearestOB.price) < 0.0008) {
            if(nearestOB.type === "BULLISH" && current > nearestOB.price && checkLiquidity()) {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block صاعد`, candlePattern: "BULLISH_REJECTION"};
            }
            if(nearestOB.type === "BEARISH" && current < nearestOB.price && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
                return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block هابط`, candlePattern: "BEARISH_REJECTION"};
            }
        }
        return null;
    }
    strategy_Swing_OrderBlock._name = "Swing_OrderBlock";
    strategy_Swing_OrderBlock.category = "swing";
    
    function strategy_Position_Monthly_Trend(candles) {
        if(candles.length < 100) return null;
        let closes = candles.map(c => c.close);
        let ma50 = closes.slice(-50).reduce((a,b) => a+b, 0) / 50;
        let ma100 = closes.slice(-100).reduce((a,b) => a+b, 0) / 100;
        let current = closes[closes.length-1];
        if(current > ma50 && ma50 > ma100 && checkLiquidity()) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "ترتيب إيجابي للمتوسطات", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        if(current < ma50 && ma50 < ma100 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "ترتيب سلبي للمتوسطات", candlePattern: "BEARISH_REJECTION"};
        return null;
    }
    strategy_Position_Monthly_Trend._name = "Position_Trend";
    strategy_Position_Monthly_Trend.category = "position";
    
    function strategy_Multi_PinBar(candles) {
        if(candles.length < 2) return null;
        let last = candles[candles.length-1];
        let body = Math.abs(last.close - last.open);
        let upperShadow = last.high - Math.max(last.close, last.open);
        let lowerShadow = Math.min(last.close, last.open) - last.low;
        if(lowerShadow > body * 2 && upperShadow < body * 0.5 && checkLiquidity()) return {signal:"CALL", confidence: 88, strength: "قوية", reason: "نمط Pin Bar صاعد", candlePattern: "SNIPER_PINBAR"};
        if(upperShadow > body * 2 && lowerShadow < body * 0.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 88, strength: "قوية", reason: "نمط Pin Bar هابط", candlePattern: "INVERTED_SNIPER"};
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
            if(last.close > prev.close && checkLiquidity()) return {signal:"CALL", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - انعكاس صاعد", candlePattern: "LONG_LEGGED_DOJI"};
            if(last.close < prev.close && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - انعكاس هابط", candlePattern: "LONG_LEGGED_DOJI"};
        }
        return null;
    }
    strategy_Multi_Doji_Reversal._name = "Multi_Doji";
    strategy_Multi_Doji_Reversal.category = "all";
    
    // تجميع جميع الاستراتيجيات
    const STRATEGIES = [
        strategy_RSI, strategy_RSI_Divergence, strategy_Stochastic, strategy_Momentum,
        strategy_WilliamsR, strategy_CCI, strategy_BollingerBands, strategy_MACD,
        strategy_MACD_Divergence, strategy_BullishEngulfing, strategy_BearishEngulfing,
        strategy_SupportResistance, strategy_DemandZoneBounce, strategy_SupplyZoneBounce,
        strategy_FibonacciRetracement, strategy_VolumeSpike, strategy_UltraScalp_PriceAction,
        strategy_FastScalp_RSI_MACD, strategy_Intraday_Bollinger_Squeeze, strategy_Swing_OrderBlock,
        strategy_Position_Monthly_Trend, strategy_Multi_PinBar, strategy_Multi_Doji_Reversal,
        // الاستراتيجيات الجديدة
        strategy_MicroGapFill, strategy_TickVolumeSpike, strategy_MomentumBurst,
        strategy_OrderFlowScalp, strategy_FastSMABounce, strategy_VShapeRecovery,
        strategy_FlashBreakout, strategy_MicroRejection, strategy_InstantImbalance,
        strategy_ScalpXVelocity, strategy_PivotPointQuick, strategy_SecondaryTrendScalp,
        strategy_BollingerSqueeze, strategy_RSIReverse, strategy_StochasticCrossFast,
        strategy_EngulfingConfirmation, strategy_PinBarSniper, strategy_EMAPullback,
        strategy_SupportFlip, strategy_TrendRider, strategy_DoubleBottomScalp,
        strategy_ChannelBreak, strategy_VolumeProfileQuick, strategy_MACDZeroCross,
        strategy_LondonOpenBreakout, strategy_VWAPBounce, strategy_GoldenZoneFib,
        strategy_DemandZoneEntry, strategy_SupplyZoneExit, strategy_MarketStructureShift,
        strategy_OpeningRangeBreak, strategy_MidDayConsolidation, strategy_PullbackToKeyLevel,
        strategy_TripleTopReject, strategy_NewsMomentumFade, strategy_HigherHighBreak,
        strategy_HiddenDivergence, strategy_H4OrderBlock, strategy_TrendlineAnchor,
        strategy_WeeklySupportHold, strategy_CupAndHandle, strategy_HeadAndShoulders,
        strategy_CorrectiveWaveEnd, strategy_SwingLiquidityRun, strategy_BollingerBandWalk,
        strategy_MACDLongSignal, strategy_SuperTrendCycle, strategy_PriceActionSandwich,
        strategy_GoldenCross, strategy_MonthlyBreakout, strategy_InstitutionalBuy,
        strategy_EconomicCycleEntry, strategy_ATHBreak, strategy_EMA200Hold,
        strategy_SectorStrength, strategy_LongTermDivergence, strategy_AccumulationZone,
        strategy_InflationHedge, strategy_MarketValuePlay, strategy_DecadeSupportBounce
    ];

    const TIMEFRAME_STRATEGY_MAP = {
        scalp_ultra: STRATEGIES.filter(s => s.category === "scalp_ultra" || s.category === "all").map(s => s._name),
        scalp_fast: STRATEGIES.filter(s => s.category === "scalp_fast" || s.category === "all").map(s => s._name),
        intraday: STRATEGIES.filter(s => s.category === "intraday" || s.category === "all").map(s => s._name),
        swing: STRATEGIES.filter(s => s.category === "swing" || s.category === "all").map(s => s._name),
        position: STRATEGIES.filter(s => s.category === "position" || s.category === "all").map(s => s._name)
    };

    function getActiveStrategies() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return STRATEGIES;
        let category = TIMEFRAMES[selectedTimeframe].category;
        let activeNames = TIMEFRAME_STRATEGY_MAP[category] || TIMEFRAME_STRATEGY_MAP["intraday"];
        return STRATEGIES.filter(s => activeNames.includes(s._name));
    }

    function calculateWaitTime() {
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return 5000;
        return Math.min(Math.max(TIMEFRAMES[selectedTimeframe].waitSeconds * 1000, 1000), 60000);
    }

    // =====================================================
    // ========== القاعدة الذهبية للـ 90% ==========
    // =====================================================
    
    // فحص السيولة + القمة التاريخية + توافق الفريمات
    function checkLiquidity() {
        let liq = parseInt(currentLiquidity);
        return liq >= 70;
    }
    
    function isAtHistoricalPeak(price, signalType) {
        if(priceHistory.length < 100) return false;
        let maxPrice = Math.max(...priceHistory.map(p => p.high));
        let isNearPeak = price >= (maxPrice * 0.998);
        if(signalType === "CALL" && isNearPeak) {
            console.log("%c ⚠️ تم حجب إشارة شراء: السعر عند قمة تاريخية!", "color: #ff6600;");
            return true;
        }
        if(signalType === "PUT" && price <= (Math.min(...priceHistory.map(p => p.low)) * 1.002)) {
            console.log("%c ⚠️ تم حجب إشارة بيع: السعر عند قاع تاريخي!", "color: #ff6600;");
            return true;
        }
        return false;
    }
    
    function checkTimeframeAlignment() {
        if(!selectedTimeframe) return true;
        let tf = TIMEFRAMES[selectedTimeframe];
        if(tf.category === "scalp_ultra" && parseInt(currentLiquidity) < 80) return false;
        return true;
    }
    
    // دالة فحص الفرصة الجديدة (لمنع تكرار الإشارات)
    function isNewOpportunity(currentSignal, assetName) {
        const currentTime = Math.floor(Date.now() / (60 * 1000));
        
        if (lastTradeInfo.candleId === currentTime && 
            lastTradeInfo.asset === assetName && 
            lastTradeInfo.type === currentSignal) {
            return false;
        }
    
        if (lastTradeInfo.type === currentSignal && lastTradeInfo.asset === assetName) {
            const priceDiff = Math.abs(currentPrice - lastTradeInfo.entryPrice);
            const minGap = 0.00005;
            if (priceDiff < minGap) {
                return false;
            }
        }
    
        return true;
    }
    
    function updateTradeMemory(signal, price) {
        lastTradeInfo = {
            candleId: Math.floor(Date.now() / (60 * 1000)),
            asset: currentAsset,
            type: signal,
            entryPrice: price
        };
    }

    // =====================================================
    // ========== دوال مساعدة (Helper Functions) ==========
    // =====================================================
    
    function calculateATR(candles, period) {
        if(candles.length < period) return 0.0005;
        let trs = [];
        for(let i = 1; i < candles.length; i++) {
            let high = candles[i].high;
            let low = candles[i].low;
            let prevClose = candles[i-1].close;
            let tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
        }
        let atr = trs.slice(-period).reduce((a,b) => a+b, 0) / period;
        return atr;
    }
    
    function calculateRSI(candles, period) {
        if(candles.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for(let i = candles.length-period; i < candles.length-1; i++) {
            let diff = candles[i+1].close - candles[i].close;
            if(diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        let rs = avgGain / (avgLoss || 1);
        return 100 - (100 / (1 + rs));
    }
    
    function calculateEMA(candles, period) {
        if(candles.length < period) return candles[candles.length-1]?.close || 0;
        let k = 2 / (period + 1);
        let ema = candles.slice(0, period).reduce((a,b) => a + b.close, 0) / period;
        for(let i = period; i < candles.length; i++) {
            ema = (candles[i].close * k) + (ema * (1 - k));
        }
        return ema;
    }
    
    function calculateEMAPrev(candles, period) {
        if(candles.length < period + 1) return calculateEMA(candles, period);
        let tempCandles = candles.slice(0, -1);
        return calculateEMA(tempCandles, period);
    }
    
    function calculateStochastic(candles) {
        if(candles.length < 14) return 50;
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let closes = candles.map(c => c.close);
        let high14 = Math.max(...highs.slice(-14));
        let low14 = Math.min(...lows.slice(-14));
        return ((closes[closes.length-1] - low14) / (high14 - low14)) * 100;
    }
    
    function calculateStochasticFull(candles) {
        if(candles.length < 14) return {k:50, d:50, kPrev:50, dPrev:50};
        let kValues = [];
        for(let i = 13; i < candles.length; i++) {
            let slice = candles.slice(i-13, i+1);
            let highs = slice.map(c => c.high);
            let lows = slice.map(c => c.low);
            let high14 = Math.max(...highs);
            let low14 = Math.min(...lows);
            let k = ((slice[slice.length-1].close - low14) / (high14 - low14)) * 100;
            kValues.push(k);
        }
        let k = kValues[kValues.length-1];
        let d = (kValues[kValues.length-1] + kValues[kValues.length-2] + kValues[kValues.length-3]) / 3;
        let kPrev = kValues[kValues.length-2];
        let dPrev = (kValues[kValues.length-2] + kValues[kValues.length-3] + kValues[kValues.length-4]) / 3;
        return {k, d, kPrev, dPrev};
    }
    
    function calculateADX(candles, period) {
        if(candles.length < period + 1) return 25;
        let trs = [], plusDM = [], minusDM = [];
        for(let i = 1; i < candles.length; i++) {
            let high = candles[i].high;
            let low = candles[i].low;
            let prevHigh = candles[i-1].high;
            let prevLow = candles[i-1].low;
            let prevClose = candles[i-1].close;
            let tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
            let upMove = high - prevHigh;
            let downMove = prevLow - low;
            let plus = (upMove > downMove && upMove > 0) ? upMove : 0;
            let minus = (downMove > upMove && downMove > 0) ? downMove : 0;
            plusDM.push(plus);
            minusDM.push(minus);
        }
        let atr = trs.slice(-period).reduce((a,b) => a+b, 0) / period;
        let plusDI = plusDM.slice(-period).reduce((a,b) => a+b, 0) / period / atr * 100;
        let minusDI = minusDM.slice(-period).reduce((a,b) => a+b, 0) / period / atr * 100;
        let dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
        return dx;
    }
    
    function calculateMACD(candles) {
        if(candles.length < 27) return {macd:0, signal:0, hist:0, prevMacd:0, prevSignal:0};
        let closes = candles.map(c => c.close);
        let ema12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let ema26 = closes.slice(-26).reduce((a,b) => a+b, 0) / 26;
        let macd = ema12 - ema26;
        let ema9 = closes.slice(-9).reduce((a,b) => a+b, 0) / 9;
        let signal = macd - ema9;
        let prevEma12 = closes.slice(-13,-1).reduce((a,b) => a+b, 0) / 12;
        let prevEma26 = closes.slice(-27,-1).reduce((a,b) => a+b, 0) / 26;
        let prevMacd = prevEma12 - prevEma26;
        let prevEma9 = closes.slice(-10,-1).reduce((a,b) => a+b, 0) / 9;
        let prevSignal = prevMacd - prevEma9;
        return {macd, signal, hist: macd - signal, prevMacd, prevSignal};
    }
    
    function calculateCCI(candles, period) {
        if(candles.length < period) return 0;
        let typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
        let sma = typicalPrices.slice(-period).reduce((a,b) => a+b, 0) / period;
        let meanDev = typicalPrices.slice(-period).reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
        return (typicalPrices[typicalPrices.length-1] - sma) / (0.015 * meanDev);
    }
    
    function calculateStdDev(values) {
        let mean = values.reduce((a,b) => a+b, 0) / values.length;
        let variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
    
    function getResistanceLevel(candles) {
        let highs = candles.map(c => c.high);
        return Math.max(...highs.slice(-20));
    }
    
    function getSupportLevel(candles) {
        let lows = candles.map(c => c.low);
        return Math.min(...lows.slice(-20));
    }
    
    function calculatePivotS1(candles) {
        if(candles.length < 2) return 0;
        let prev = candles[candles.length-2];
        let pivot = (prev.high + prev.low + prev.close) / 3;
        let s1 = pivot * 2 - prev.high;
        return s1;
    }
    
    function getTrend(candles) {
        if(candles.length < 10) return "NEUTRAL";
        let closes = candles.map(c => c.close);
        let sma5 = closes.slice(-5).reduce((a,b) => a+b, 0) / 5;
        let sma10 = closes.slice(-10).reduce((a,b) => a+b, 0) / 10;
        if(sma5 > sma10 && closes[closes.length-1] > sma5) return "BULLISH";
        if(sma5 < sma10 && closes[closes.length-1] < sma5) return "BEARISH";
        return "NEUTRAL";
    }
    
    function calculateOpeningRange(candles, minutes) {
        let rangeCandles = candles.slice(-minutes);
        return {
            high: Math.max(...rangeCandles.map(c => c.high)),
            low: Math.min(...rangeCandles.map(c => c.low))
        };
    }
    
    function calculateVWAP(candles) {
        let sumPV = 0, sumV = 0;
        for(let c of candles) {
            let typical = (c.high + c.low + c.close) / 3;
            let vol = c.volume || 1000;
            sumPV += typical * vol;
            sumV += vol;
        }
        return sumPV / (sumV || 1);
    }
    
    function calculateVWAPPrev(candles) {
        let tempCandles = candles.slice(0, -1);
        return calculateVWAP(tempCandles);
    }
    
    function calculateFibRetracement(candles) {
        let highs = candles.map(c => c.high);
        let lows = candles.map(c => c.low);
        let swingHigh = Math.max(...highs.slice(-50));
        let swingLow = Math.min(...lows.slice(-50));
        let range = swingHigh - swingLow;
        let current = candles[candles.length-1].close;
        let retracement = (swingHigh - current) / range;
        return retracement;
    }
    
    function detectFVG(candles) {
        if(candles.length < 3) return false;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        return (c1.low > c2.high && c2.low > c3.high) || (c1.high < c2.low && c2.high < c3.low);
    }
    
    function getOpeningRange(candles, minutes) {
        return calculateOpeningRange(candles, minutes);
    }
    
    function getDailySRL(candles) {
        let dailyCandles = candles.slice(-1440);
        if(dailyCandles.length === 0) return 0;
        return (Math.max(...dailyCandles.map(c => c.high)) + Math.min(...dailyCandles.map(c => c.low))) / 2;
    }
    
    function findPeaks(values) {
        let peaks = [];
        for(let i = 2; i < values.length - 2; i++) {
            if(values[i] > values[i-1] && values[i] > values[i-2] && 
               values[i] > values[i+1] && values[i] > values[i+2]) {
                peaks.push(values[i]);
            }
        }
        return peaks;
    }
    
    function getPrevDayHigh(candles) {
        let dailyCandles = candles.slice(-1440);
        if(dailyCandles.length === 0) return 0;
        return Math.max(...dailyCandles.map(c => c.high));
    }
    
    function getWeeklySupport(candles) {
        let weeklyCandles = candles.slice(-10080);
        if(weeklyCandles.length === 0) return 0;
        return Math.min(...weeklyCandles.map(c => c.low));
    }
    
    function detectCupAndHandle(candles) {
        if(candles.length < 50) return null;
        let highs = candles.map(c => c.high);
        let leftHigh = Math.max(...highs.slice(0, 25));
        let rightHigh = Math.max(...highs.slice(-25));
        let bottom = Math.min(...highs.slice(10, 40));
        if(Math.abs(leftHigh - rightHigh) < leftHigh * 0.01 && leftHigh > bottom * 1.1) {
            return {resistance: leftHigh};
        }
        return null;
    }
    
    function detectHeadAndShoulders(candles) {
        if(candles.length < 50) return null;
        let highs = candles.map(c => c.high);
        let leftShoulder = Math.max(...highs.slice(0, 15));
        let head = Math.max(...highs.slice(15, 35));
        let rightShoulder = Math.max(...highs.slice(35, 50));
        if(head > leftShoulder && head > rightShoulder && Math.abs(leftShoulder - rightShoulder) < leftShoulder * 0.02) {
            let neckline = (Math.min(...highs.slice(0, 15)) + Math.min(...highs.slice(35, 50))) / 2;
            return {neckline: neckline};
        }
        return null;
    }
    
    function detectElliottWaveCEnd(candles) {
        if(candles.length < 100) return false;
        let recentCloses = candles.slice(-50).map(c => c.close);
        let minPrice = Math.min(...recentCloses);
        let current = candles[candles.length-1].close;
        return current <= minPrice * 1.01;
    }
    
    function calculateSuperTrend(candles, period=10, multiplier=3) {
        if(candles.length < period) return "NEUTRAL";
        let atr = calculateATR(candles, period);
        let hl2 = candles.map(c => (c.high + c.low) / 2);
        let upperBand = hl2[hl2.length-1] + multiplier * atr;
        let lowerBand = hl2[hl2.length-1] - multiplier * atr;
        let close = candles[candles.length-1].close;
        return close > (upperBand + lowerBand)/2 ? "UP" : "DOWN";
    }
    
    function detectAccumulationPhase(candles) {
        if(candles.length < 180) return null;
        let lows = candles.map(c => c.low);
        let recentLows = lows.slice(-60);
        let minRecent = Math.min(...recentLows);
        let minOverall = Math.min(...lows);
        if(minRecent > minOverall * 1.02) {
            return {duration: 6, type: "ACCUMULATION"};
        }
        return null;
    }
    
    function calculateSymbolPerformance(candles) {
        if(candles.length < 2) return 0;
        return ((candles[candles.length-1].close - candles[0].close) / candles[0].close) * 100;
    }
    
    function getSectorPerformance() {
        return 0;
    }
    
    function getWyckoffSupport(candles) {
        let lows = candles.map(c => c.low);
        return Math.min(...lows.slice(-20));
    }
    
    function getCPICorrelation() {
        return 0.5;
    }
    
    function getFairValue() {
        return currentPrice * 0.95;
    }
    
    function getDecadeSupport(candles) {
        let lows = candles.map(c => c.low);
        return Math.min(...lows);
    }
    
    function calculatePOC(candles) {
        let prices = candles.map(c => c.close);
        let sorted = [...prices].sort((a,b) => a-b);
        return sorted[Math.floor(sorted.length/2)];
    }
    
    function checkTrendlineTouch(candles, touches) {
        return false;
    }
    
    // =====================================================
    // ========== كشف الفريم (Wy5Or) مع تحديث الواجهة ==========
    // =====================================================
    function initTimeframeDetectionV2() {
        let lastTF = "";
        
        function updateTimeframeUI() {
            const timeframeEl = document.getElementById('st-tf-value');
            if (timeframeEl && selectedTimeframe) {
                timeframeEl.innerText = selectedTimeframe;
                console.log(`%c 📺 بالفريم: ${selectedTimeframe}`, "color: #00ffaa; font-size: 10px;");
            }
            
            const timeframeDisplay = document.getElementById('current-timeframe-display');
            if (timeframeDisplay && selectedTimeframe && TIMEFRAMES[selectedTimeframe]) {
                let config = TIMEFRAMES[selectedTimeframe];
                let categoryLabels = {
                    scalp_ultra: "⚡ سكالبينج فائق السرعة",
                    scalp_fast: "🔥 سكالبينج سريع",
                    intraday: "📈 تداول يومي",
                    swing: "🌊 تداول تأرجح",
                    position: "🏔 تداول طويل الأمد"
                };
                let catLabel = categoryLabels[config.category] || "";
                let activeCount = getActiveStrategies().length;
                timeframeDisplay.innerHTML = `📊 ${config.name} (${selectedTimeframe}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية | انتظار ${config.waitSeconds} ثانية</span>`;
            }
        }
        
        function detectTimeframe() {
            const target = document.querySelector('.Wy5Or');
            if (target) {
                const rawText = target.innerText.trim();
                const timeMatch = rawText.match(/[0-9]{1,2}[smhd]/);
                if (timeMatch) {
                    let currentTF = timeMatch[0].toLowerCase();
                    if (currentTF !== lastTF) {
                        lastTF = currentTF;
                        if (TIMEFRAMES[currentTF]) {
                            selectedTimeframe = currentTF;
                            currentTimeframeAuto = currentTF;
                            console.log(`%c 🎯 تم الرصد : ${currentTF} `, "color: white; background: #e67e22; padding: 5px; font-weight: bold; border-radius: 4px;");
                            updateTimeframeUI();
                            if (botRunning) {
                                const statusEl = document.getElementById('status-text');
                                if (statusEl) statusEl.innerHTML = `🟢 يعمل | ${getActiveStrategies().length} استراتيجية | ${currentTF}`;
                            }
                        }
                    }
                }
            }
        }
        
        detectTimeframe();
        setInterval(detectTimeframe, 500);
        document.addEventListener('click', () => setTimeout(detectTimeframe, 200));
    }

    // =====================================================
    // ========== كشف العملة (xfLZW) ==========
    // =====================================================
    function initAssetDetectionV2() {
        let lastAsset = "";
        
        function detectAsset() {
            const assetEl = document.querySelector('.xfLZW');
            if (assetEl) {
                let currentAssetName = assetEl.innerText.trim().split('\n')[0];
                if (currentAssetName && currentAssetName !== lastAsset) {
                    lastAsset = currentAssetName;
                    currentAsset = currentAssetName;
                    console.log(`%c 💎 العملة الحالية: ${currentAssetName} `, "color: white; background: #27ae60; padding: 5px; font-weight: bold; border-radius: 4px;");
                    const assetDisplay = document.getElementById('current-asset-display');
                    if (assetDisplay) assetDisplay.innerText = currentAssetName;
                    resetAnalysis();
                }
            }
        }
        
        detectAsset();
        setInterval(detectAsset, 1000);
        document.addEventListener('click', () => setTimeout(detectAsset, 300));
    }

    // =====================================================
    // ========== كشف السيولة (gDH53) ==========
    // =====================================================
    function initLiquidityDetection() {
        let lastLiq = "";
        
        function detectLiquidity() {
            const liqEl = document.querySelector('.gDH53');
            if (liqEl) {
                let currentLiq = liqEl.innerText.trim();
                if (currentLiq && currentLiq !== lastLiq) {
                    lastLiq = currentLiq;
                    currentLiquidity = currentLiq;
                    let color = parseInt(currentLiq) >= 80 ? "#27ae60" : "#e67e22";
                    console.log(`%c 💧 السيولة الحالية: ${currentLiq} `, `color: white; background: ${color}; padding: 5px; font-weight: bold; border-radius: 4px;`);
                    
                    const liqDisplay = document.getElementById('current-liquidity-display');
                    if (liqDisplay) {
                        liqDisplay.innerText = currentLiq;
                        liqDisplay.style.color = color;
                    }
                    
                    if (parseInt(currentLiq) < 70) {
                        console.warn("%c ⚠️ تنبيه: السيولة منخفضة! القاعدة تفرض صرامة أكبر قبل أي أمر شراء.", "color: #c0392b; font-weight: bold;");
                    }
                }
            }
        }
        
        detectLiquidity();
        setInterval(detectLiquidity, 1000);
        document.addEventListener('click', () => setTimeout(detectLiquidity, 300));
    }

    // =====================================================
    // ========== كشف الحساب ==========
    // =====================================================
    function initAccountDetectionV2() {
        let lastAccType = "";
        
        function detectAccount() {
            const bodyText = document.body.innerText;
            const isDemo = /Demo|تجريبي|DEMO/i.test(bodyText);
            let currentType = isDemo ? "DEMO 🔸" : "LIVE ✅";
            
            if (currentType !== lastAccType) {
                lastAccType = currentType;
                currentAccountType = isDemo ? "DEMO" : "LIVE";
                let bgColor = isDemo ? "#e67e22" : "#27ae60";
                console.log(`%c 👤 نوع الحساب الحالي: ${currentType} `, `color: white; background: ${bgColor}; padding: 5px; font-weight: bold; border-radius: 4px;`);
                
                const accountEl = document.getElementById('current-account-display');
                if (accountEl) {
                    accountEl.innerText = isDemo ? "🔸 تجريبي" : "✅ حقيقي";
                    accountEl.style.color = isDemo ? "#ffaa66" : "#00ffaa";
                }
            }
        }
        
        detectAccount();
        setInterval(detectAccount, 2000);
        document.addEventListener('click', () => setTimeout(detectAccount, 500));
    }

    // =====================================================
    // ========== سحب 500 شمعة من الشارت ==========
    // =====================================================
    function initChartDataCapture() {
        let lastMinute = null;
        
        const originalDecode = TextDecoder.prototype.decode;
        TextDecoder.prototype.decode = function(buffer) {
            const text = originalDecode.apply(this, arguments);
            if (text && text.length > 500 && text.includes('[[')) {
                try {
                    const matches = text.match(/\[\[.*?\]\]/g);
                    if (matches) {
                        const rawData = JSON.parse(matches[0]);
                        if (rawData && rawData.length > 50) {
                            priceHistory = rawData.map(c => {
                                let prices = c.filter(val => typeof val === 'number' && val > 10);
                                return {
                                    time: c[0] * 1000,
                                    open: prices[0] || 0,
                                    high: Math.max(...prices) || 0,
                                    low: Math.min(...prices) || 0,
                                    close: prices[prices.length - 1] || 0,
                                    volume: c[5] || 1000
                                };
                            }).filter(c => c.open > 0 && c.close > 0).slice(-500);
                            console.log("%c 🏆 تم سحب 500 شمعة كاملة بذيولها!", "color: #00ff00; font-weight: bold;");
                            updateFibonacciLevels();
                            detectSupplyDemandZones();
                        }
                    }
                } catch(e) {}
            }
            return text;
        };
        
        const _WS = window.WebSocket;
        window.WebSocket = function(url, proto) {
            const ws = new _WS(url, proto);
            ws.addEventListener('message', async (e) => {
                try {
                    let data = e.data;
                    let text = (data instanceof Blob) ? await data.text() : data;
                    if (text && text.includes('quotes/stream')) {
                        const startIdx = text.indexOf('{');
                        const endIdx = text.lastIndexOf('}');
                        if (startIdx !== -1 && endIdx !== -1) {
                            const cleanJson = JSON.parse(text.substring(startIdx, endIdx + 1));
                            if (cleanJson && cleanJson.data) {
                                const price = parseFloat(cleanJson.data[2]);
                                const serverTime = cleanJson.data[1];
                                const currentMinute = Math.floor(serverTime / 60);
                                
                                if (lastMinute !== null && currentMinute !== lastMinute) {
                                    console.log("%c 🚀 انتباه: بدأت شمعة جديدة الآن! 🚀 ", "color: #fff; background: #e74c3c; font-size: 18px; font-weight: bold; padding: 10px;");
                                }
                                lastMinute = currentMinute;
                                updateLiveCandle(price, serverTime * 1000);
                            }
                        }
                    }
                } catch(err) {}
            });
            return ws;
        };
        
        function updateLiveCandle(price, timestamp) {
            if (priceHistory.length === 0) return;
            const currentCandleTime = Math.floor(timestamp / 60000) * 60000;
            let lastCandle = priceHistory[priceHistory.length - 1];
            
            if (lastCandle.time !== currentCandleTime) {
                priceHistory.push({ time: currentCandleTime, open: price, high: price, low: price, close: price, volume: 1000 });
                if (priceHistory.length > 500) priceHistory.shift();
            } else {
                lastCandle.close = price;
                if (price > lastCandle.high) lastCandle.high = price;
                if (price < lastCandle.low) lastCandle.low = price;
            }
            currentPrice = price;
            updatePriceDisplay(currentPrice, (currentPrice - lastPrice).toFixed(5));
            lastPrice = currentPrice;
        }
    }

    // =====================================================
    // ========== رادار السعر اللحظي ==========
    // =====================================================
    function initPriceRadarV2() {
        let lastPriceValue = 0;
        
        function getTargetAssetName() {
            const assetElement = document.querySelector('.xfLZW');
            if (!assetElement) return null;
            let rawName = assetElement.innerText.split('\n')[0]; 
            let cleanName = rawName.replace(/[^a-zA-Z]/g, "").toUpperCase();
            if (rawName.includes("OTC")) cleanName = cleanName.replace("OTC", "") + "_otc";
            return cleanName;
        }

        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
            const ws = new originalWebSocket(url, protocols);
            ws.addEventListener('message', async (event) => handlePriceData(event.data));
            return ws;
        };

        async function handlePriceData(data) {
            let textData = "";
            if (data instanceof Blob) textData = await data.text();
            else if (data instanceof ArrayBuffer) textData = new TextDecoder().decode(data);
            else textData = data.toString();

            try {
                const activeAsset = getTargetAssetName();
                if (!activeAsset) return;

                if (textData.includes(activeAsset) || textData.includes('quotes/stream')) {
                    const priceMatch = textData.match(/(\d+\.\d{4,})/) || textData.match(/,(0?\.\d+),/);
                    if (priceMatch) {
                        const newPrice = parseFloat(priceMatch[1] || priceMatch[0]);
                        currentPrice = newPrice;
                        let diff = lastPriceValue === 0 ? 0 : (currentPrice - lastPriceValue).toFixed(5);
                        let color = diff > 0 ? "#27ae60" : (diff < 0 ? "#e74c3c" : "#2c3e50");
                        console.log(`%c 🎯 Asset: ${activeAsset} Price: ${currentPrice} Speed: ${diff}`, "color: #00ffcc;");
                        updatePriceDisplay(currentPrice, diff);
                        if (currentTrade && currentTrade.status === "open") checkTradeExit(currentPrice);
                        lastPriceValue = currentPrice;
                    }
                }
            } catch (e) {}
        }

        const originalSend = originalWebSocket.prototype.send;
        originalWebSocket.prototype.send = function(data) {
            if (!this.singlePriceObserver) {
                this.addEventListener('message', (event) => handlePriceData(event.data));
                this.singlePriceObserver = true;
            }
            return originalSend.apply(this, arguments);
        };
    }

    // =====================================================
    // ========== تنفيذ أوامر الشراء/البيع ==========
    // =====================================================
    function executeTradeOrder(direction) {
        try {
            if (direction === "CALL") {
                const callButton = document.querySelector("main button.NojdU");
                if (callButton) {
                    callButton.click();
                    console.log("%c ✅ تم تنفيذ أمر شراء (CALL) بنجاح", "color: #00ff00; font-weight: bold;");
                    return true;
                } else {
                    console.warn("%c ⚠️ لم يتم العثور على زر CALL (.NojdU)", "color: #ffaa00;");
                    return false;
                }
            } else if (direction === "PUT") {
                const putButton = document.querySelector("button.oBTfq");
                if (putButton) {
                    putButton.click();
                    console.log("%c ✅ تم تنفيذ أمر بيع (PUT) بنجاح", "color: #00ff00; font-weight: bold;");
                    return true;
                } else {
                    console.warn("%c ⚠️ لم يتم العثور على زر PUT (.oBTfq)", "color: #ffaa00;");
                    return false;
                }
            }
        } catch(e) {
            console.error("%c ❌ خطأ في تنفيذ الأمر: " + e.message, "color: #ff0000;");
        }
        return false;
    }

    // =====================================================
    // ========== كشف مناطق الطلب والعرض ==========
    // =====================================================
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
                if (prices[k] >= zoneLow && prices[k] <= zoneLow + range * 0.3) demandStrength++;
            }
            if (demandStrength >= 3 && range > 0.0005) {
                demandZones.push({ low: zoneLow, high: zoneLow + range * 0.3, strength: demandStrength, price: zoneLow });
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
                if (prices[k] >= zoneHigh - range * 0.3 && prices[k] <= zoneHigh) supplyStrength++;
            }
            if (supplyStrength >= 3 && range > 0.0005) {
                supplyZones.push({ low: zoneHigh - range * 0.3, high: zoneHigh, strength: supplyStrength, price: zoneHigh });
            }
        }
        
        demandZones = demandZones.filter((zone, index, self) => index === self.findIndex(z => Math.abs(z.price - zone.price) < 0.001)).slice(0, 5);
        supplyZones = supplyZones.filter((zone, index, self) => index === self.findIndex(z => Math.abs(z.price - zone.price) < 0.001)).slice(0, 5);
        
        updateSupplyDemandDisplay();
    }
    
    function updateSupplyDemandDisplay() {
        const sdEl = document.getElementById('supply-demand-levels');
        if (!sdEl) return;
        let html = `<div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;">
            <div style="font-size:10px;color:#ffd966;margin-bottom:5px;">📊 مناطق الطلب والعرض</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:8px;">`;
        html += `<div style="color:#00ffaa;">🟢 طلب: ${demandZones[0]?.price.toFixed(5) || '--'}</div>`;
        html += `<div style="color:#ff4466;">🔴 عرض: ${supplyZones[0]?.price.toFixed(5) || '--'}</div>`;
        html += `</div></div>`;
        sdEl.innerHTML = html;
    }
    
    function getNearestDemandZone(price) {
        if (demandZones.length === 0) return null;
        let nearest = null, minDist = Infinity;
        for (let zone of demandZones) {
            let dist = Math.abs(price - zone.price);
            if (dist < minDist && price > zone.price) { minDist = dist; nearest = zone; }
        }
        return nearest;
    }
    
    function getNearestSupplyZone(price) {
        if (supplyZones.length === 0) return null;
        let nearest = null, minDist = Infinity;
        for (let zone of supplyZones) {
            let dist = Math.abs(price - zone.price);
            if (dist < minDist && price < zone.price) { minDist = dist; nearest = zone; }
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
            fibEl.innerHTML = `<div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;">
                <div style="font-size:9px;color:#ffd966;margin-bottom:4px;">📐 مستويات فيبوناتشي</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;font-size:7px;">
                    <div style="color:#ffd966;">0.236: ${fibonacciLevels.level236.toFixed(5)}</div>
                    <div style="color:#ffaa66;">0.382: ${fibonacciLevels.level382.toFixed(5)}</div>
                    <div style="color:#ff8866;">0.5: ${fibonacciLevels.level500.toFixed(5)}</div>
                    <div style="color:#ff6688;">0.618: ${fibonacciLevels.level618.toFixed(5)}</div>
                    <div style="color:#ff66aa;">0.786: ${fibonacciLevels.level786.toFixed(5)}</div>
                    <div style="color:#00ffaa;">161.8%: ${fibonacciLevels.extension1618.toFixed(5)}</div>
                </div>
            </div>`;
        }
    }
    
    function getOptimalEntry(price, direction) {
        if (!SETTINGS.useSmartEntry) return price;
        if (direction === "CALL") {
            let demandZone = getNearestDemandZone(price);
            if (demandZone && price > demandZone.price) return demandZone.price;
            return fibonacciLevels.level382 || price;
        } else {
            let supplyZone = getNearestSupplyZone(price);
            if (supplyZone && price < supplyZone.price) return supplyZone.price;
            return fibonacciLevels.level618 || price;
        }
    }
    
    function getOptimalTP(entryPrice, direction) {
        if (!SETTINGS.useFibonacciLevels) {
            return direction === "CALL" ? entryPrice + SETTINGS.takeProfitPips/10000 : entryPrice - SETTINGS.takeProfitPips/10000;
        }
        if (direction === "CALL") {
            let supplyZone = getNearestSupplyZone(entryPrice);
            if (supplyZone && supplyZone.price > entryPrice) return supplyZone.price;
            return fibonacciLevels.level618;
        } else {
            let demandZone = getNearestDemandZone(entryPrice);
            if (demandZone && demandZone.price < entryPrice) return demandZone.price;
            return fibonacciLevels.level382;
        }
    }
    
    function getOptimalSL(entryPrice, direction) {
        if (!SETTINGS.useFibonacciLevels) {
            return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
        }
        if (direction === "CALL") {
            let demandZone = getNearestDemandZone(entryPrice);
            if (demandZone && demandZone.price < entryPrice) return demandZone.price - 0.0002;
            return fibonacciLevels.level236;
        } else {
            let supplyZone = getNearestSupplyZone(entryPrice);
            if (supplyZone && supplyZone.price > entryPrice) return supplyZone.price + 0.0002;
            return fibonacciLevels.level786;
        }
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

    function updateTimeframeDisplay() {
        const timeframeEl = document.getElementById('st-tf-value');
        if (timeframeEl && selectedTimeframe) {
            timeframeEl.innerText = selectedTimeframe;
        }
        
        const timeframeDisplay = document.getElementById('current-timeframe-display');
        if (timeframeDisplay && selectedTimeframe && TIMEFRAMES[selectedTimeframe]) {
            let config = TIMEFRAMES[selectedTimeframe];
            let categoryLabels = {
                scalp_ultra: "⚡ سكالبينج فائق السرعة",
                scalp_fast: "🔥 سكالبينج سريع",
                intraday: "📈 تداول يومي",
                swing: "🌊 تداول تأرجح",
                position: "🏔 تداول طويل الأمد"
            };
            let catLabel = categoryLabels[config.category] || "";
            let activeCount = getActiveStrategies().length;
            timeframeDisplay.innerHTML = `📊 ${config.name} (${selectedTimeframe}) | ${catLabel}<br><span style="color:#88ccff;font-size:9px;">${activeCount} استراتيجية | انتظار ${config.waitSeconds} ثانية</span>`;
        }
    }

    function resetAnalysis() {
        if (botRunning) {
            priceHistory = [];
            demandZones = [];
            supplyZones = [];
            orderBlocks = [];
            console.log("%c ✅ تم إعادة تعيين التحليل ", "color: #00ffaa; font-weight: bold;");
        }
    }

    function getChartData() {
        if (priceHistory.length === 0) return [];
        return priceHistory.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 1000
        }));
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
        
        currentTrade = {
            id: Date.now(), direction: signal, entryPrice: optimalEntry, originalPrice: price,
            confidence: confidence, reason: reason, openTime: new Date(),
            takeProfit: optimalTP, stopLoss: optimalSL, status: "open"
        };
        
        dailyTradesCount++;
        updateTradeMemory(signal, optimalEntry);
        updateTradesDisplay();
        showTradeNotification("فتح صفقة", currentTrade);
        
        if(SETTINGS.autoExecuteTrades) {
            setTimeout(() => { executeTradeOrder(signal); }, 500);
        }
        
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
        if(tradesHistory.length > 30) tradesHistory.pop();
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
            let currentProfit = currentTrade.direction === "CALL" ? (currentPrice - currentTrade.entryPrice) * 10000 : (currentTrade.entryPrice - currentPrice) * 10000;
            let profitColor = currentProfit >= 0 ? "#00ffaa" : "#ff4466";
            html += `<div style="background:rgba(0,255,170,0.1);border-radius:12px;padding:10px;margin-bottom:10px;border-right:3px solid ${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"}">
                <div style="display:flex;justify-content:space-between;"><span style="color:#fff;font-size:12px;font-weight:bold;">🔓 صفقة مفتوحة</span>
                <span style="color:${currentTrade.direction === "CALL" ? "#00ffaa" : "#ff4466"};font-size:12px;font-weight:bold;">${currentTrade.direction === "CALL" ? "شراء CALL" : "بيع PUT"}</span></div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:5px;"><span>الدخول: ${currentTrade.entryPrice.toFixed(5)}</span>
                <span style="color:${profitColor};">الربح الحالي: ${currentProfit > 0 ? '+' : ''}${currentProfit.toFixed(1)}</span></div>
                <div style="font-size:9px;color:#aaa;margin-top:3px;">🎯 TP: ${currentTrade.takeProfit.toFixed(5)} | 🛑 SL: ${currentTrade.stopLoss.toFixed(5)}</div>
            </div>`;
        }
        if(tradesHistory.length > 0) {
            html += `<div style="max-height:160px;overflow-y:auto;"><div style="font-size:10px;color:#888;margin-bottom:5px;">📋 آخر الصفقات:</div>`;
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

    // ========== عرض الإشارة (شريط سفلي متحرك - يمكن التحكم بحجمه ومسافته) ==========
function showSignal(direction, strength, confidence, reason, candlePattern = null) {
    let entryPrice = currentPrice > 0 ? currentPrice : 1.10000;
    let optimalEntry = getOptimalEntry(entryPrice, direction);
    
    let isCall = direction === "CALL";
    let mc = isCall ? "#00ffaa" : "#ff4466";
    let title = isCall ? "إشارة : شراء - BUY" : "إشارة : بيع - SELL";
    let icon = isCall ? "🟢" : "🔴";
    
    let candleInfo = candlePattern ? `<span style="color:#ffaa66;font-size:9px;"> | 📊 ${candlePattern}</span>` : '';
    
    if(canOpenTrade() && SETTINGS.autoExecuteTrades) {
        openTrade(direction, entryPrice, confidence, reason);
    }

    // ====== إعدادات التحكم (عدل من هنا) ======
    let barHeight = 60;           // الارتفاع بالبكسل (60-80 مناسب)
    let barWidth = 90;            // العرض بالنسبة المئوية (80-95)
    let bottomDistance = 80;      // المسافة من الأسفل بالبكسل (20-150)
    let fontSize = 12;            // حجم الخط الرئيسي
    let iconSize = 20;            // حجم الأيقونة
    // ======================================

    let bar = document.createElement('div');
    bar.id = 'signal-bottom-bar';
    bar.style.cssText = `
        position: fixed;
        bottom: -100px;
        left: 50%;
        transform: translateX(-50%);
        width: ${barWidth}%;
        max-width: 650px;
        height: ${barHeight}px;
        background: rgba(10, 15, 25, 0.95);
        backdrop-filter: blur(12px);
        z-index: 1000000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-radius: ${barHeight/2}px;
        border-right: 3px solid ${mc};
        border-left: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 8px 25px rgba(0,0,0,0.4);
        direction: rtl;
        font-family: 'Segoe UI', Tahoma, sans-serif;
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    `;

    bar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: ${iconSize}px; filter: drop-shadow(0 0 3px ${mc});">${icon}</div>
            <div>
                <div style="color: ${mc}; font-size: ${fontSize}px; font-weight: bold;">${title}${candleInfo}</div>
                <div style="color: #aaa; font-size: ${fontSize-5}px; margin-top: 2px;">✨ ${reason.substring(0, 45)}...</div>
            </div>
        </div>

        <div style="display: flex; gap: 20px;">
            <div style="text-align: center;">
                <div style="color: #888; font-size: ${fontSize-6}px;">الثقة</div>
                <div style="color: #ffd966; font-size: ${fontSize+2}px; font-weight: bold;">${confidence.toFixed(0)}%</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #888; font-size: ${fontSize-6}px;">الدخول</div>
                <div style="color: #00ffaa; font-size: ${fontSize-2}px; font-weight: bold;">${optimalEntry.toFixed(5)}</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #888; font-size: ${fontSize-6}px;">القوة</div>
                <div style="color: #ffaa66; font-size: ${fontSize-2}px; font-weight: bold;">${strength}</div>
            </div>
        </div>

        <div style="position: absolute; bottom: 0; left: 0; height: 3px; background: ${mc}; width: 100%; border-radius: 0 0 ${barHeight/2}px ${barHeight/2}px; transition: width linear;"></div>
    `;

    document.body.appendChild(bar);

    // إظهار الشريط من الأسفل للمسافة المحددة
    setTimeout(() => { bar.style.bottom = `${bottomDistance}px`; }, 50);

    // مؤشر الوقت
    let startTime = Date.now();
    let duration = SETTINGS.signalDuration;
    let progressBar = bar.querySelector('div[style*="position: absolute"]');
    
    let timerInterval = setInterval(() => {
        let elapsed = Date.now() - startTime;
        let remaining = Math.max(0, 100 - (elapsed / duration * 100));
        if(progressBar) progressBar.style.width = remaining + '%';
        if(elapsed >= duration) clearInterval(timerInterval);
    }, 20);

    // إخفاء وحذف الشريط
    setTimeout(() => {
        bar.style.bottom = '-100px';
        setTimeout(() => { 
            if(bar && bar.remove) bar.remove(); 
        }, 400);
    }, SETTINGS.signalDuration);
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

    // ========== التحليل الذكي ==========
    function smartAnalysis() {
        // 1. فحص السيولة أولاً (قاعدة ذهبية)
        if(!checkLiquidity()) { 
            if(searchStatusDiv) updateSearchStatus("⚠️ سيولة منخفضة...");
            return; 
        }
        
        // 2. فحص توافق الفريمات
        if(!checkTimeframeAlignment()) return;
        
        // 3. التحليل
        let candles = getChartData();
        if(candles.length < 10) return;
        
        let active = getActiveStrategies();
        let signals = [];
        for(let s of active){
            try{
                let r = s(candles);
                if(r && r.signal !== "NEUTRAL" && r.confidence >= SETTINGS.minConfidence) signals.push(r);
            } catch(e) {}
        }
        
        let tot = signals.length;
        if(tot === 0) {
            if(searchStatusDiv && botRunning) updateSearchStatus("🔍 جاري التحليل...");
            updateLastSignal({signal:"NEUTRAL",reason:"جاري التحليل...",confidence:0});
            return;
        }
        
        let callWeight = signals.filter(s=>s.signal==="CALL").reduce((sum,s)=>sum + s.confidence, 0);
        let putWeight = signals.filter(s=>s.signal==="PUT").reduce((sum,s)=>sum + s.confidence, 0);
        let totalWeight = callWeight + putWeight;
        let callPercent = totalWeight > 0 ? (callWeight / totalWeight) * 100 : 0;
        let putPercent = totalWeight > 0 ? (putWeight / totalWeight) * 100 : 0;
        let tfWeight = TIMEFRAMES[selectedTimeframe]?.weight || 0.85;
        let finalCallConfidence = callPercent * tfWeight;
        let finalPutConfidence = putPercent * tfWeight;
        
        let bestSignal = null;
        if(finalCallConfidence > finalPutConfidence && finalCallConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="CALL").sort((a,b)=>b.confidence - a.confidence)[0];
            bestSignal = {signal:"CALL", confidence:Math.min(finalCallConfidence, 98), strength:best?.strength||"قوية", reason:best?.reason || `${signals.filter(s=>s.signal==="CALL").length}/${tot} استراتيجية للصعود`, candlePattern: best?.candlePattern};
        }
        if(finalPutConfidence > finalCallConfidence && finalPutConfidence >= SETTINGS.minConfidence){
            let best = signals.filter(s=>s.signal==="PUT").sort((a,b)=>b.confidence - a.confidence)[0];
            bestSignal = {signal:"PUT", confidence:Math.min(finalPutConfidence, 98), strength:best?.strength||"قوية", reason:best?.reason || `${signals.filter(s=>s.signal==="PUT").length}/${tot} استراتيجية للهبوط`, candlePattern: best?.candlePattern};
        }
        
        if(bestSignal && bestSignal.signal !== "NEUTRAL") {
            // فحص القمة التاريخية
            if(isAtHistoricalPeak(currentPrice, bestSignal.signal)) return;
            
            // فحص الفرصة الجديدة (لمنع التكرار)
            if(!isNewOpportunity(bestSignal.signal, currentAsset)) return;
            
            // فحص تغير السعر
            if(Math.abs(currentPrice - lastSignalPrice) < 0.00002) return;
            
            hideSearchingStatus();
            showSignal(bestSignal.signal, bestSignal.strength, bestSignal.confidence, bestSignal.reason, bestSignal.candlePattern);
            lastSignalPrice = currentPrice;
            lastSignalTime = Date.now();
            updateLastSignal(bestSignal);
        } else {
            if(!searchStatusDiv && botRunning) showSearchingStatus();
            updateLastSignal({signal:"NEUTRAL",reason:"جاري التحليل...",confidence:0});
        }
        updateTradesDisplay();
        detectSupplyDemandZones();
    }
    
    function updateSearchStatus(msg) {
        if(searchStatusDiv) searchStatusDiv.innerHTML = msg;
    }
    
    function updateLastSignal(a) {
        let d=document.getElementById('last-signal');
        if(d){
            let color=a.signal==="CALL"?"#00ffaa":a.signal==="PUT"?"#ff4466":"#ffd966";
            let text=a.signal==="CALL"?"شراء":a.signal==="PUT"?"بيع":"تحليل";
            d.innerHTML=`<div style="background:rgba(0,0,0,0.5);border-radius:12px;padding:10px;border-right:3px solid ${color};">
                <div style="display:flex;justify-content:space-between;"><span style="color:${color};font-weight:bold;">${text}</span>
                <span style="color:#ffd966;">${a.confidence>0?a.confidence.toFixed(0)+'%':''}</span></div>
                <div style="font-size:10px;color:#aaa;margin-top:3px;">${(a.reason||'...').substring(0,40)}</div>
            </div>`;
        }
    }

    function analysisLoop() {
        if(!botRunning) return;
        let now=Date.now();
        if(now-lastSignalTime<calculateWaitTime()) return;
        smartAnalysis();
    }

    // ========== واجهة المستخدم ==========
    function createUI() {
        let ex=document.getElementById('obeida-ui'); if(ex) ex.remove();
        
        let style = document.createElement('style');
        style.textContent = `
            @keyframes pulse { 0% { opacity: 0.7; } 100% { opacity: 1; } }
            @keyframes glow { 0% { box-shadow: 0 0 5px rgba(0,255,170,0.3); } 100% { box-shadow: 0 0 20px rgba(0,255,170,0.6); } }
            @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
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
                        <div><h3 style="color:#ffd966;margin:0;font-size:15px;font-weight:bold;">Obeida BOT V2</h3>
                        <div style="font-size:9px;color:#88ccff;"> 🤯 ملوك التداول الألي 🤯</div></div>
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
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
                    <div style="background:#00000055;border-radius:18px;padding:8px;text-align:center;">
                        <div style="font-size:8px;color:#aaa;">🏦 الحساب</div>
                        <div id="current-account-display" style="font-size:11px;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:#00000055;border-radius:18px;padding:8px;text-align:center;">
                        <div style="font-size:8px;color:#aaa;">💧 السيولة</div>
                        <div id="current-liquidity-display" style="font-size:11px;font-weight:bold;">---</div>
                    </div>
                    <div style="background:#00000055;border-radius:18px;padding:8px;text-align:center;">
                        <div style="font-size:8px;color:#aaa;">📊 فيبوناتشي</div>
                        <div style="font-size:10px;color:#00ffaa;" id="fib-status">✅ مفعل</div>
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
                    ⚡ تحليل حقيقي كامل || ${STRATEGIES.length} استراتيجية || تنفيذ تلقائي ⚡
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
            document.addEventListener('mouseup', () => { isDragging = false; ui.style.transition = ''; });
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
        
        if(closeBtn) closeBtn.onclick = () => { if(botRunning) stopAnalysis(); ui.remove(); };
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
                <h3 style="color:#ffd966;text-align:center;margin-bottom:20px;">⚙️ إعدادات البوت V9</h3>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:12px;">🎯 جني الربح (نقطة):</label>
                <input type="number" id="tp-setting" value="${SETTINGS.takeProfitPips}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:12px;">🛑 وقف الخسارة (نقطة):</label>
                <input type="number" id="sl-setting" value="${SETTINGS.stopLossPips}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:12px;">📊 الحد الأقصى للصفقات اليومية:</label>
                <input type="number" id="max-trades" value="${SETTINGS.maxTradesPerDay}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:12px;">🎯 الحد الأدنى للثقة (%):</label>
                <input type="number" id="min-conf" value="${SETTINGS.minConfidence}" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:12px;">🤖 التنفيذ التلقائي:</label>
                <select id="auto-exec" style="width:100%;padding:8px;margin-top:5px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:10px;">
                    <option value="true" ${SETTINGS.autoExecuteTrades ? 'selected' : ''}>مفعل</option>
                    <option value="false" ${!SETTINGS.autoExecuteTrades ? 'selected' : ''}>معطل</option>
                </select></div>
                <button id="save-settings" class="btn-hover" style="width:100%;padding:10px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:20px;color:#000;cursor:pointer;font-weight:bold;">حفظ الإعدادات</button>
                <button id="close-settings" class="btn-hover" style="width:100%;margin-top:10px;padding:8px;background:#333;border:none;border-radius:20px;color:#fff;cursor:pointer;">إغلاق</button>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('save-settings').onclick=()=>{
            SETTINGS.takeProfitPips=parseInt(document.getElementById('tp-setting').value) || 50;
            SETTINGS.stopLossPips=parseInt(document.getElementById('sl-setting').value) || 25;
            SETTINGS.maxTradesPerDay=parseInt(document.getElementById('max-trades').value) || 10;
            SETTINGS.minConfidence=parseInt(document.getElementById('min-conf').value) || 75;
            SETTINGS.autoExecuteTrades=document.getElementById('auto-exec').value === 'true';
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
                <h2 style="color:#ffd966;margin:10px 0;">Obeida BOT V2</h2>
                <p style="color:#88ccff;font-size:12px;">تحليل حقيقي مربوط في سوق</p>
                <p style="color:#ffaa66;font-size:11px;">🔑 أدخل كلمة المرور للمتابعة 🔑</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور"
                    style="width:100%;padding:12px;margin:20px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:30px;text-align:center;font-size:14px;">
                <button id="login-btn" class="btn-hover" style="width:100%;padding:12px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:30px;color:#000;cursor:pointer;font-weight:bold;">تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:20px;font-size:11px;">📢 للحصول على كلمة المرور: <span id="tg-link" style="color:#88ccff;cursor:pointer;">@ObeidaTrading</span></p>
                <div style="font-size:9px;color:#555;margin-top:15px;">⚡ البوت الأقوى في العالم العربي ⚡</div>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('login-btn').onclick=()=>{
            if(document.getElementById('pass-input').value===BOT_PASSWORD){
                isAuthenticated=true;
                modal.remove();
                createUI();
                initPriceRadarV2();
                initAssetDetectionV2();
                initTimeframeDetectionV2();
                initAccountDetectionV2();
                initLiquidityDetection();
                initChartDataCapture();
                updateFibonacciLevels();
                detectSupplyDemandZones();
            } else { alert("❌ كلمة المرور غير صحيحة ❌"); }
        };
        document.getElementById('tg-link').onclick=()=>window.open('https://t.me/ObeidaTrading','_blank');
        document.getElementById('pass-input').addEventListener('keypress',e=>{if(e.key==='Enter') document.getElementById('login-btn').click();});
    }

    function startAnalysis() {
        if(!isAuthenticated){alert("🔐 الرجاء إدخال كلمة المرور");showPasswordModal();return;}
        if(!selectedTimeframe){showNotification("⚠️ الرجاء الانتظار حتى يتم اكتشاف الفريم تلقائياً", "#ffaa66");return;}
        if(botRunning) return;
        botRunning=true;
        botInterval=setInterval(analysisLoop,SETTINGS.checkInterval);
        document.getElementById('start-btn').style.display='none';
        document.getElementById('stop-btn').style.display='flex';
        document.getElementById('status-text').innerHTML=`🟢 يعمل | ${selectedTimeframe} | ${getActiveStrategies().length} استراتيجية | تنفيذ تلقائي ${SETTINGS.autoExecuteTrades ? '✅' : '❌'}`;
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

    console.log(`✨ Obeida Trading V2 Ultimate ✨`);
    showPasswordModal();

    window.ObeidaPro = {
        start: startAnalysis,
        stop: stopAnalysis,
        status: ()=>botRunning?"يعمل":"متوقف",
        getCurrentPrice: ()=>currentPrice,
        getTimeframe: ()=>selectedTimeframe,
        getCurrentAsset: ()=>currentAsset,
        getAccountType: ()=>currentAccountType,
        getLiquidity: ()=>currentLiquidity,
        getActiveStrategies: ()=>getActiveStrategies().map(s=>s._name),
        getActiveCount: ()=>getActiveStrategies().length,
        getFibonacciLevels: ()=>fibonacciLevels,
        getDemandZones: ()=>demandZones,
        getSupplyZones: ()=>supplyZones,
        version: "V2 ULTIMATE - Obeida Trading",
        strategies: STRATEGIES.length,
        setAutoExecute: (val) => SETTINGS.autoExecuteTrades = val
    };

})();
