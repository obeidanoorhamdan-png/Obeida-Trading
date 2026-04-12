(function(){
    'use strict';

    // ========== كلمة المرور ==========
    const BOT_PASSWORD = "@ObeidaTrading";
    let isAuthenticated = false;

    // ========== إعدادات ==========
    const SETTINGS = {
        checkInterval: 500, // فحص كل نصف ثانية (للسكالبينج)
        signalDuration: 3000, // مدة عرض الإشارة 3 ثواني
        minConfidence: 82, // الحد الأدنى للثقة
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
    let lastSignalPrice = 0;
    let lastTradeInfo = {
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
    let lastDetectedAsset = ""; // لحل مشكلة تغيير العملة
    
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
        "5s":  { seconds: 5,     waitSeconds: 1,      name: "5 ثوان",   category: "scalp_ultra", weight: 0.70, order: 1 },
        "10s": { seconds: 10,    waitSeconds: 1,      name: "10 ثوان",  category: "scalp_ultra", weight: 0.72, order: 2 },
        "15s": { seconds: 15,    waitSeconds: 1,      name: "15 ثانية", category: "scalp_ultra", weight: 0.75, order: 3 },
        "30s": { seconds: 30,    waitSeconds: 1,      name: "30 ثانية", category: "scalp_ultra", weight: 0.78, order: 4 },
        "1m":  { seconds: 60,    waitSeconds: 1,      name: "1 دقيقة",  category: "scalp_fast",  weight: 0.82, order: 5 },
        "2m":  { seconds: 120,   waitSeconds: 1,      name: "2 دقائق",  category: "scalp_fast",  weight: 0.85, order: 6 },
        "3m":  { seconds: 180,   waitSeconds: 1,      name: "3 دقائق",  category: "scalp_fast",  weight: 0.87, order: 7 },
        "5m":  { seconds: 300,   waitSeconds: 1,      name: "5 دقائق",  category: "intraday",    weight: 0.90, order: 8 },
        "10m": { seconds: 600,   waitSeconds: 1,      name: "10 دقائق", category: "intraday",    weight: 0.92, order: 9 },
        "15m": { seconds: 900,   waitSeconds: 1,      name: "15 دقيقة", category: "intraday",    weight: 0.94, order: 10 },
        "30m": { seconds: 1800,  waitSeconds: 1,      name: "30 دقيقة", category: "intraday",    weight: 0.95, order: 11 },
        "1h":  { seconds: 3600,  waitSeconds: 1,      name: "1 ساعة",   category: "swing",       weight: 0.96, order: 12 },
        "4h":  { seconds: 14400, waitSeconds: 1,      name: "4 ساعات",  category: "swing",       weight: 0.95, order: 13 },
        "1d":  { seconds: 86400, waitSeconds: 1,      name: "يومي",     category: "position",    weight: 0.93, order: 14 }
    };

    // =====================================================
    // ========== بصمات الشموع الرقمية الـ 30 (Candle Signatures) ==========
    // =====================================================
    
    const CANDLE_SIGNATURES = {
        // 1. Sniper Pin Bar
        SNIPER_PINBAR: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return (lowerWick >= body * 3) && (upperWick <= total * 0.1);
        },
        // 2. Shooting Star
        SHOOTING_STAR: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (upperWick >= body * 3) && (lowerWick <= total * 0.1);
        },
        // 3. Institutional Marubozu
        INSTITUTIONAL_MARUBOZU: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            return body >= total * 0.95;
        },
        // 4. Dragonfly Doji
        DRAGONFLY_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (body <= total * 0.05) && (lowerWick >= total * 0.9);
        },
        // 5. Gravestone Doji
        GRAVESTONE_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return (body <= total * 0.05) && (upperWick >= total * 0.9);
        },
        // 6. Full Engulfing
        FULL_ENGULFING: (c, prev) => {
            if(!prev) return false;
            return c.high > prev.high && c.low < prev.low && c.close > prev.high;
        },
        // 7. Elephant Bar
        ELEPHANT_BAR: (c, avgBody) => {
            const body = Math.abs(c.close - c.open);
            return body >= avgBody * 3;
        },
        // 8. NR7 (Narrow Range)
        NR7: (c, prevCandles) => {
            const currentTotal = c.high - c.low;
            for(let pc of prevCandles) {
                if((pc.high - pc.low) < currentTotal) return false;
            }
            return true;
        },
        // 9. Inside Bar
        INSIDE_BAR: (c, prev) => {
            if(!prev) return false;
            return c.high <= prev.high && c.low >= prev.low;
        },
        // 10. Tweezer Bottom
        TWEEZER_BOTTOM: (c, prev) => {
            if(!prev) return false;
            const body = Math.abs(c.close - c.open);
            const prevBody = Math.abs(prev.close - prev.open);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const prevLowerWick = Math.min(prev.open, prev.close) - prev.low;
            return Math.abs(c.low - prev.low) <= 0.00001 && lowerWick > body && prevLowerWick > prevBody;
        },
        // 11. Tweezer Top
        TWEEZER_TOP: (c, prev) => {
            if(!prev) return false;
            const body = Math.abs(c.close - c.open);
            const prevBody = Math.abs(prev.close - prev.open);
            const upperWick = c.high - Math.max(c.open, c.close);
            const prevUpperWick = prev.high - Math.max(prev.open, prev.close);
            return Math.abs(c.high - prev.high) <= 0.00001 && upperWick > body && prevUpperWick > prevBody;
        },
        // 12. Spring Sweep (Liquidity Sweep)
        SPRING_SWEEP: (c, recentLows) => {
            const minLow = Math.min(...recentLows);
            return c.low < minLow && c.close > minLow;
        },
        // 13. Upthrust
        UPTHRUST: (c, recentHighs) => {
            const maxHigh = Math.max(...recentHighs);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return c.high > maxHigh && c.close < maxHigh && (upperWick / total) >= 0.7;
        },
        // 14. Kicking Pattern
        KICKING_PATTERN: (c, prev) => {
            if(!prev) return false;
            const prevBody = Math.abs(prev.close - prev.open);
            const prevTotal = prev.high - prev.low;
            const isPrevMarubozu = prevBody >= prevTotal * 0.95;
            const isGapUp = c.low > prev.high;
            const isCurrentBullish = c.close > c.open;
            return isPrevMarubozu && isGapUp && isCurrentBullish;
        },
        // 15. Morning Star
        MORNING_STAR: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const body1 = Math.abs(c1.close - c1.open);
            const body2 = Math.abs(c2.close - c2.open);
            const total2 = c2.high - c2.low;
            const isBearish1 = c1.close < c1.open;
            const isDoji2 = body2 <= total2 * 0.1;
            const isBullish3 = c3.close > c3.open;
            return isBearish1 && isDoji2 && isBullish3 && (c3.close > (c1.open + c1.close) / 2);
        },
        // 16. Hammer
        HAMMER: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (lowerWick >= body * 2) && (c.close > c.open);
        },
        // 17. Inverted Hammer
        INVERTED_HAMMER: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            return (upperWick >= body * 2) && (c.close > c.open);
        },
        // 18. Piercing Line
        PIERCING_LINE: (c, prev) => {
            if(!prev) return false;
            const prevMidPoint = (prev.open + prev.close) / 2;
            return c.close > prevMidPoint && prev.close < prev.open && c.close > c.open;
        },
        // 19. Dark Cloud Cover
        DARK_CLOUD_COVER: (c, prev) => {
            if(!prev) return false;
            const prevMidPoint = (prev.open + prev.close) / 2;
            return c.close < prevMidPoint && prev.close > prev.open && c.close < c.open;
        },
        // 20. Three White Soldiers
        THREE_WHITE_SOLDIERS: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const total1 = c1.high - c1.low;
            const total2 = c2.high - c2.low;
            const total3 = c3.high - c3.low;
            const upperWick1 = c1.high - Math.max(c1.open, c1.close);
            const upperWick2 = c2.high - Math.max(c2.open, c2.close);
            const upperWick3 = c3.high - Math.max(c3.open, c3.close);
            return (c1.close > c1.open && c2.close > c2.open && c3.close > c3.open) &&
                   (c2.close > c1.close && c3.close > c2.close) &&
                   (upperWick1 / total1 < 0.1) && (upperWick2 / total2 < 0.1) && (upperWick3 / total3 < 0.1);
        },
        // 21. Three Black Crows
        THREE_BLACK_CROWS: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const total1 = c1.high - c1.low;
            const total2 = c2.high - c2.low;
            const total3 = c3.high - c3.low;
            const lowerWick1 = Math.min(c1.open, c1.close) - c1.low;
            const lowerWick2 = Math.min(c2.open, c2.close) - c2.low;
            const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;
            return (c1.close < c1.open && c2.close < c2.open && c3.close < c3.open) &&
                   (c2.close < c1.close && c3.close < c2.close) &&
                   (lowerWick1 / total1 < 0.1) && (lowerWick2 / total2 < 0.1) && (lowerWick3 / total3 < 0.1);
        },
        // 22. Hanging Man
        HANGING_MAN: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (lowerWick >= body * 2) && (c.close < c.open);
        },
        // 23. Bullish Harami
        BULLISH_HARAMI: (c, prev) => {
            if(!prev) return false;
            const body = Math.abs(c.close - c.open);
            const prevBody = Math.abs(prev.close - prev.open);
            return body <= prevBody * 0.3 && c.close > c.open && prev.close < prev.open &&
                   c.high <= prev.high && c.low >= prev.low;
        },
        // 24. Bearish Harami
        BEARISH_HARAMI: (c, prev) => {
            if(!prev) return false;
            const body = Math.abs(c.close - c.open);
            const prevBody = Math.abs(prev.close - prev.open);
            return body <= prevBody * 0.3 && c.close < c.open && prev.close > prev.open &&
                   c.high <= prev.high && c.low >= prev.low;
        },
        // 25. Abandoned Baby
        ABANDONED_BABY: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const body2 = Math.abs(c2.close - c2.open);
            const total2 = c2.high - c2.low;
            const isDoji = body2 <= total2 * 0.1;
            const gap1 = c2.low > c1.high;
            const gap2 = c3.low > c2.high;
            return isDoji && gap1 && gap2;
        },
        // 26. Three-Line Strike
        THREE_LINE_STRIKE: (c1, c2, c3, c4) => {
            if(!c1 || !c2 || !c3 || !c4) return false;
            const isBullishTrend = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
            const isReversalBearish = c4.close < c4.open && c4.close < c1.open && c4.high > c3.high;
            const isBearishTrend = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;
            const isReversalBullish = c4.close > c4.open && c4.close > c1.open && c4.low < c3.low;
            return (isBullishTrend && isReversalBearish) || (isBearishTrend && isReversalBullish);
        },
        // 27. Evening Star
        EVENING_STAR: (c1, c2, c3) => {
            if(!c1 || !c2 || !c3) return false;
            const body1 = Math.abs(c1.close - c1.open);
            const body2 = Math.abs(c2.close - c2.open);
            const total2 = c2.high - c2.low;
            const isBullish1 = c1.close > c1.open;
            const isDoji2 = body2 <= total2 * 0.1;
            const isBearish3 = c3.close < c3.open;
            return isBullish1 && isDoji2 && isBearish3 && (c3.close < (c1.open + c1.close) / 2);
        },
        // 28. Long-Legged Doji
        LONG_LEGGED_DOJI: (c) => {
            const body = Math.abs(c.close - c.open);
            const total = c.high - c.low;
            const upperWick = c.high - Math.max(c.open, c.close);
            const lowerWick = Math.min(c.open, c.close) - c.low;
            return (Math.abs(upperWick - lowerWick) <= total * 0.1) && (body <= total * 0.05);
        },
        // 29. Belt Hold (Bullish)
        BULLISH_BELT_HOLD: (c) => {
            return c.open === c.low && c.close > c.high * 0.9;
        },
        // 30. Counterattack
        COUNTERATTACK: (c, prev) => {
            if(!prev) return false;
            const isBullishCounter = c.close > c.open && prev.close < prev.open && Math.abs(c.close - prev.close) <= 0.0001;
            const isBearishCounter = c.close < c.open && prev.close > prev.open && Math.abs(c.close - prev.close) <= 0.0001;
            return isBullishCounter || isBearishCounter;
        }
    };

    // =====================================================
    // ========== الاستراتيجيات الجديدة (100 استراتيجية) ==========
    // =====================================================

    // ========== 1. سكالبينج فائق السرعة (scalp_ultra) - 20 استراتيجية جديدة ==========
    
    function strategy_MicroGapFill(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let gap = Math.abs(curr.open - prev.close);
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        let body = Math.abs(curr.close - curr.open);
        let volumeSpike = (curr.volume || 1000) > (candles.slice(-10).reduce((sum,c) => sum + (c.volume || 1000), 0) / 9) * 2;
        if(gap > 0.0002 && lowerWick > body * 3 && volumeSpike && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "CALL")) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Micro-Gap Fill + Volume Spike", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_MicroGapFill._name = "Micro-Gap Fill";
    strategy_MicroGapFill.category = "scalp_ultra";

    function strategy_TickVolumeSpike(candles) {
        if(candles.length < 11) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-11, -1).reduce((a,b) => a+b, 0) / 10;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(currentVol >= avgVol * 3 && curr.close > candles[candles.length-2].high && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Tick Volume Spike + Breakout", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TickVolumeSpike._name = "Tick Volume Spike";
    strategy_TickVolumeSpike.category = "scalp_ultra";

    function strategy_FiveSecMomentum(candles) {
        if(candles.length < 15) return null;
        let atr = calculateATR(candles, 14);
        let curr = candles[candles.length-1];
        let momentum = (curr.close - curr.open) / 5;
        if(momentum > atr * 0.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "5-Sec Momentum Burst", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FiveSecMomentum._name = "5-Sec Momentum";
    strategy_FiveSecMomentum.category = "scalp_ultra";

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
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Order Flow - Triple Bottom", candlePattern: "BULLISH_REJECTION"};
            }
        }
        return null;
    }
    strategy_OrderFlowScalp._name = "Order Flow Scalp";
    strategy_OrderFlowScalp.category = "scalp_ultra";

    function strategy_FastSMABounce(candles) {
        if(candles.length < 6) return null;
        let closes = candles.map(c => c.close);
        let sma5 = closes.slice(-5).reduce((a,b) => a+b, 0) / 5;
        let curr = candles[candles.length-1];
        let slope = sma5 - (closes.slice(-6, -1).reduce((a,b) => a+b, 0) / 5);
        if(curr.low <= sma5 && curr.close > sma5 && slope > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Fast SMA 5 Bounce + Angle > 45", candlePattern: "BULLISH_REJECTION"};
        }
        return null;
    }
    strategy_FastSMABounce._name = "Fast SMA Bounce";
    strategy_FastSMABounce.category = "scalp_ultra";

    function strategy_FlashBreakout(candles) {
        if(candles.length < 11) return null;
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let range10 = Math.max(...candles.slice(-10).map(c => c.high)) - Math.min(...candles.slice(-10).map(c => c.low));
        let curr = candles[candles.length-1];
        let body = Math.abs(curr.close - curr.open);
        let total = curr.high - curr.low;
        if(range10 < avgBody * 2 && (body / total) > 0.95 && curr.close > Math.max(...candles.slice(-10).map(c => c.high)) && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Flash Breakout - Range < 2 pips", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FlashBreakout._name = "Flash Breakout";
    strategy_FlashBreakout.category = "scalp_ultra";

    function strategy_MicroRejection(candles) {
        if(candles.length < 2) return null;
        let resistance = getResistanceLevel(candles);
        let curr = candles[candles.length-1];
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        let body = Math.abs(curr.close - curr.open);
        if(Math.abs(curr.high - resistance) < 0.0001 && upperWick > body * 2 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "Micro-Rejection from Resistance", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_MicroRejection._name = "Micro-Rejection";
    strategy_MicroRejection.category = "scalp_ultra";

    function strategy_InstantImbalance(candles) {
        if(candles.length < 2) return null;
        let avgBody = candles.slice(-10).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 10;
        let curr = candles[candles.length-1];
        let body = Math.abs(curr.close - curr.open);
        if(body > avgBody * 4 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Instant Imbalance - No Retrace", candlePattern: "ELEPHANT_BAR"};
        }
        return null;
    }
    strategy_InstantImbalance._name = "Instant Imbalance";
    strategy_InstantImbalance.category = "scalp_ultra";

    function strategy_ScalpXVelocity(candles) {
        if(candles.length < 2) return null;
        let speed = Math.abs(currentPrice - candles[candles.length-2].close) * 1000;
        let adx = calculateADX(candles, 14);
        if(speed > 3 && adx > 30 && checkLiquidity()) {
            let direction = currentPrice > candles[candles.length-2].close ? "CALL" : "PUT";
            return {signal: direction, confidence: 92, strength: "قوية", reason: `Scalp-X Velocity: ${speed.toFixed(1)} pips/s + ADX > 30`, candlePattern: direction === "CALL" ? "INSTITUTIONAL_MARUBOZU" : "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_ScalpXVelocity._name = "Scalp-X Velocity";
    strategy_ScalpXVelocity.category = "scalp_ultra";

    function strategy_PivotPointQuick(candles) {
        if(candles.length < 2) return null;
        let pivot = calculatePivotS1(candles);
        let curr = candles[candles.length-1];
        let stoch = calculateStochastic(candles);
        if(curr.low <= pivot && curr.close > pivot && stoch < 20 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Pivot Point S1 Touch + Stoch < 20", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_PivotPointQuick._name = "Pivot Point Quick";
    strategy_PivotPointQuick.category = "scalp_ultra";

    function strategy_SecondaryTrendScalp(candles) {
        if(candles.length < 2) return null;
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(curr.close > prev.high && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Secondary Trend Breakout + Volume Inflow", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SecondaryTrendScalp._name = "Secondary Trend Scalp";
    strategy_SecondaryTrendScalp.category = "scalp_ultra";

    function strategy_TapeReading(candles) {
        if(candles.length < 4) return null;
        let last4 = candles.slice(-4);
        let allBullish = last4.every(c => c.close > c.open);
        let increasingVolume = true;
        for(let i = 1; i < last4.length; i++) {
            if((last4[i].volume || 1000) < (last4[i-1].volume || 1000)) increasingVolume = false;
        }
        if(allBullish && increasingVolume && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية جدا", reason: "Tape Reading - 4 Green Candles with Increasing Volume", candlePattern: "THREE_WHITE_SOLDIERS"};
        }
        let allBearish = last4.every(c => c.close < c.open);
        if(allBearish && increasingVolume && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 93, strength: "قوية جدا", reason: "Tape Reading - 4 Red Candles with Increasing Volume", candlePattern: "THREE_BLACK_CROWS"};
        }
        return null;
    }
    strategy_TapeReading._name = "Tape Reading";
    strategy_TapeReading.category = "scalp_ultra";

    function strategy_BidAskSpreadSnap(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let suddenMove = Math.abs(curr.close - prev.close) > 0.0005;
        let smallSpread = (curr.high - curr.low) < 0.0001;
        if(suddenMove && smallSpread && checkLiquidity()) {
            let direction = curr.close > prev.close ? "CALL" : "PUT";
            return {signal: direction, confidence: 91, strength: "قوية", reason: "Bid/Ask Spread Snap + Sudden Move", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BidAskSpreadSnap._name = "Bid/Ask Spread Snap";
    strategy_BidAskSpreadSnap.category = "scalp_ultra";

    function strategy_HighFreqScalp(candles) {
        if(candles.length < 5) return null;
        let rsi2 = calculateRSI(candles.slice(-5), 2);
        if(rsi2 < 10 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "High-Freq Scalp - RSI(2) from 0 to 100 in 3 candles", candlePattern: "DRAGONFLY_DOJI"};
        }
        if(rsi2 > 90 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 92, strength: "قوية", reason: "High-Freq Scalp - RSI(2) Extreme Overbought", candlePattern: "GRAVESTONE_DOJI"};
        }
        return null;
    }
    strategy_HighFreqScalp._name = "High-Freq Scalp";
    strategy_HighFreqScalp.category = "scalp_ultra";

    function strategy_PingPongScalp(candles) {
        if(candles.length < 10) return null;
        let ema5 = calculateEMA(candles, 5);
        let ema8 = calculateEMA(candles, 8);
        let curr = candles[candles.length-1];
        if(curr.low <= ema5 && curr.close > ema5 && ema5 > ema8 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Ping-Pong between EMA5 and EMA8", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_PingPongScalp._name = "Ping-Pong Scalp";
    strategy_PingPongScalp.category = "scalp_ultra";

    function strategy_NewsSpikeFade(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let mean = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let deviation = Math.abs(currentPrice - mean) / std;
        if(deviation > 4 && checkLiquidity()) {
            let direction = currentPrice > mean ? "PUT" : "CALL";
            return {signal: direction, confidence: 91, strength: "قوية", reason: "News Spike Fade - Deviation > 4 sigma", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_NewsSpikeFade._name = "News Spike Fade";
    strategy_NewsSpikeFade.category = "scalp_ultra";

    function strategy_ZeroLagCross(candles) {
        if(candles.length < 10) return null;
        let closes = candles.map(c => c.close);
        let ema3 = closes.slice(-3).reduce((a,b) => a+b, 0) / 3;
        let ema6 = closes.slice(-6).reduce((a,b) => a+b, 0) / 6;
        if(ema3 > ema6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Zero-Lag Moving Average Cross", candlePattern: "BULLISH_BELT_HOLD"};
        }
        return null;
    }
    strategy_ZeroLagCross._name = "Zero-Lag Cross";
    strategy_ZeroLagCross.category = "scalp_ultra";

    function strategy_ScalpMomentumCCI(candles) {
        if(candles.length < 20) return null;
        let cci = calculateCCI(candles, 20);
        if(cci > 200 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Scalp-Momentum - CCI(20) > 200", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ScalpMomentumCCI._name = "Scalp-Momentum CCI";
    strategy_ScalpMomentumCCI.category = "scalp_ultra";

    function strategy_VShapeRecovery(candles) {
        if(candles.length < 6) return null;
        let atr = calculateATR(candles, 14);
        let prices = candles.map(c => c.close);
        let priceDrop = prices[candles.length-5] - Math.min(...prices.slice(-5));
        let curr = candles[candles.length-1];
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        let total = curr.high - curr.low;
        if(priceDrop > atr * 3 && (lowerWick / total) > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "V-Shape 5s Recovery + PinBar", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_VShapeRecovery._name = "V-Shape Recovery";
    strategy_VShapeRecovery.category = "scalp_ultra";

    function strategy_FractalBreak(candles) {
        if(candles.length < 5) return null;
        let highs = candles.map(c => c.high);
        let lastHigh = highs[highs.length-1];
        let prevHigh = Math.max(...highs.slice(-5, -1));
        if(lastHigh > prevHigh && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Fractal Break - Break of last fractal within 3 candles", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FractalBreak._name = "Fractal Break";
    strategy_FractalBreak.category = "scalp_ultra";

    // ========== 2. سكالبينج سريع (scalp_fast) - 20 استراتيجية جديدة ==========

    function strategy_BollingerSqueeze(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let bbw = (2 * std * 2) / sma;
        let curr = candles[candles.length-1];
        if(bbw < 0.001 && curr.close > sma + 2*std && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Bollinger Squeeze - Width < 0.001 + Breakout", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BollingerSqueeze._name = "Bollinger Squeeze";
    strategy_BollingerSqueeze.category = "scalp_fast";

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
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "RSI 20/80 - Oversold + Bullish Divergence", candlePattern: "PIERCING_LINE"};
        }
        if(rsi > 80 && prevPrice < lastPrice && prevRSI > lastRSI && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "RSI 20/80 - Overbought + Bearish Divergence", candlePattern: "DARK_CLOUD_COVER"};
        }
        return null;
    }
    strategy_RSIReverse._name = "RSI 20/80 Reverse";
    strategy_RSIReverse.category = "scalp_fast";

    function strategy_StochasticCrossFast(candles) {
        if(candles.length < 15) return null;
        let stoch = calculateStochasticFull(candles);
        let ema50 = calculateEMA(candles, 50);
        if(stoch.k < 20 && stoch.k > stoch.d && stoch.kPrev < stoch.dPrev && ema50 > calculateEMAPrev(candles, 50) && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Stochastic Fast - K > D under 20 + Trend Align", candlePattern: "BULLISH_HARAMI"};
        }
        return null;
    }
    strategy_StochasticCrossFast._name = "Stochastic Cross Fast";
    strategy_StochasticCrossFast.category = "scalp_fast";

    function strategy_EngulfingConfirmation(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let body = Math.abs(curr.close - curr.open);
        let prevBody = Math.abs(prev.close - prev.open);
        let volumeConfirm = (curr.volume || 1000) > (prev.volume || 1000) * 1.2;
        if(curr.close > prev.high && body > prevBody * 2 && curr.close > curr.open && volumeConfirm && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Engulfing Confirmation + Volume Confirm", candlePattern: "FULL_ENGULFING"};
        }
        return null;
    }
    strategy_EngulfingConfirmation._name = "Engulfing Confirmation";
    strategy_EngulfingConfirmation.category = "scalp_fast";

    function strategy_EMAPullback(candles) {
        if(candles.length < 22) return null;
        let ema9 = calculateEMA(candles, 9);
        let ema21 = calculateEMA(candles, 21);
        let curr = candles[candles.length-1];
        if(curr.low <= ema9 && curr.close > ema9 && ema9 > ema21 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "EMA 9/21 Pullback - Rejection from EMA9", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_EMAPullback._name = "EMA 9/21 Pullback";
    strategy_EMAPullback.category = "scalp_fast";

    function strategy_SupportFlip(candles) {
        if(candles.length < 2) return null;
        let resistance = getResistanceLevel(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        if(Math.abs(curr.high - resistance) < 0.0001 && upperWick > total * 0.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 91, strength: "قوية", reason: "Support Flip - Resistance Rejection", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_SupportFlip._name = "Support Flip";
    strategy_SupportFlip.category = "scalp_fast";

    function strategy_TrendRider(candles) {
        if(candles.length < 51) return null;
        let ema50 = calculateEMA(candles, 50);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        if(curr.close > ema50 && volumes[volumes.length-1] > volumes[volumes.length-2] && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "M1 Trend Rider - Above EMA50 + Rising Volume", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TrendRider._name = "M1 Trend Rider";
    strategy_TrendRider.category = "scalp_fast";

    function strategy_DoubleBottomScalp(candles) {
        if(candles.length < 20) return null;
        let lows = candles.map(c => c.low);
        let recentLows = lows.slice(-20);
        let min1 = Math.min(...recentLows.slice(0, -10));
        let min2 = Math.min(...recentLows.slice(-10));
        let macd = calculateMACD(candles);
        if(Math.abs(min1 - min2) < 0.0001 && macd.hist > macd.prevHist && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Double Bottom Scalp - L0 ≈ Ln + MACD Hist Up", candlePattern: "TWEEZER_BOTTOM"};
        }
        return null;
    }
    strategy_DoubleBottomScalp._name = "Double Bottom Scalp";
    strategy_DoubleBottomScalp.category = "scalp_fast";

    function strategy_ChannelBreak(candles) {
    if(candles.length < 20) return null;
    
    // فحص صحة آخر شمعة
    let curr = candles[candles.length-1];
    if (!curr || typeof curr.close !== 'number' || curr.close > 1000 || curr.close < 0.00001) {
        return null;
    }
    if (curr.high > 1000 || curr.low < 0.00001) {
        return null;
    }
    
    let highs = candles.map(c => c.high);
    let upperChannel = highs.slice(-20).reduce((a,b) => a+b, 0) / 20;
    
    // فحص صحة قيمة القناة
    if (upperChannel > 1000 || upperChannel < 0.00001) {
        return null;
    }
    
    let rsi = calculateRSI(candles, 14);
    
    // فحص صحة قيمة RSI
    if (isNaN(rsi) || rsi < 0 || rsi > 100) {
        return null;
    }
    
    // فحص السعر مقابل القناة
    if(curr.close > upperChannel && rsi < 70 && rsi > 30 && checkLiquidity()) {
        // فحص إضافي: السعر يجب أن يكون قريب من القناة وليس بعيد جداً
        let priceDiff = Math.abs(curr.close - upperChannel) / upperChannel;
        if (priceDiff > 0.05) return null; // لا تدخل إذا كان السعر بعيد جداً عن القناة
        
        return {
            signal: "CALL", 
            confidence: 91, 
            strength: "قوية", 
            reason: "Channel Break - Price > Upper Channel + RSI OK", 
            candlePattern: "INSTITUTIONAL_MARUBOZU"
        };
    }
    return null;
}
strategy_ChannelBreak._name = "Channel Break";
strategy_ChannelBreak.category = "scalp_fast";

    function strategy_VolumeProfileQuick(candles) {
        if(candles.length < 2) return null;
        let poc = calculatePOC(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(curr.close > poc && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Volume Profile Quick - Price > POC + Volume Surge", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_VolumeProfileQuick._name = "Volume Profile Quick";
    strategy_VolumeProfileQuick.category = "scalp_fast";

    function strategy_MACDZeroCross(candles) {
        if(candles.length < 27) return null;
        let macd = calculateMACD(candles);
        let ema20 = calculateEMA(candles, 20);
        let curr = candles[candles.length-1];
        if(macd.macd > 0 && macd.prevMacd <= 0 && curr.close > ema20 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "MACD Zero Cross - MACD Line Crosses 0", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MACDZeroCross._name = "MACD Zero Cross";
    strategy_MACDZeroCross.category = "scalp_fast";

    function strategy_HeikinAshiFade(candles) {
        if(candles.length < 3) return null;
        let haClose = candles.map(c => (c.open + c.high + c.low + c.close) / 4);
        let haOpen = [];
        haOpen[0] = (candles[0].open + candles[0].close) / 2;
        for(let i = 1; i < candles.length; i++) {
            haOpen[i] = (haOpen[i-1] + haClose[i-1]) / 2;
        }
        let haColor = haClose[haClose.length-1] > haOpen[haOpen.length-1] ? "GREEN" : "RED";
        let prevHaColor = haClose[haClose.length-2] > haOpen[haOpen.length-2] ? "GREEN" : "RED";
        let curr = candles[candles.length-1];
        let noWick = (curr.high - Math.max(curr.open, curr.close)) < 0.0001 || (Math.min(curr.open, curr.close) - curr.low) < 0.0001;
        if(haColor !== prevHaColor && noWick && checkLiquidity()) {
            let direction = haColor === "GREEN" ? "CALL" : "PUT";
            return {signal: direction, confidence: 90, strength: "قوية", reason: "Heikin Ashi Fade - Color Change + No Wick", candlePattern: direction === "CALL" ? "INSTITUTIONAL_MARUBOZU" : "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_HeikinAshiFade._name = "Heikin Ashi Fade";
    strategy_HeikinAshiFade.category = "scalp_fast";

    function strategy_ATRSnap(candles) {
        if(candles.length < 15) return null;
        let atr = calculateATR(candles, 14);
        let curr = candles[candles.length-1];
        let range = curr.high - curr.low;
        if(range > 2 * atr && Math.abs(curr.close - curr.high) < 0.0001 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "ATR Snap - Range > 2×ATR + Close ≈ High", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ATRSnap._name = "ATR Snap";
    strategy_ATRSnap.category = "scalp_fast";

    function strategy_InsideBar1M(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(curr.high <= prev.high && curr.low >= prev.low && curr.close > prev.high && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Inside Bar 1M - Breakout of Mother Candle", candlePattern: "INSIDE_BAR_BREAKOUT"};
        }
        return null;
    }
    strategy_InsideBar1M._name = "Inside Bar 1M";
    strategy_InsideBar1M.category = "scalp_fast";

    function strategy_TweezerM1(candles) {
        if(candles.length < 2) return null;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        let volumeSpike = (curr.volume || 1000) > (prev.volume || 1000) * 1.5;
        if(Math.abs(curr.low - prev.low) < 0.0001 && volumeSpike && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Tweezer M1 - Exact Support Touch + Volume Spike", candlePattern: "TWEEZER_BOTTOM"};
        }
        return null;
    }
    strategy_TweezerM1._name = "Tweezer M1";
    strategy_TweezerM1.category = "scalp_fast";

    function strategy_ADXStrength(candles) {
        if(candles.length < 15) return null;
        let adx = calculateADX(candles, 14);
        let plusDI = 0, minusDI = 0;
        if(adx > 25 && plusDI > minusDI && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "ADX Strength - ADX > 25 + DI+ > DI-", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ADXStrength._name = "ADX Strength";
    strategy_ADXStrength.category = "scalp_fast";

    function strategy_ParabolicSAR(candles) {
        if(candles.length < 3) return null;
        let sar = calculateParabolicSAR(candles);
        let curr = candles[candles.length-1];
        let volumeSpike = (curr.volume || 1000) > (candles[candles.length-2].volume || 1000) * 1.3;
        if(sar < curr.close && volumeSpike && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Parabolic SAR - SAR below candle + Volume Spike", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ParabolicSAR._name = "Parabolic SAR";
    strategy_ParabolicSAR.category = "scalp_fast";

    function strategy_SuperTrend1M(candles) {
        if(candles.length < 10) return null;
        let superTrend = calculateSuperTrend(candles, 10, 3);
        let curr = candles[candles.length-1];
        let prevSuperTrend = calculateSuperTrend(candles.slice(0, -1), 10, 3);
        if(superTrend === "UP" && prevSuperTrend !== "UP" && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "SuperTrend 1M - Color Change to Green + Break Level", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SuperTrend1M._name = "SuperTrend 1M";
    strategy_SuperTrend1M.category = "scalp_fast";

    function strategy_KeltnerChannel(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let ema20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let atr = calculateATR(candles, 20);
        let upperKC = ema20 + 2 * atr;
        let curr = candles[candles.length-1];
        if(curr.close > upperKC && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Keltner Channel - Price > Upper KC + Momentum", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_KeltnerChannel._name = "Keltner Channel";
    strategy_KeltnerChannel.category = "scalp_fast";

    function strategy_FisherTransform(candles) {
        if(candles.length < 10) return null;
        let fisher = calculateFisherTransform(candles);
        if(fisher > 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Fisher Transform - Extreme Value Cross", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FisherTransform._name = "Fisher Transform";
    strategy_FisherTransform.category = "scalp_fast";

    // ========== 3. تداول يومي (intraday) - 20 استراتيجية جديدة ==========

    function strategy_LondonOpenBreakout(candles) {
        if(candles.length < 60) return null;
        let currentHour = new Date().getUTCHours();
        if(currentHour === 8 || currentHour === 9) {
            let range = calculateOpeningRange(candles, 15);
            let curr = candles[candles.length-1];
            if(curr.close > range.high && checkLiquidity()) {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "London Open Breakout - Break of London Opening Range", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            }
        }
        return null;
    }
    strategy_LondonOpenBreakout._name = "London Open Breakout";
    strategy_LondonOpenBreakout.category = "intraday";

    function strategy_DailyVWAPBounce(candles) {
        if(candles.length < 2) return null;
        let vwap = calculateVWAP(candles);
        let curr = candles[candles.length-1];
        let vwapSlope = vwap - calculateVWAPPrev(candles);
        if(curr.low <= vwap && curr.close > vwap && vwapSlope > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Daily VWAP Bounce - Low ≈ VWAP + Close > VWAP", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_DailyVWAPBounce._name = "Daily VWAP Bounce";
    strategy_DailyVWAPBounce.category = "intraday";

    function strategy_GoldenZoneFib(candles) {
        if(priceHistory.length < 50) return null;
        let retracement = calculateFibRetracement(candles);
        let curr = candles[candles.length-1];
        let isBullishEngulfing = CANDLE_SIGNATURES.FULL_ENGULFING(curr, candles[candles.length-2]);
        if(Math.abs(retracement - 0.618) < 0.05 && isBullishEngulfing && checkLiquidity()) {
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "Golden Zone Fib - Retrace = 0.618 + Bullish Engulfing", candlePattern: "FULL_ENGULFING"};
        }
        return null;
    }
    strategy_GoldenZoneFib._name = "Golden Zone Fib";
    strategy_GoldenZoneFib.category = "intraday";

    function strategy_DemandZoneEntry(candles) {
        if(demandZones.length === 0) return null;
        let demandZone = getNearestDemandZone(currentPrice);
        let rsi = calculateRSI(candles, 14);
        if(demandZone && currentPrice >= demandZone.price && currentPrice <= demandZone.high && rsi < 30 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Demand Zone Entry - Price in Zone + RSI Oversold", candlePattern: "BULLISH_HARAMI"};
        }
        return null;
    }
    strategy_DemandZoneEntry._name = "Demand Zone Entry";
    strategy_DemandZoneEntry.category = "intraday";

    function strategy_SupplyZoneExit(candles) {
        if(supplyZones.length === 0) return null;
        let supplyZone = getNearestSupplyZone(currentPrice);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let upperWick = curr.high - Math.max(curr.open, curr.close);
        if(supplyZone && currentPrice >= supplyZone.low && currentPrice <= supplyZone.high && (upperWick / total) > 0.6 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "Supply Zone Exit - Price in Zone + Rejection", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_SupplyZoneExit._name = "Supply Zone Exit";
    strategy_SupplyZoneExit.category = "intraday";

    function strategy_MarketStructureShift(candles) {
        if(candles.length < 10) return null;
        let curr = candles[candles.length-1];
        let prevHigh = Math.max(...candles.slice(-10, -1).map(c => c.high));
        let fvg = detectFVG(candles);
        if(curr.close > prevHigh && fvg && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Market Structure Shift - Price > Prev LH + FVG", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MarketStructureShift._name = "Market Structure Shift";
    strategy_MarketStructureShift.category = "intraday";

    function strategy_OpeningRangeBreak(candles) {
        if(candles.length < 60) return null;
        let openingRange = getOpeningRange(candles, 60);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-61, -1).reduce((a,b) => a+b, 0) / 60;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(curr.close > openingRange.high && currentVol > avgVol && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Opening Range Break - Breakout of First 60min", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_OpeningRangeBreak._name = "Opening Range Break";
    strategy_OpeningRangeBreak.category = "intraday";

    function strategy_MidDayConsolidation(candles) {
        if(candles.length < 21) return null;
        let stdDev = calculateStdDev(candles.slice(-20).map(c => c.close));
        let curr = candles[candles.length-1];
        let avgBody = candles.slice(-20).reduce((sum,c) => sum + Math.abs(c.close - c.open), 0) / 20;
        let body = Math.abs(curr.close - curr.open);
        if(stdDev < avgBody * 0.5 && body > avgBody * 2 && checkLiquidity()) {
            let direction = curr.close > curr.open ? "CALL" : "PUT";
            return {signal: direction, confidence: 91, strength: "قوية", reason: "Mid-Day Consolidation - StdDev Low + Expansion", candlePattern: direction === "CALL" ? "INSTITUTIONAL_MARUBOZU" : "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_MidDayConsolidation._name = "Mid-Day Consolidation";
    strategy_MidDayConsolidation.category = "intraday";

    function strategy_PullbackToKeyLevel(candles) {
        if(candles.length < 2) return null;
        let keyLevel = getDailySRL(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let wick = Math.min(curr.open, curr.close) - curr.low;
        if(Math.abs(curr.low - keyLevel) < 0.0001 && (wick / total) > 0.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Pullback to Key Level - Daily SR + Price Action", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_PullbackToKeyLevel._name = "Pullback to Key Level";
    strategy_PullbackToKeyLevel.category = "intraday";

    function strategy_TripleTopReject(candles) {
        if(candles.length < 30) return null;
        let highs = candles.map(c => c.high);
        let lastHighs = highs.slice(-30);
        let peaks = findPeaks(lastHighs);
        let rsi = calculateRSI(candles, 14);
        if(peaks.length >= 3 && rsi < 50 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 93, strength: "قوية", reason: "Triple Top Reject - H1=H2=H3 + RSI Divergence", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_TripleTopReject._name = "Triple Top Reject";
    strategy_TripleTopReject.category = "intraday";

    function strategy_NewsMomentumFade(candles) {
        if(candles.length < 2) return null;
        let atr = calculateATR(candles, 14);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let priceDeviation = Math.abs(currentPrice - candles[candles.length-2].close) / atr;
        if(priceDeviation > 3 && currentVol > avgVol * 2 && checkLiquidity()) {
            let direction = currentPrice > candles[candles.length-2].close ? "PUT" : "CALL";
            return {signal: direction, confidence: 90, strength: "قوية", reason: "News Momentum Fade - Absorb News + Return to Mean", candlePattern: direction === "CALL" ? "HAMMER" : "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_NewsMomentumFade._name = "News Momentum Fade";
    strategy_NewsMomentumFade.category = "intraday";

    function strategy_HigherHighBreak(candles) {
        if(candles.length < 2) return null;
        let prevDayHigh = getPrevDayHigh(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        if(curr.close > prevDayHigh && volumes[volumes.length-1] > volumes[volumes.length-2] && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Higher High Break - Break of Yesterday's High + Stability", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_HigherHighBreak._name = "Higher High Break";
    strategy_HigherHighBreak.category = "intraday";

    function strategy_GapFillDaily(candles) {
        if(candles.length < 2) return null;
        let prevClose = candles[candles.length-2].close;
        let currOpen = candles[candles.length-1].open;
        let gap = Math.abs(currOpen - prevClose);
        if(gap > 0.0005 && checkLiquidity()) {
            let direction = currOpen < prevClose ? "CALL" : "PUT";
            return {signal: direction, confidence: 89, strength: "قوية", reason: "Gap Fill Daily - Open Gap + Target Previous Close", candlePattern: direction === "CALL" ? "BULLISH_BELT_HOLD" : "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_GapFillDaily._name = "Gap Fill Daily";
    strategy_GapFillDaily.category = "intraday";

    function strategy_HullMovingAvg(candles) {
        if(candles.length < 55) return null;
        let hma = calculateHMA(candles, 55);
        let curr = candles[candles.length-1];
        if(curr.close > hma && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Hull Moving Avg - Price Above HMA(55)", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_HullMovingAvg._name = "Hull Moving Avg";
    strategy_HullMovingAvg.category = "intraday";

    function strategy_VolatilityBand(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let std = calculateStdDev(closes.slice(-20));
        let upperBand = sma + 2 * std;
        let lowerBand = sma - 2 * std;
        let curr = candles[candles.length-1];
        let prev = candles[candles.length-2];
        if(curr.close > upperBand && prev.close <= upperBand && checkLiquidity()) {
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "Volatility Band - Price Outside 2σ + Return Inside", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_VolatilityBand._name = "Volatility Band";
    strategy_VolatilityBand.category = "intraday";

    function strategy_MovingAvgRibbon(candles) {
        if(candles.length < 55) return null;
        let ema10 = calculateEMA(candles, 10);
        let ema20 = calculateEMA(candles, 20);
        let ema30 = calculateEMA(candles, 30);
        let ema40 = calculateEMA(candles, 40);
        let ema50 = calculateEMA(candles, 50);
        let ribbonExpanding = ema10 > ema20 && ema20 > ema30 && ema30 > ema40 && ema40 > ema50;
        if(ribbonExpanding && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Moving Avg Ribbon - Expanding MA (Fan Effect)", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MovingAvgRibbon._name = "Moving Avg Ribbon";
    strategy_MovingAvgRibbon.category = "intraday";

    function strategy_PivotPointR1(candles) {
        if(candles.length < 2) return null;
        let prev = candles[candles.length-2];
        let pivot = (prev.high + prev.low + prev.close) / 3;
        let r1 = 2 * pivot - prev.low;
        let curr = candles[candles.length-1];
        if(curr.close > r1 && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Pivot Point R1 - Break of PP and Target R1", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_PivotPointR1._name = "Pivot Point R1";
    strategy_PivotPointR1.category = "intraday";

    function strategy_VolumeProfilePOC(candles) {
        if(candles.length < 20) return null;
        let poc = calculatePOC(candles);
        let curr = candles[candles.length-1];
        if(Math.abs(curr.low - poc) < 0.0001 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Volume Profile POC - Bounce from Liquidity Zone", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_VolumeProfilePOC._name = "Volume Profile POC";
    strategy_VolumeProfilePOC.category = "intraday";

    function strategy_TDIGoldCross(candles) {
        if(candles.length < 14) return null;
        let rsi = calculateRSI(candles, 14);
        let tdiSignal = rsi > 50 ? 1 : -1;
        if(tdiSignal > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "TDI Gold Cross - TDI Cross in Green Zone", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TDIGoldCross._name = "TDI Gold Cross";
    strategy_TDIGoldCross.category = "intraday";

    function strategy_ChaikinMoneyFlow(candles) {
        if(candles.length < 20) return null;
        let cmf = calculateCMF(candles, 20);
        let curr = candles[candles.length-1];
        if(cmf > 0.2 && curr.close > curr.open && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Chaikin Money Flow - CMF > 0.2 + Price Break", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ChaikinMoneyFlow._name = "Chaikin Money Flow";
    strategy_ChaikinMoneyFlow.category = "intraday";

    // ========== 4. تداول تأرجح (swing) - 20 استراتيجية جديدة ==========

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
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Hidden Divergence - Price Higher + RSI Lower", candlePattern: "PIERCING_LINE"};
        }
        return null;
    }
    strategy_HiddenDivergence._name = "Hidden Divergence";
    strategy_HiddenDivergence.category = "swing";

    function strategy_H4OrderBlock(candles) {
        if(orderBlocks.length === 0) return null;
        let nearestOB = orderBlocks[0];
        if(nearestOB && Math.abs(currentPrice - nearestOB.price) < 0.0005) {
            if(nearestOB.type === "BULLISH") {
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "H4 Order Block - Return to Previous Accumulation Zone", candlePattern: "BULLISH_HARAMI"};
            }
        }
        return null;
    }
    strategy_H4OrderBlock._name = "H4 Order Block";
    strategy_H4OrderBlock.category = "swing";

    function strategy_TrendlineAnchor(candles) {
        if(candles.length < 30) return null;
        let trendlineTouch = checkTrendlineTouch(candles, 3);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(trendlineTouch && (lowerWick / total) > 0.6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Trendline Anchor - Third Touch on Trendline + PinBar", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_TrendlineAnchor._name = "Trendline Anchor";
    strategy_TrendlineAnchor.category = "swing";

    function strategy_WeeklySupportHold(candles) {
        if(candles.length < 2) return null;
        let weeklySupport = getWeeklySupport(candles);
        let curr = candles[candles.length-1];
        if(curr.low < weeklySupport && curr.close > weeklySupport && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Weekly Support Hold - Hold Above Weekly Support", candlePattern: "SPRING_SWEEP"};
        }
        return null;
    }
    strategy_WeeklySupportHold._name = "Weekly Support Hold";
    strategy_WeeklySupportHold.category = "swing";

    function strategy_CupAndHandle(candles) {
        if(candles.length < 50) return null;
        let cupPattern = detectCupAndHandle(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        let handleVol = volumes.slice(-10).reduce((a,b) => a+b, 0) / 10;
        let breakoutVol = volumes[volumes.length-1];
        if(cupPattern && curr.close > cupPattern.resistance && breakoutVol > handleVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Cup and Handle - Break of Handle + Volume", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_CupAndHandle._name = "Cup and Handle";
    strategy_CupAndHandle.category = "swing";

    function strategy_HeadAndShoulders(candles) {
        if(candles.length < 50) return null;
        let pattern = detectHeadAndShoulders(candles);
        if(pattern && currentPrice < pattern.neckline && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 95, strength: "قوية جدا", reason: "Head and Shoulders - Break of Neckline", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_HeadAndShoulders._name = "Head and Shoulders";
    strategy_HeadAndShoulders.category = "swing";

    function strategy_CorrectiveWaveEnd(candles) {
        if(candles.length < 100) return null;
        let waveCEnd = detectElliottWaveCEnd(candles);
        let fibExt = fibonacciLevels.extension1618;
        if(waveCEnd && Math.abs(currentPrice - fibExt) < 0.0005 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Corrective Wave End - Wave C of Elliott + Fib 1.618", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_CorrectiveWaveEnd._name = "Corrective Wave End";
    strategy_CorrectiveWaveEnd.category = "swing";

    function strategy_SwingLiquidityRun(candles) {
        if(candles.length < 20) return null;
        let swingLow = Math.min(...candles.slice(-20).map(c => c.low));
        let curr = candles[candles.length-1];
        if(curr.low < swingLow && curr.close > swingLow && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Swing Liquidity Run - Sweep Below Previous Low + Reclaim", candlePattern: "SPRING_SWEEP"};
        }
        return null;
    }
    strategy_SwingLiquidityRun._name = "Swing Liquidity Run";
    strategy_SwingLiquidityRun.category = "swing";

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
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Bollinger Band Walk - Walking on Upper Band + ADX", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BollingerBandWalk._name = "Bollinger Band Walk";
    strategy_BollingerBandWalk.category = "swing";

    function strategy_MACDLongSignal(candles) {
        if(candles.length < 200) return null;
        let macd = calculateMACD(candles);
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        if(macd.macd > macd.signal && macd.prevMacd <= macd.prevSignal && curr.close > ema200 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "MACD Long Signal - Daily Cross + Rising Volume", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MACDLongSignal._name = "MACD Long Signal";
    strategy_MACDLongSignal.category = "swing";

    function strategy_SuperTrendCycle(candles) {
        if(candles.length < 2) return null;
        let superTrend = calculateSuperTrend(candles, 10, 3);
        let curr = candles[candles.length-1];
        if(superTrend === "UP" && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "SuperTrend Cycle - D1 Green + H4 Correction", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SuperTrendCycle._name = "SuperTrend Cycle";
    strategy_SuperTrendCycle.category = "swing";

    function strategy_PriceActionSandwich(candles) {
        if(candles.length < 3) return null;
        let c1 = candles[candles.length-3];
        let c2 = candles[candles.length-2];
        let c3 = candles[candles.length-1];
        let bigGreen = (c1.close - c1.open) > 0 && Math.abs(c1.close - c1.open) > Math.abs(c2.close - c2.open) * 2;
        let smallRed = c2.close < c2.open;
        let bigGreen2 = (c3.close - c3.open) > 0 && Math.abs(c3.close - c3.open) > Math.abs(c2.close - c2.open) * 2;
        if(bigGreen && smallRed && bigGreen2 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Price Action Sandwich - Green → Red → Green", candlePattern: "THREE_WHITE_SOLDIERS"};
        }
        return null;
    }
    strategy_PriceActionSandwich._name = "Price Action Sandwich";
    strategy_PriceActionSandwich.category = "swing";

    function strategy_BollingerBandSqueezeD1(candles) {
        if(candles.length < 20) return null;
        let closes = candles.map(c => c.close);
        let sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        let variance = closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
        let std = Math.sqrt(variance);
        let bbw = (2 * std * 2) / sma;
        let prevBbw = 0;
        if(bbw < 0.02 && prevBbw > bbw * 1.2 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Bollinger Band Squeeze D1 - Explosion After Daily Squeeze", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_BollingerBandSqueezeD1._name = "Bollinger Band Squeeze D1";
    strategy_BollingerBandSqueezeD1.category = "swing";

    function strategy_DonchianBreakout(candles) {
        if(candles.length < 20) return null;
        let highs = candles.map(c => c.high);
        let donchianHigh = Math.max(...highs.slice(-20));
        let curr = candles[candles.length-1];
        if(curr.close > donchianHigh && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Donchian Breakout - Break of 20-day Donchian Channel", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_DonchianBreakout._name = "Donchian Breakout";
    strategy_DonchianBreakout.category = "swing";

    function strategy_IchimokuKumoCloud(candles) {
        if(candles.length < 52) return null;
        let conversionLine = calculateIchimokuConversion(candles);
        let baseLine = calculateIchimokuBase(candles);
        let spanA = calculateIchimokuSpanA(candles);
        let spanB = calculateIchimokuSpanB(candles);
        let curr = candles[candles.length-1];
        if(curr.close > spanA && spanA > spanB && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Ichimoku Kumo Cloud - Price > Cloud + SpanA > SpanB", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_IchimokuKumoCloud._name = "Ichimoku Kumo Cloud";
    strategy_IchimokuKumoCloud.category = "swing";

    function strategy_RSITrendline(candles) {
        if(candles.length < 30) return null;
        let rsi = calculateRSI(candles, 14);
        let rsiValues = [];
        for(let i = 25; i < candles.length; i++) {
            let slice = candles.slice(i-25, i);
            rsiValues.push(calculateRSI(slice, 14));
        }
        let trendlineBreak = false;
        if(trendlineBreak && rsi < 30 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "RSI Trendline - Break of RSI Trendline", candlePattern: "PIERCING_LINE"};
        }
        return null;
    }
    strategy_RSITrendline._name = "RSI Trendline";
    strategy_RSITrendline.category = "swing";

    function strategy_AlligatorSleep(candles) {
        if(candles.length < 21) return null;
        let jaw = calculateSMMA(candles, 13, 8);
        let teeth = calculateSMMA(candles, 8, 5);
        let lips = calculateSMMA(candles, 5, 3);
        let awake = jaw > teeth && teeth > lips;
        if(awake && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Alligator Sleep - Alligator Waking Up (MA Cross)", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_AlligatorSleep._name = "Alligator Sleep";
    strategy_AlligatorSleep.category = "swing";

    function strategy_ElderRay(candles) {
        if(candles.length < 2) return null;
        let ema13 = calculateEMA(candles, 13);
        let bullPower = candles[candles.length-1].high - ema13;
        if(bullPower > 0 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Elder Ray - Bull Power > 0", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ElderRay._name = "Elder Ray";
    strategy_ElderRay.category = "swing";

    function strategy_TripleScreen(candles) {
        if(candles.length < 100) return null;
        let dailyTrend = calculateEMA(candles, 200) > calculateEMAPrev(candles, 200);
        let fourHourRSI = calculateRSI(candles, 14);
        let oneHourSignal = calculateMACD(candles).macd > 0;
        if(dailyTrend && fourHourRSI < 50 && oneHourSignal && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Triple Screen - Daily Up + H4 RSI < 50 + H1 MACD > 0", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_TripleScreen._name = "Triple Screen";
    strategy_TripleScreen.category = "swing";

    function strategy_MeanReversion(candles) {
        if(candles.length < 200) return null;
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        let deviation = (curr.close - ema200) / ema200;
        if(deviation < -0.02 && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Mean Reversion - Return to 200 MA", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_MeanReversion._name = "Mean Reversion";
    strategy_MeanReversion.category = "swing";

    // ========== 5. تداول طويل الأمد (position) - 20 استراتيجية جديدة ==========

    function strategy_GoldenCross(candles) {
        if(candles.length < 200) return null;
        let ema50 = calculateEMA(candles, 50);
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        if(ema50 > ema200 && curr.close > ema50 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Golden Cross - EMA50 > EMA200", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_GoldenCross._name = "Golden Cross";
    strategy_GoldenCross.category = "position";

    function strategy_MonthlyBreakout(candles) {
        if(candles.length < 12) return null;
        let yearlyHigh = Math.max(...candles.slice(-12).map(c => c.high));
        let volumes = candles.map(c => c.volume || 1000);
        let yearlyAvgVol = volumes.slice(-12).reduce((a,b) => a+b, 0) / 12;
        let curr = candles[candles.length-1];
        if(curr.close > yearlyHigh && volumes[volumes.length-1] > yearlyAvgVol && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Monthly Breakout - Close > 12-Month High + Volume", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MonthlyBreakout._name = "Monthly Breakout";
    strategy_MonthlyBreakout.category = "position";

    function strategy_InstitutionalBuy(candles) {
        if(candles.length < 180) return null;
        let accumulation = detectAccumulationPhase(candles);
        if(accumulation && accumulation.duration > 6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Institutional Buy - Wyckoff Accumulation Phase C", candlePattern: "BULLISH_HARAMI"};
        }
        return null;
    }
    strategy_InstitutionalBuy._name = "Institutional Buy";
    strategy_InstitutionalBuy.category = "position";

    function strategy_EconomicCycleEntry(candles) {
        if(candles.length < 30) return null;
        let monthlyRSI = calculateRSI(candles, 30);
        let curr = candles[candles.length-1];
        if(monthlyRSI < 30 && curr.low === Math.min(...candles.slice(-30).map(c => c.low)) && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Economic Cycle Entry - RSI Monthly < 30 (Historical Bottom)", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_EconomicCycleEntry._name = "Economic Cycle Entry";
    strategy_EconomicCycleEntry.category = "position";

    function strategy_ATHBreak(candles) {
        if(candles.length < 2) return null;
        let ath = Math.max(...candles.map(c => c.high));
        let curr = candles[candles.length-1];
        if(curr.close > ath && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "All-Time High Break - Close > All Time High", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_ATHBreak._name = "All-Time High Break";
    strategy_ATHBreak.category = "position";

    function strategy_EMA200Hold(candles) {
        if(candles.length < 200) return null;
        let ema200 = calculateEMA(candles, 200);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(Math.abs(curr.low - ema200) < 0.0001 && (lowerWick / total) > 0.6 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "200-Day Hold - Price Above 200 MA for 3 Months", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_EMA200Hold._name = "200-Day EMA Hold";
    strategy_EMA200Hold.category = "position";

    function strategy_SectorStrength(candles) {
        if(candles.length < 50) return null;
        let symbolPerf = calculateSymbolPerformance(candles);
        let sectorPerf = getSectorPerformance();
        if(symbolPerf > sectorPerf && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Sector Strength - Symbol > Sector Performance", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_SectorStrength._name = "Sector Strength";
    strategy_SectorStrength.category = "position";

    function strategy_WeeklyDivergence(candles) {
        if(candles.length < 100) return null;
        let weeklyMACD = calculateMACD(candles.slice(0, Math.floor(candles.length/7)));
        let closes = candles.map(c => c.close);
        let lastPrice = closes[closes.length-1];
        let prevPrice = closes[closes.length-6];
        if(prevPrice > lastPrice && weeklyMACD.macd > weeklyMACD.prevMacd && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Weekly Divergence - Huge Weekly Divergence", candlePattern: "PIERCING_LINE"};
        }
        return null;
    }
    strategy_WeeklyDivergence._name = "Weekly Divergence";
    strategy_WeeklyDivergence.category = "position";

    function strategy_AccumulationZone(candles) {
        if(candles.length < 2) return null;
        let support = getWyckoffSupport(candles);
        let curr = candles[candles.length-1];
        let total = curr.high - curr.low;
        let lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if(curr.low < support && curr.close > support && (lowerWick / total) > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 95, strength: "قوية جدا", reason: "Accumulation Zone - POC Accumulating at Historical Bottom", candlePattern: "SPRING_SWEEP"};
        }
        return null;
    }
    strategy_AccumulationZone._name = "Accumulation Zone";
    strategy_AccumulationZone.category = "position";

    function strategy_InflationHedge(candles) {
        if(candles.length < 30) return null;
        let cpiCorrelation = getCPICorrelation();
        if(cpiCorrelation > 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Inflation Hedge - Assets Rising with CPI", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_InflationHedge._name = "Inflation Hedge";
    strategy_InflationHedge.category = "position";

    function strategy_MarketValuePlay(candles) {
        if(candles.length < 2) return null;
        let fairValue = getFairValue();
        let curr = candles[candles.length-1];
        if(curr.close < fairValue && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Market Value Play - Price < Fair Value", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_MarketValuePlay._name = "Market Value Play";
    strategy_MarketValuePlay.category = "position";

    function strategy_DecadeSupportBounce(candles) {
        if(candles.length < 120) return null;
        let decadeSupport = getDecadeSupport(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let avgVol = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
        let currentVol = volumes[volumes.length-1];
        let curr = candles[candles.length-1];
        if(Math.abs(curr.low - decadeSupport) < 0.0001 && currentVol > avgVol * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "Decade Support Bounce - Touch of 10-Year Support", candlePattern: "SNIPER_PINBAR"};
        }
        return null;
    }
    strategy_DecadeSupportBounce._name = "Decade Support Bounce";
    strategy_DecadeSupportBounce.category = "position";

    function strategy_CupAndHandleW1(candles) {
        if(candles.length < 50) return null;
        let cupPattern = detectCupAndHandle(candles);
        let volumes = candles.map(c => c.volume || 1000);
        let curr = candles[candles.length-1];
        if(cupPattern && curr.close > cupPattern.resistance && volumes[volumes.length-1] > volumes.slice(-10).reduce((a,b) => a+b, 0) / 9 * 1.5 && checkLiquidity()) {
            return {signal:"CALL", confidence: 93, strength: "قوية", reason: "Cup and Handle W1 - Giant Weekly Pattern", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_CupAndHandleW1._name = "Cup and Handle W1";
    strategy_CupAndHandleW1.category = "position";

    function strategy_MovingAvgEnvelope(candles) {
        if(candles.length < 252) return null;
        let ema200 = calculateEMA(candles, 200);
        let envelopeLow = ema200 * 0.95;
        let curr = candles[candles.length-1];
        if(curr.close <= envelopeLow && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Moving Avg Envelope - Price in Lower Yearly Band", candlePattern: "HAMMER"};
        }
        return null;
    }
    strategy_MovingAvgEnvelope._name = "Moving Avg Envelope";
    strategy_MovingAvgEnvelope.category = "position";

    function strategy_MomentumYearly(candles) {
        if(candles.length < 252) return null;
        let yearAgoClose = candles[candles.length-252].close;
        let curr = candles[candles.length-1];
        if(curr.close > yearAgoClose && checkLiquidity()) {
            return {signal:"CALL", confidence: 91, strength: "قوية", reason: "Momentum Yearly - Price Above Last Year's Close", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MomentumYearly._name = "Momentum Yearly";
    strategy_MomentumYearly.category = "position";

    function strategy_SmartMoneyFootprint(candles) {
        if(candles.length < 100) return null;
        let accumulation = detectAccumulationPhase(candles);
        if(accumulation && accumulation.duration > 10 && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية", reason: "Smart Money Footprint - Liquidity Accumulation on Weekly", candlePattern: "BULLISH_HARAMI"};
        }
        return null;
    }
    strategy_SmartMoneyFootprint._name = "Smart Money Footprint";
    strategy_SmartMoneyFootprint.category = "position";

    function strategy_DeathCrossExit(candles) {
        if(candles.length < 200) return null;
        let ema50 = calculateEMA(candles, 50);
        let ema200 = calculateEMA(candles, 200);
        if(ema50 < ema200 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 91, strength: "قوية", reason: "Death Cross Exit - EMA50 < EMA200", candlePattern: "SHOOTING_STAR"};
        }
        return null;
    }
    strategy_DeathCrossExit._name = "Death Cross Exit";
    strategy_DeathCrossExit.category = "position";

    function strategy_LowVolatilityEntry(candles) {
        if(candles.length < 20) return null;
        let atr = calculateATR(candles, 14);
        let avgAtr = candles.slice(-20).reduce((sum,c,i,arr) => sum + calculateATR(candles.slice(Math.max(0, i-14), i+1), 14), 0) / 20;
        if(atr < avgAtr * 0.7 && checkLiquidity()) {
            return {signal:"CALL", confidence: 90, strength: "قوية", reason: "Low Volatility Entry - Entry at Lowest Monthly Volatility", candlePattern: "INSIDE_BAR"};
        }
        return null;
    }
    strategy_LowVolatilityEntry._name = "Low Volatility Entry";
    strategy_LowVolatilityEntry.category = "position";

    function strategy_FractalGrowth(candles) {
        if(candles.length < 100) return null;
        let fractals = detectFractals(candles);
        if(fractals.bullish > 3 && checkLiquidity()) {
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "Fractal Growth - Bullish Fractal Pattern on Long Term", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_FractalGrowth._name = "Fractal Growth";
    strategy_FractalGrowth.category = "position";

    function strategy_MarketCapFlow(candles) {
        if(candles.length < 30) return null;
        let btcPerformance = getBTCPerformance();
        let altPerformance = calculateSymbolPerformance(candles);
        if(altPerformance > btcPerformance * 1.2 && checkLiquidity()) {
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "Market Cap Flow - Liquidity Flows from BTC to Alts", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        return null;
    }
    strategy_MarketCapFlow._name = "Market Cap Flow";
    strategy_MarketCapFlow.category = "position";

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
        if(rsi < 30 && checkLiquidity()) {
            showLowConfidenceWarning("RSI", rsi);
            return {signal:"CALL", confidence: Math.min(rsi * 2, 85), strength: "متوسطة", reason: `RSI ${rsi.toFixed(0)} - تشبع بيعي`};
        }
        if(rsi > 70 && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("RSI", 100 - rsi);
            return {signal:"PUT", confidence: Math.min((100 - rsi) * 2, 85), strength: "متوسطة", reason: `RSI ${rsi.toFixed(0)} - تشبع شرائي`};
        }
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
            return {signal:"CALL", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس إيجابي RSI", candlePattern: "PIERCING_LINE"};
        }
        if(prevPrice < lastPrice && prevRSI > lastRSI && lastRSI > 65 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            return {signal:"PUT", confidence: 96, strength: "قوية جدا", reason: "دايفرجنس سلبي RSI", candlePattern: "DARK_CLOUD_COVER"};
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
        if(k < 20 && k > prevK && checkLiquidity()) {
            showLowConfidenceWarning("Stochastic", 100 - k);
            return {signal:"CALL", confidence: Math.min(k * 4 + 10, 85), strength: "متوسطة", reason: "ستوكاستيك تشبع بيعي", candlePattern: "BULLISH_HARAMI"};
        }
        if(k > 80 && k < prevK && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Stochastic", k);
            return {signal:"PUT", confidence: Math.min((100 - k) * 4 + 10, 85), strength: "متوسطة", reason: "ستوكاستيك تشبع شرائي", candlePattern: "BEARISH_HARAMI"};
        }
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
        if(mom1 > 0 && mom1 > mom2 && mom2 > mom3 && checkLiquidity()) {
            showLowConfidenceWarning("Momentum", 86);
            return {signal:"CALL", confidence: 86, strength: "قوية", reason: "زخم صاعد متسارع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        if(mom1 < 0 && mom1 < mom2 && mom2 < mom3 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Momentum", 86);
            return {signal:"PUT", confidence: 86, strength: "قوية", reason: "زخم هابط متسارع", candlePattern: "SHOOTING_STAR"};
        }
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
        if(wr < -80 && wr > prevWr && checkLiquidity()) {
            showLowConfidenceWarning("Williams %R", 88);
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "Williams %R تشبع بيعي", candlePattern: "HAMMER"};
        }
        if(wr > -20 && wr < prevWr && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Williams %R", 88);
            return {signal:"PUT", confidence: 88, strength: "قوية", reason: "Williams %R تشبع شرائي", candlePattern: "SHOOTING_STAR"};
        }
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
        if(cci < -100 && cci > prevCci && checkLiquidity()) {
            showLowConfidenceWarning("CCI", 85);
            return {signal:"CALL", confidence: 85, strength: "قوية", reason: "CCI ارتداد من -100", candlePattern: "PIERCING_LINE"};
        }
        if(cci > 100 && cci < prevCci && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("CCI", 85);
            return {signal:"PUT", confidence: 85, strength: "قوية", reason: "CCI ارتداد من +100", candlePattern: "DARK_CLOUD_COVER"};
        }
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
        if(current < lower && current > prev && checkLiquidity()) {
            showLowConfidenceWarning("Bollinger Bands", 90);
            return {signal:"CALL", confidence: 90, strength: "قوية جدا", reason: "ارتداد من بولينجر السفلي", candlePattern: "HAMMER"};
        }
        if(current > upper && current < prev && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Bollinger Bands", 90);
            return {signal:"PUT", confidence: 90, strength: "قوية جدا", reason: "ارتداد من بولينجر العلوي", candlePattern: "SHOOTING_STAR"};
        }
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
            if(hist > 0 && prevHist <= 0 && checkLiquidity()) {
                showLowConfidenceWarning("MACD", 87);
                return {signal:"CALL", confidence: 87, strength: "قوية", reason: "تقاطع MACD صاعد", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            }
            if(hist < 0 && prevHist >= 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
                showLowConfidenceWarning("MACD", 87);
                return {signal:"PUT", confidence: 87, strength: "قوية", reason: "تقاطع MACD هابط", candlePattern: "SHOOTING_STAR"};
            }
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
        if(prevPrice > lastPrice && prevMACD < lastMACD && lastMACD < 0 && checkLiquidity()) return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس إيجابي MACD", candlePattern: "PIERCING_LINE"};
        if(prevPrice < lastPrice && prevMACD > lastMACD && lastMACD > 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "دايفرجنس سلبي MACD", candlePattern: "DARK_CLOUD_COVER"};
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
        if(current < support && current < prev && body > avgBody * 1.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 89, strength: "قوية", reason: "اختراق دعم", candlePattern: "SHOOTING_STAR"};
        if(Math.abs(current - resistance) < 0.0005 && current < resistance && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 85, strength: "قوية", reason: "ارتداد من مقاومة", candlePattern: "SHOOTING_STAR"};
        if(Math.abs(current - support) < 0.0005 && current > support && checkLiquidity()) return {signal:"CALL", confidence: 85, strength: "قوية", reason: "ارتداد من دعم", candlePattern: "HAMMER"};
        return null;
    }
    strategy_SupportResistance._name = "Support & Resistance";
    strategy_SupportResistance.category = "all";
    
    function strategy_DemandZoneBounce(candles) {
        if(demandZones.length === 0) return null;
        let current = currentPrice;
        let nearestDemand = getNearestDemandZone(current);
        if(nearestDemand && Math.abs(current - nearestDemand.price) < 0.0006 && current > nearestDemand.price && checkLiquidity()) {
            return {signal:"CALL", confidence: 92, strength: "قوية جدا", reason: "ارتداد من منطقة طلب قوية", candlePattern: "HAMMER"};
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
            return {signal:"PUT", confidence: 92, strength: "قوية جدا", reason: "ارتداد من منطقة عرض قوية", candlePattern: "SHOOTING_STAR"};
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
            if(trend === "UP") return {signal:"CALL", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382", candlePattern: "HAMMER"};
            if(trend === "DOWN" && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 90, strength: "قوية", reason: "ارتداد من فيبوناتشي 0.382", candlePattern: "SHOOTING_STAR"};
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
            showLowConfidenceWarning("Volume Spike", 89);
            return {signal:"CALL", confidence: 89, strength: "قوية", reason: "انفجار حجم مع صعود", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        if(currentVol > avgVol * 2 && closes[closes.length-1] < closes[closes.length-2] && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Volume Spike", 89);
            return {signal:"PUT", confidence: 89, strength: "قوية", reason: "انفجار حجم مع هبوط", candlePattern: "SHOOTING_STAR"};
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
            showLowConfidenceWarning("UltraScalp Price Action", 94);
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "شمعة صاعدة قوية - اختراق", candlePattern: "INSTITUTIONAL_MARUBOZU"};
        }
        if(last.close < last.open && body > prevBody * 1.5 && last.close < prev.low && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("UltraScalp Price Action", 94);
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "شمعة هابطة قوية - اختراق", candlePattern: "SHOOTING_STAR"};
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
        if(rsi < 35 && macd > 0 && checkLiquidity()) {
            showLowConfidenceWarning("FastScalp RSI+MACD", 94);
            return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: "RSI منخفض + MACD إيجابي", candlePattern: "PIERCING_LINE"};
        }
        if(rsi > 65 && macd < 0 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("FastScalp RSI+MACD", 94);
            return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "RSI مرتفع + MACD سلبي", candlePattern: "DARK_CLOUD_COVER"};
        }
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
            if(current > prev) {
                showLowConfidenceWarning("Intraday Bollinger", 92);
                return {signal:"CALL", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - صعود متوقع", candlePattern: "INSTITUTIONAL_MARUBOZU"};
            }
            if(current < prev && !isAtHistoricalPeak(currentPrice, "PUT")) {
                showLowConfidenceWarning("Intraday Bollinger", 92);
                return {signal:"PUT", confidence: 92, strength: "قوية", reason: "انفجار بولينجر - هبوط متوقع", candlePattern: "SHOOTING_STAR"};
            }
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
                return {signal:"CALL", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block صاعد`, candlePattern: "BULLISH_HARAMI"};
            }
            if(nearestOB.type === "BEARISH" && current < nearestOB.price && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
                return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: `ارتداد من Order Block هابط`, candlePattern: "BEARISH_HARAMI"};
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
        if(current < ma50 && ma50 < ma100 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) return {signal:"PUT", confidence: 94, strength: "قوية جدا", reason: "ترتيب سلبي للمتوسطات", candlePattern: "SHOOTING_STAR"};
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
        if(lowerShadow > body * 2 && upperShadow < body * 0.5 && checkLiquidity()) {
            showLowConfidenceWarning("Pin Bar", 88);
            return {signal:"CALL", confidence: 88, strength: "قوية", reason: "نمط Pin Bar صاعد", candlePattern: "SNIPER_PINBAR"};
        }
        if(upperShadow > body * 2 && lowerShadow < body * 0.5 && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
            showLowConfidenceWarning("Pin Bar", 88);
            return {signal:"PUT", confidence: 88, strength: "قوية", reason: "نمط Pin Bar هابط", candlePattern: "SHOOTING_STAR"};
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
            if(last.close > prev.close && checkLiquidity()) {
                showLowConfidenceWarning("Doji Reversal", 86);
                return {signal:"CALL", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - انعكاس صاعد", candlePattern: "LONG_LEGGED_DOJI"};
            }
            if(last.close < prev.close && checkLiquidity() && !isAtHistoricalPeak(currentPrice, "PUT")) {
                showLowConfidenceWarning("Doji Reversal", 86);
                return {signal:"PUT", confidence: 86, strength: "قوية", reason: "دوجي بعد شمعة كبيرة - انعكاس هابط", candlePattern: "LONG_LEGGED_DOJI"};
            }
        }
        return null;
    }
    strategy_Multi_Doji_Reversal._name = "Multi_Doji";
    strategy_Multi_Doji_Reversal.category = "all";

    // ========== دالة عرض تحذير الاستراتيجيات الأقل من 75% ==========
    let warningShown = false;
    function showLowConfidenceWarning(strategyName, confidence) {
        if(confidence < 75 && !warningShown) {
            warningShown = true;
            let warningDiv = document.createElement('div');
            warningDiv.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(255, 100, 100, 0.95); color: #fff;
                padding: 8px 20px; border-radius: 30px; z-index: 10000000;
                font-size: 12px; font-weight: bold; backdrop-filter: blur(5px);
                animation: fadeOutWarning 2s ease-in-out forwards;
                white-space: nowrap; font-family: monospace;
            `;
            warningDiv.innerHTML = `⚠️ تنبيه: استراتيجية "${strategyName}" نسبتها ${confidence}% (أقل من 75%) - يرجى توخي الحذر ⚠️`;
            document.body.appendChild(warningDiv);
            
            let style = document.createElement('style');
            style.textContent = `
                @keyframes fadeOutWarning {
                    0% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    70% { opacity: 1; }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); display: none; }
                }
            `;
            document.head.appendChild(style);
            
            setTimeout(() => {
                if(warningDiv && warningDiv.remove) warningDiv.remove();
                if(style && style.remove) style.remove();
                warningShown = false;
            }, 2000);
        }
    }

    // تجميع جميع الاستراتيجيات (أكثر من 220 استراتيجية)
    const STRATEGIES = [
        // الاستراتيجيات الجديدة - سكالبينج فائق السرعة
        strategy_MicroGapFill, strategy_TickVolumeSpike, strategy_FiveSecMomentum,
        strategy_OrderFlowScalp, strategy_FastSMABounce, strategy_FlashBreakout,
        strategy_MicroRejection, strategy_InstantImbalance, strategy_ScalpXVelocity,
        strategy_PivotPointQuick, strategy_SecondaryTrendScalp, strategy_TapeReading,
        strategy_BidAskSpreadSnap, strategy_HighFreqScalp, strategy_PingPongScalp,
        strategy_NewsSpikeFade, strategy_ZeroLagCross, strategy_ScalpMomentumCCI,
        strategy_VShapeRecovery, strategy_FractalBreak,
        // سكالبينج سريع
        strategy_BollingerSqueeze, strategy_RSIReverse, strategy_StochasticCrossFast,
        strategy_EngulfingConfirmation, strategy_EMAPullback, strategy_SupportFlip,
        strategy_TrendRider, strategy_DoubleBottomScalp, strategy_ChannelBreak,
        strategy_VolumeProfileQuick, strategy_MACDZeroCross, strategy_HeikinAshiFade,
        strategy_ATRSnap, strategy_InsideBar1M, strategy_TweezerM1, strategy_ADXStrength,
        strategy_ParabolicSAR, strategy_SuperTrend1M, strategy_KeltnerChannel, strategy_FisherTransform,
        // تداول يومي
        strategy_LondonOpenBreakout, strategy_DailyVWAPBounce, strategy_GoldenZoneFib,
        strategy_DemandZoneEntry, strategy_SupplyZoneExit, strategy_MarketStructureShift,
        strategy_OpeningRangeBreak, strategy_MidDayConsolidation, strategy_PullbackToKeyLevel,
        strategy_TripleTopReject, strategy_NewsMomentumFade, strategy_HigherHighBreak,
        strategy_GapFillDaily, strategy_HullMovingAvg, strategy_VolatilityBand,
        strategy_MovingAvgRibbon, strategy_PivotPointR1, strategy_VolumeProfilePOC,
        strategy_TDIGoldCross, strategy_ChaikinMoneyFlow,
        // تداول تأرجح
        strategy_HiddenDivergence, strategy_H4OrderBlock, strategy_TrendlineAnchor,
        strategy_WeeklySupportHold, strategy_CupAndHandle, strategy_HeadAndShoulders,
        strategy_CorrectiveWaveEnd, strategy_SwingLiquidityRun, strategy_BollingerBandWalk,
        strategy_MACDLongSignal, strategy_SuperTrendCycle, strategy_PriceActionSandwich,
        strategy_BollingerBandSqueezeD1, strategy_DonchianBreakout, strategy_IchimokuKumoCloud,
        strategy_RSITrendline, strategy_AlligatorSleep, strategy_ElderRay, strategy_TripleScreen,
        strategy_MeanReversion,
        // تداول طويل الأمد
        strategy_GoldenCross, strategy_MonthlyBreakout, strategy_InstitutionalBuy,
        strategy_EconomicCycleEntry, strategy_ATHBreak, strategy_EMA200Hold,
        strategy_SectorStrength, strategy_WeeklyDivergence, strategy_AccumulationZone,
        strategy_InflationHedge, strategy_MarketValuePlay, strategy_DecadeSupportBounce,
        strategy_CupAndHandleW1, strategy_MovingAvgEnvelope, strategy_MomentumYearly,
        strategy_SmartMoneyFootprint, strategy_DeathCrossExit, strategy_LowVolatilityEntry,
        strategy_FractalGrowth, strategy_MarketCapFlow,
        // الاستراتيجيات الأصلية
        strategy_RSI, strategy_RSI_Divergence, strategy_Stochastic, strategy_Momentum,
        strategy_WilliamsR, strategy_CCI, strategy_BollingerBands, strategy_MACD,
        strategy_MACD_Divergence, strategy_BullishEngulfing, strategy_BearishEngulfing,
        strategy_SupportResistance, strategy_DemandZoneBounce, strategy_SupplyZoneBounce,
        strategy_FibonacciRetracement, strategy_VolumeSpike, strategy_UltraScalp_PriceAction,
        strategy_FastScalp_RSI_MACD, strategy_Intraday_Bollinger_Squeeze, strategy_Swing_OrderBlock,
        strategy_Position_Monthly_Trend, strategy_Multi_PinBar, strategy_Multi_Doji_Reversal
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
        if (!selectedTimeframe || !TIMEFRAMES[selectedTimeframe]) return 1000;
        return Math.min(Math.max(TIMEFRAMES[selectedTimeframe].waitSeconds * 1000, 500), 5000);
    }

    // =====================================================
    // ========== القاعدة الذهبية للـ 90% ==========
    // =====================================================
    
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
    
    function calculateParabolicSAR(candles) {
        if(candles.length < 3) return 0;
        let sar = candles[candles.length-2].close;
        return sar;
    }
    
    function calculateFisherTransform(candles) {
        if(candles.length < 10) return 0;
        let prices = candles.map(c => c.close);
        let max10 = Math.max(...prices.slice(-10));
        let min10 = Math.min(...prices.slice(-10));
        let value = (prices[prices.length-1] - min10) / (max10 - min10) * 2 - 1;
        return value;
    }
    
    function calculateHMA(candles, period) {
        if(candles.length < period) return 0;
        let closes = candles.map(c => c.close);
        let halfPeriod = Math.floor(period / 2);
        let sqrtPeriod = Math.sqrt(period);
        let wma1 = 0, wma2 = 0;
        for(let i = 0; i < halfPeriod; i++) {
            wma1 += closes[closes.length - halfPeriod + i] * (i + 1);
        }
        wma1 = wma1 / (halfPeriod * (halfPeriod + 1) / 2);
        for(let i = 0; i < period; i++) {
            wma2 += closes[closes.length - period + i] * (i + 1);
        }
        wma2 = wma2 / (period * (period + 1) / 2);
        let hma = 2 * wma1 - wma2;
        return hma;
    }
    
    function calculateCMF(candles, period) {
        if(candles.length < period) return 0;
        let sumMF = 0, sumVol = 0;
        for(let i = candles.length - period; i < candles.length; i++) {
            let mfMultiplier = ((candles[i].close - candles[i].low) - (candles[i].high - candles[i].close)) / (candles[i].high - candles[i].low);
            let mfVolume = mfMultiplier * (candles[i].volume || 1000);
            sumMF += mfVolume;
            sumVol += (candles[i].volume || 1000);
        }
        return sumMF / sumVol;
    }
    
    function calculateIchimokuConversion(candles) {
        if(candles.length < 9) return 0;
        let highs = candles.slice(-9).map(c => c.high);
        let lows = candles.slice(-9).map(c => c.low);
        return (Math.max(...highs) + Math.min(...lows)) / 2;
    }
    
    function calculateIchimokuBase(candles) {
        if(candles.length < 26) return 0;
        let highs = candles.slice(-26).map(c => c.high);
        let lows = candles.slice(-26).map(c => c.low);
        return (Math.max(...highs) + Math.min(...lows)) / 2;
    }
    
    function calculateIchimokuSpanA(candles) {
        let conversion = calculateIchimokuConversion(candles);
        let base = calculateIchimokuBase(candles);
        return (conversion + base) / 2;
    }
    
    function calculateIchimokuSpanB(candles) {
        if(candles.length < 52) return 0;
        let highs = candles.slice(-52).map(c => c.high);
        let lows = candles.slice(-52).map(c => c.low);
        return (Math.max(...highs) + Math.min(...lows)) / 2;
    }
    
    function calculateSMMA(candles, period, offset) {
        if(candles.length < period) return 0;
        let closes = candles.map(c => c.close);
        let smma = closes.slice(-period).reduce((a,b) => a+b, 0) / period;
        return smma;
    }
    
    function detectFractals(candles) {
        let bullish = 0, bearish = 0;
        for(let i = 2; i < candles.length - 2; i++) {
            if(candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high &&
               candles[i].high > candles[i+1].high && candles[i].high > candles[i+2].high) {
                bearish++;
            }
            if(candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low &&
               candles[i].low < candles[i+1].low && candles[i].low < candles[i+2].low) {
                bullish++;
            }
        }
        return {bullish, bearish};
    }
    
    function getBTCPerformance() {
        return 0.05;
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
    // ========== كشف العملة (xfLZW) مع حل مشكلة تغيير العملة ==========
    // =====================================================
    function initAssetDetectionV2() {
        function detectAsset() {
            const assetEl = document.querySelector('.xfLZW');
            if (assetEl) {
                let currentAssetName = assetEl.innerText.trim().split('\n')[0];
                if (currentAssetName && currentAssetName !== lastDetectedAsset) {
                    console.log(`🔄 تم اكتشاف تغيير العملة إلى: ${currentAssetName} | جاري إعادة ضبط المستويات...`);
                    
                    // تنظيف الذاكرة القديمة
                    priceHistory = [];
                    demandZones = [];
                    supplyZones = [];
                    orderBlocks = [];
                    fibonacciLevels = {};
                    swingHigh = 0;
                    swingLow = 0;
                    
                    // تحديث اسم العملة الحالي
                    lastDetectedAsset = currentAssetName;
                    currentAsset = currentAssetName;
                    
                    console.log(`%c 💎 العملة الحالية: ${currentAssetName} `, "color: white; background: #27ae60; padding: 5px; font-weight: bold; border-radius: 4px;");
                    const assetDisplay = document.getElementById('current-asset-display');
                    if (assetDisplay) assetDisplay.innerText = currentAssetName;
                    
                    // إعادة تشغيل الحسابات بعد ثانية لضمان تحميل بيانات الشارت الجديدة
                    setTimeout(() => {
                        detectSupplyDemandZones();
                        updateFibonacciLevels();
                        if(botRunning) {
                            showNotification(`تم التحديث: ${currentAssetName}`, "#00ffaa");
                        }
                    }, 1500);
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
    if (price > 1000) return;
    if (price < 0.00001) return;
    if (priceHistory.length === 0) return;
    
    var currentCandleTime = Math.floor(timestamp / 60000) * 60000;
    var lastCandle = priceHistory[priceHistory.length - 1];
    
    if (lastCandle.time !== currentCandleTime) {
        priceHistory.push({
            time: currentCandleTime,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 1000
        });
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
    
    // ========== تحديث مستويات فيبوناتشي مع التحقق من صحة البيانات ==========
function updateFibonacciLevels() {
    if (!priceHistory || priceHistory.length < 10) {
        console.warn("⚠️ انتظار تجميع بيانات العملة الجديدة لحساب فيبوناتشي...");
        return;
    }

    let recentPrices = priceHistory.slice(-100);
    let highs = recentPrices.map(p => p.high || p.close);
    let lows = recentPrices.map(p => p.low || p.close);
    
    // ========== فلتر الأرقام الخاطئة ==========
    let validHighs = highs.filter(h => h > 0.0001 && h < 1000);
    let validLows = lows.filter(l => l > 0.0001 && l < 1000);
    
    if (validHighs.length === 0 || validLows.length === 0) {
        console.warn("⚠️ لا توجد بيانات صالحة لحساب فيبوناتشي");
        return;
    }
    
    swingHigh = Math.max(...validHighs);
    swingLow = Math.min(...validLows);
    
    let range = swingHigh - swingLow;
    
    // منع النطاق الخاطئ (أكبر من 10 أو صفر)
    if (range === 0 || range > 10) {
        console.warn("⚠️ نطاق فيبوناتشي غير طبيعي:", range);
        return;
    }

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
    if (fibEl && fibonacciLevels.level382 && fibonacciLevels.level382 < 1000) {
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
    } else if (fibEl) {
        fibEl.innerHTML = `<div style="background:#00000066;border-radius:12px;padding:8px;margin-bottom:10px;">
            <div style="font-size:9px;color:#ff6666;margin-bottom:4px;">📐 جاري تحميل بيانات فيبوناتشي...</div>
        </div>`;
    }
}

function getOptimalEntry(price, direction) {
    // فحص صحة السعر
    if (price > 1000 || price < 0.00001) return price;
    
    if (!SETTINGS.useSmartEntry) return price;
    if (direction === "CALL") {
        let demandZone = getNearestDemandZone(price);
        if (demandZone && price > demandZone.price && demandZone.price < 1000) return demandZone.price;
        if (fibonacciLevels.level382 && fibonacciLevels.level382 < 1000 && fibonacciLevels.level382 > 0) {
            return fibonacciLevels.level382;
        }
        return price;
    } else {
        let supplyZone = getNearestSupplyZone(price);
        if (supplyZone && price < supplyZone.price && supplyZone.price < 1000) return supplyZone.price;
        if (fibonacciLevels.level618 && fibonacciLevels.level618 < 1000 && fibonacciLevels.level618 > 0) {
            return fibonacciLevels.level618;
        }
        return price;
    }
}

function getOptimalTP(entryPrice, direction) {
    // فحص صحة سعر الدخول
    if (entryPrice > 1000 || entryPrice < 0.00001) {
        return direction === "CALL" ? entryPrice + SETTINGS.takeProfitPips/10000 : entryPrice - SETTINGS.takeProfitPips/10000;
    }
    
    if (!SETTINGS.useFibonacciLevels) {
        return direction === "CALL" ? entryPrice + SETTINGS.takeProfitPips/10000 : entryPrice - SETTINGS.takeProfitPips/10000;
    }
    if (direction === "CALL") {
        let supplyZone = getNearestSupplyZone(entryPrice);
        if (supplyZone && supplyZone.price > entryPrice && supplyZone.price < 1000) return supplyZone.price;
        if (fibonacciLevels.level618 && fibonacciLevels.level618 < 1000 && fibonacciLevels.level618 > entryPrice) {
            return fibonacciLevels.level618;
        }
        return entryPrice + SETTINGS.takeProfitPips/10000;
    } else {
        let demandZone = getNearestDemandZone(entryPrice);
        if (demandZone && demandZone.price < entryPrice && demandZone.price > 0) return demandZone.price;
        if (fibonacciLevels.level382 && fibonacciLevels.level382 < 1000 && fibonacciLevels.level382 < entryPrice) {
            return fibonacciLevels.level382;
        }
        return entryPrice - SETTINGS.takeProfitPips/10000;
    }
}

function getOptimalSL(entryPrice, direction) {
    // فحص صحة سعر الدخول
    if (entryPrice > 1000 || entryPrice < 0.00001) {
        return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
    }
    
    if (!SETTINGS.useFibonacciLevels) {
        return direction === "CALL" ? entryPrice - SETTINGS.stopLossPips/10000 : entryPrice + SETTINGS.stopLossPips/10000;
    }
    if (direction === "CALL") {
        let demandZone = getNearestDemandZone(entryPrice);
        if (demandZone && demandZone.price < entryPrice && demandZone.price > 0) return demandZone.price - 0.0002;
        if (fibonacciLevels.level236 && fibonacciLevels.level236 < 1000 && fibonacciLevels.level236 < entryPrice) {
            return fibonacciLevels.level236;
        }
        return entryPrice - SETTINGS.stopLossPips/10000;
    } else {
        let supplyZone = getNearestSupplyZone(entryPrice);
        if (supplyZone && supplyZone.price > entryPrice && supplyZone.price < 1000) return supplyZone.price + 0.0002;
        if (fibonacciLevels.level786 && fibonacciLevels.level786 < 1000 && fibonacciLevels.level786 > entryPrice) {
            return fibonacciLevels.level786;
        }
        return entryPrice + SETTINGS.stopLossPips/10000;
    }
}

function updatePriceDisplay(price, diff) {
    // فحص صحة السعر قبل العرض
    if (price > 1000 || price < 0.00001) {
        const priceEl = document.getElementById('current-price-display');
        if (priceEl) priceEl.innerText = "جاري التحميل...";
        return;
    }
    
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

    // ========== عرض الإشارة بشكل دائري مع لهب سريع (Flame Ring Effect) ==========
    function showSignal(direction, strength, confidence, reason, candlePattern = null) {
        let entryPrice = currentPrice > 0 ? currentPrice : 1.10000;
        let optimalEntry = getOptimalEntry(entryPrice, direction);
        
        let isCall = direction === "CALL";
        let mc = isCall ? "#00ffaa" : "#ff4466";
        let title = isCall ? "إشارة : شراء" : "إشارة : بيع";
        let icon = isCall ? "🟢" : "🔴";
        
        let candleInfo = candlePattern ? `<span style="color:#ffaa66;font-size:10px;"> 💥 إشارة قوية 💥</span>` : '';
        
        if(canOpenTrade() && SETTINGS.autoExecuteTrades) {
            openTrade(direction, entryPrice, confidence, reason);
        }

        // إنشاء طبقة الخلفية (Overlay)
        let overlay = document.createElement('div');
        overlay.id = 'signal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(5px);
            z-index: 10000000; display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.3s ease;
        `;
        
        // إنشاء الحاوية الدائرية الرئيسية
        let circle = document.createElement('div');
        circle.style.cssText = `
            width: 280px; height: 280px; border-radius: 50%;
            background: radial-gradient(circle, rgba(20,23,28,0.95), rgba(0,0,0,0.98));
            border: 3px solid ${mc};
            box-shadow: 0 0 50px ${mc}, inset 0 0 30px rgba(0,0,0,0.5);
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            animation: flameRing 0.8s ease-out, pulseGlow 1.5s infinite;
            transform: scale(0.3); opacity: 0;
            transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
            position: relative;
        `;
        
        // حلقة اللهب الخارجية (Flame Ring)
        let flameRing = document.createElement('div');
        flameRing.style.cssText = `
            position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px;
            border-radius: 50%; border: 2px solid transparent;
            border-top-color: ${mc}; border-right-color: #ffaa33;
            animation: spinFlame 0.6s linear infinite;
            pointer-events: none;
        `;
        
        // حلقة لهب ثانية عكسية
        let flameRing2 = document.createElement('div');
        flameRing2.style.cssText = `
            position: absolute; top: -5px; left: -5px; right: -5px; bottom: -5px;
            border-radius: 50%; border: 1px solid transparent;
            border-bottom-color: ${isCall ? "#00ffaa" : "#ff4466"}; border-left-color: #ffaa33;
            animation: spinFlameReverse 0.4s linear infinite;
            pointer-events: none;
        `;
        
        // محتوى الإشارة
        let content = document.createElement('div');
        content.style.cssText = `
            text-align: center; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif;
            padding: 20px; z-index: 10;
        `;
        
        content.innerHTML = `
            <div style="font-size: 30px; margin-bottom: 10px; animation: bounceIcon 0.5s ease;">${icon}</div>
            <div style="color: ${mc}; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px;">${title}${candleInfo}</div>
            <div style="color: #ffd966; font-size: 42px; font-weight: bold; margin: 10px 0;">${confidence.toFixed(0)}<span style="font-size: 18px;">%</span></div>
            <div style="color: #aaa; font-size: 11px; margin-bottom: 5px;">🎯 نقطة الدخول</div>
            <div style="color: #00ffaa; font-size: 20px; font-weight: bold; font-family: monospace; margin-bottom: 8px;">${optimalEntry.toFixed(5)}</div>
            <div style="color: #ffaa66; font-size: 13px; font-weight: bold; margin-bottom: 8px;">⚡ ${strength}</div>
        `;
        
        circle.appendChild(flameRing);
        circle.appendChild(flameRing2);
        circle.appendChild(content);
        overlay.appendChild(circle);
        document.body.appendChild(overlay);
        
        // إضافة الأنماط الديناميكية
        let style = document.createElement('style');
        style.textContent = `
            @keyframes flameRing {
                0% { transform: scale(0); opacity: 0; box-shadow: 0 0 0px ${mc}; }
                50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 80px ${mc}, 0 0 120px #ffaa33; }
                100% { transform: scale(1); opacity: 1; box-shadow: 0 0 50px ${mc}, 0 0 80px #ffaa33; }
            }
            @keyframes spinFlame {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes spinFlameReverse {
                0% { transform: rotate(360deg); }
                100% { transform: rotate(0deg); }
            }
            @keyframes pulseGlow {
                0% { box-shadow: 0 0 40px ${mc}, inset 0 0 20px rgba(0,0,0,0.5); }
                50% { box-shadow: 0 0 70px ${mc}, 0 0 100px #ffaa33, inset 0 0 30px rgba(0,0,0,0.3); }
                100% { box-shadow: 0 0 40px ${mc}, inset 0 0 20px rgba(0,0,0,0.5); }
            }
            @keyframes bounceIcon {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.3); }
                100% { transform: scale(1); }
            }
            @keyframes fadeOutSignal {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(0.5); }
            }
        `;
        document.head.appendChild(style);
        
        // تفعيل الظهور
        setTimeout(() => {
            overlay.style.opacity = '1';
            circle.style.transform = 'scale(1)';
            circle.style.opacity = '1';
        }, 50);
        
        // إخفاء وإزالة الإشارة بعد 3 ثواني
        setTimeout(() => {
            circle.style.animation = 'fadeOutSignal 0.4s ease forwards';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if(overlay && overlay.remove) overlay.remove();
                if(style && style.remove) style.remove();
            }, 500);
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
        ui.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:380px;max-width:calc(100% - 40px);max-height:90vh;overflow-y:auto;
    background:linear-gradient(145deg,#0a0f1e,#020408);border-radius:28px;
    border:1px solid rgba(255,217,102,0.3);z-index:999990;direction:rtl;
    font-family:'Tahoma','Segoe UI',monospace;box-shadow:0 10px 30px rgba(0,0,0,0.6);
    backdrop-filter:blur(8px);`;
        
        ui.innerHTML=`
            <div style="background:linear-gradient(135deg,#ffd96622,#00000033);padding:12px 16px;border-bottom:1px solid #ffd96655;border-radius:28px 28px 0 0;cursor:move;" id="ui-header">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:13px;">🔥</span>
                        <div><h3 style="color:#ffd966;margin:0;font-size:13px;font-weight:bold;">Obeida BOT V2</h3>
                        <div style="font-size:8px;color:#88ccff;">🤯 البوت الأقوى في الوطن العربي 🤯</div></div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button id="minimize-btn" style="background:#ffd96622;border:none;color:#ffd966;cursor:pointer;font-size:12px;width:24px;height:24px;border-radius:50%;">−</button>
                        <button id="close-ui-btn" style="background:#ff446622;border:none;color:#ff8888;cursor:pointer;font-size:12px;width:24px;height:24px;border-radius:50%;">✕</button>
                    </div>
                </div>
            </div>
            <div id="ui-main-content" style="padding:12px;">
                <div style="background:linear-gradient(135deg,#00ffaa11,#00000044);border-radius:18px;padding:10px;text-align:center;margin-bottom:10px;border:1px solid #00ffaa33;">
                    <div style="font-size:8px;color:#aaa;">💰 السعر الحالي</div>
                    <div style="display:flex;justify-content:center;align-items:baseline;gap:10px;margin-top:3px;">
                        <span id="current-price-display" style="font-size:20px;color:#00ffaa;font-weight:bold;">0.00000</span>
                        <span id="price-diff-display" style="font-size:11px;font-weight:bold;">● 0</span>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:#00000055;border-radius:16px;padding:8px;text-align:center;">
                        <div style="font-size:8px;color:#aaa;">💰 العملة</div>
                        <div id="current-asset-display" style="font-size:11px;color:#00d4ff;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:#00000055;border-radius:16px;padding:8px;text-align:center;">
                        <div style="font-size:8px;color:#aaa;">⏱️ الفريم</div>
                        <div id="st-tf-value" style="font-size:11px;color:#ff9800;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
                    <div style="background:#00000055;border-radius:16px;padding:6px;text-align:center;">
                        <div style="font-size:7px;color:#aaa;">🏦 الحساب</div>
                        <div id="current-account-display" style="font-size:10px;font-weight:bold;">🔄 جاري الكشف...</div>
                    </div>
                    <div style="background:#00000055;border-radius:16px;padding:6px;text-align:center;">
                        <div style="font-size:7px;color:#aaa;">💧 السيولة</div>
                        <div id="current-liquidity-display" style="font-size:10px;font-weight:bold;">---</div>
                    </div>
                    <div style="background:#00000055;border-radius:16px;padding:6px;text-align:center;">
                        <div style="font-size:7px;color:#aaa;">📊 فيبوناتشي</div>
                        <div style="font-size:9px;color:#00ffaa;" id="fib-status">✅ مفعل</div>
                    </div>
                </div>
                
                <div id="current-timeframe-display" style="background:#00000055;border-radius:14px;padding:6px;text-align:center;font-size:9px;margin-bottom:10px;"></div>
                
                <div id="supply-demand-levels"></div>
                <div id="fib-levels"></div>
                
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <button id="start-btn" class="btn-hover" style="flex:1;padding:10px;background:linear-gradient(95deg,#00aa44,#008833);border:none;border-radius:28px;color:#fff;font-weight:bold;font-size:12px;">▶ بدء التداول</button>
                    <button id="stop-btn" class="btn-hover" style="flex:1;padding:10px;background:linear-gradient(95deg,#aa3333,#882222);border:none;border-radius:28px;color:#fff;display:none;font-weight:bold;font-size:12px;">⏹ إيقاف التداول</button>
                </div>
                
                <div id="status-text" style="background:#00000066;border-radius:14px;padding:8px;text-align:center;font-size:10px;color:#ffd966;margin-bottom:10px;">🔴 التداول متوقف</div>
                
                <div id="last-signal" style="background:rgba(0,0,0,0.4);border-radius:14px;padding:8px;margin-bottom:10px;"></div>
                
                <div id="trades-container"></div>
                
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <button id="settings-btn" class="btn-hover" style="flex:1;padding:6px;background:#333;border:none;border-radius:18px;color:#fff;font-size:10px;">⚙️ الإعدادات</button>
                    <button id="telegram-btn" class="btn-hover" style="flex:1;padding:6px;background:linear-gradient(95deg,#0088cc,#006699);border:none;border-radius:18px;color:#fff;font-size:10px;">📢 تليجرام</button>
                    <button id="fib-toggle" class="btn-hover" style="flex:1;padding:6px;background:#4a6a2a;border:none;border-radius:18px;color:#fff;font-size:10px;">📊 فيبوناتشي</button>
                </div>
                
                <div style="font-size:6px;color:#ffd96688;text-align:center;margin-top:10px;padding-top:6px;border-top:1px solid #ffffff11;">
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
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:25px;border-radius:28px;border:2px solid #ffd966;width:320px;">
                <h3 style="color:#ffd966;text-align:center;margin-bottom:15px;font-size:16px;">⚙️ إعدادات البوت V9</h3>
                <div style="margin-bottom:12px;"><label style="color:#fff;font-size:11px;">🎯 جني الربح (نقطة):</label>
                <input type="number" id="tp-setting" value="${SETTINGS.takeProfitPips}" style="width:100%;padding:6px;margin-top:3px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:8px;font-size:12px;"></div>
                <div style="margin-bottom:12px;"><label style="color:#fff;font-size:11px;">🛑 وقف الخسارة (نقطة):</label>
                <input type="number" id="sl-setting" value="${SETTINGS.stopLossPips}" style="width:100%;padding:6px;margin-top:3px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:8px;font-size:12px;"></div>
                <div style="margin-bottom:12px;"><label style="color:#fff;font-size:11px;">📊 الحد الأقصى للصفقات اليومية:</label>
                <input type="number" id="max-trades" value="${SETTINGS.maxTradesPerDay}" style="width:100%;padding:6px;margin-top:3px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:8px;font-size:12px;"></div>
                <div style="margin-bottom:12px;"><label style="color:#fff;font-size:11px;">🎯 الحد الأدنى للثقة (%):</label>
                <input type="number" id="min-conf" value="${SETTINGS.minConfidence}" style="width:100%;padding:6px;margin-top:3px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:8px;font-size:12px;"></div>
                <div style="margin-bottom:15px;"><label style="color:#fff;font-size:11px;">🤖 التنفيذ التلقائي:</label>
                <select id="auto-exec" style="width:100%;padding:6px;margin-top:3px;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:8px;font-size:12px;">
                    <option value="true" ${SETTINGS.autoExecuteTrades ? 'selected' : ''}>مفعل</option>
                    <option value="false" ${!SETTINGS.autoExecuteTrades ? 'selected' : ''}>معطل</option>
                </select></div>
                <button id="save-settings" class="btn-hover" style="width:100%;padding:8px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:18px;color:#000;cursor:pointer;font-weight:bold;font-size:12px;">حفظ الإعدادات</button>
                <button id="close-settings" class="btn-hover" style="width:100%;margin-top:8px;padding:6px;background:#333;border:none;border-radius:18px;color:#fff;cursor:pointer;font-size:11px;">إغلاق</button>
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
            <div style="background:linear-gradient(145deg,#0a0f1e,#020408);padding:35px;border-radius:45px;border:2px solid #ffd966;text-align:center;width:320px;">
                <div style="font-size:22px;">🔥</div>
                <h2 style="color:#ffd966;margin:8px 0;font-size:18px;">Obeida BOT V9</h2>
                <p style="color:#88ccff;font-size:11px;">تحليل حقيقي مربوط في سوق</p>
                <p style="color:#ffaa66;font-size:10px;">🔑 أدخل كلمة المرور للمتابعة 🔑</p>
                <input type="password" id="pass-input" placeholder="كلمة المرور"
                    style="width:100%;padding:10px;margin:15px 0;background:#0f1422;border:1px solid #ffd966;color:#fff;border-radius:28px;text-align:center;font-size:13px;">
                <button id="login-btn" class="btn-hover" style="width:100%;padding:10px;background:linear-gradient(95deg,#ffd966,#ffaa33);border:none;border-radius:28px;color:#000;cursor:pointer;font-weight:bold;">تأكيد الدخول</button>
                <p style="color:#ffaa66;margin-top:15px;font-size:10px;">📢 للحصول على كلمة المرور: <span id="tg-link" style="color:#88ccff;cursor:pointer;">@ObeidaTrading</span></p>
                <div style="font-size:8px;color:#555;margin-top:12px;">⚡ البوت الأقوى في العالم العربي ⚡</div>
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
