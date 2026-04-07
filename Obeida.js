(function(){
    'use strict';
    
    // ========== 🔧 غيّر التاريخ والوقت هنا ==========
    var YEAR = 2025;      
    var MONTH = 3;        // 3 = أبريل
    var DAY = 8;          // اليوم
    var HOUR = 10;        // 18 = 6 مساءً
    var MINUTE = 30;       
    // =================================================
    
    var TELEGRAM_CHANNEL = "https://t.me/ObeidaTrading";
    var CHANNEL_NAME = "Obeida Trading";
    var BOT_NAME = "Obeida BOT";
    var VERSION = "V1.0";
    
    var TARGET_DATE = new Date(YEAR, MONTH, DAY, HOUR, MINUTE, 0);
    
    var weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    var progressInterval = null;
    
    function createEpicUI() {
        var existing = document.getElementById('epic-ui');
        if (existing) existing.remove();
        
        var ui = document.createElement('div');
        ui.id = 'epic-ui';
        ui.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 50% 50%, #0a0005, #000000);
            z-index: 9999999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Poppins', 'Cairo', 'Segoe UI', system-ui, sans-serif;
            direction: rtl;
            overflow-y: auto;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        // لهب متحرك - طبقة النار
        var fireLayer1 = document.createElement('div');
        fireLayer1.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 40%;
            background: linear-gradient(0deg, rgba(255,50,0,0.3), rgba(255,100,0,0.1), transparent);
            border-radius: 50%;
            filter: blur(40px);
            animation: fireRise 2s ease-in-out infinite;
            pointer-events: none;
        `;
        ui.appendChild(fireLayer1);
        
        var fireLayer2 = document.createElement('div');
        fireLayer2.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 100%;
            height: 30%;
            background: radial-gradient(ellipse at 50% 100%, rgba(255,80,0,0.4), transparent);
            filter: blur(50px);
            animation: firePulse 1.5s ease-in-out infinite;
            pointer-events: none;
        `;
        ui.appendChild(fireLayer2);
        
        var fireLayer3 = document.createElement('div');
        fireLayer3.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 20% 80%, rgba(255,30,0,0.15), transparent 60%);
            pointer-events: none;
            animation: fireGlow 3s ease-in-out infinite;
        `;
        ui.appendChild(fireLayer3);
        
        // جزيئات نار متطايرة
        for (var i = 0; i < 30; i++) {
            var particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 6 + 2}px;
                height: ${Math.random() * 6 + 2}px;
                background: radial-gradient(circle, #ff6600, #ff3300);
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                bottom: ${Math.random() * 100}%;
                opacity: ${Math.random() * 0.6 + 0.2};
                animation: floatFire ${Math.random() * 4 + 3}s ease-out infinite;
                animation-delay: ${Math.random() * 2}s;
                pointer-events: none;
                filter: blur(1px);
            `;
            ui.appendChild(particle);
        }
        
        var card = document.createElement('div');
        card.style.cssText = `
            position: relative;
            max-width: 550px;
            width: 100%;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(15px);
            border-radius: 70px;
            padding: 45px 30px;
            text-align: center;
            border: 2px solid rgba(255, 80, 0, 0.6);
            box-shadow: 0 0 0 2px rgba(255,50,0,0.2), 0 0 60px rgba(255,50,0,0.3), 0 30px 60px rgba(0,0,0,0.5);
            animation: cardFloat 0.6s ease-out;
            box-sizing: border-box;
        `;
        
        card.innerHTML = `
            <div style="margin-bottom: 25px;">
                <div style="width: 75px; height: 75px; margin: 0 auto; background: radial-gradient(circle at 30% 30%, #ff4400, #ff2200); border-radius: 60px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(255,68,0,0.8), inset 0 2px 5px rgba(255,255,255,0.3); animation: iconBlaze 1.5s infinite;">
                    <span style="font-size: 52px; filter: drop-shadow(0 0 5px #ffaa00);">🔥</span>
                </div>
            </div>
            
            <h1 style="font-size: 30px; font-weight: 700; background: linear-gradient(135deg, #ffaa44, #ff4400, #ff2200); -webkit-background-clip: text; background-clip: text; color: transparent; margin: 0 0 5px; letter-spacing: -0.5px; text-shadow: 0 0 15px rgba(255,68,0,0.5);">${BOT_NAME}</h1>
            
            <p style="font-size: 13px; color: rgba(255,100,50,0.8); margin: 0 0 20px; letter-spacing: 3px; font-weight: bold;"> البوت الاول في العالم العربي </p>
            
            <div style="background: linear-gradient(95deg, #ff3300, #ff6600); padding: 10px 24px; border-radius: 50px; display: inline-block; margin-bottom: 30px; box-shadow: 0 0 25px rgba(255,51,0,0.6); animation: blazePulse 1.2s infinite;">
                <span style="color: #fff; font-weight: bold; font-size: 14px;">🌋 تحديث الأسطوري قادم 🌋</span>
            </div>
            
            <div style="background: rgba(255,51,0,0.15); border-radius: 35px; padding: 18px; margin-bottom: 30px; border: 1px solid rgba(255,80,0,0.4); backdrop-filter: blur(5px);">
                <div style="color: #ff8866; font-size: 13px; margin-bottom: 6px;">📅 موعد الإطلاق النسخة الاقوى 🤯</div>
                <div style="color: #ffcc88; font-size: 18px; font-weight: bold; text-shadow: 0 0 5px rgba(255,68,0,0.5);">${weekDays[TARGET_DATE.getDay()]} ${TARGET_DATE.getDate()} ${months[TARGET_DATE.getMonth()]} • ${String(TARGET_DATE.getHours()).padStart(2,'0')}:${String(TARGET_DATE.getMinutes()).padStart(2,'0')}</div>
            </div>
            
            <div style="margin: 30px 0 25px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="font-size: 15px; color: #ffaa77; font-weight: bold;">🔥 نسبة اكتمال التحديث ...</span>
                    <span id="percent" style="font-size: 16px; color: #ff6633; font-weight: bold; text-shadow: 0 0 5px #ff3300;">0%</span>
                </div>
                <div style="background: rgba(0,0,0,0.7); border-radius: 40px; height: 14px; overflow: hidden; border: 1px solid rgba(255,80,0,0.3);">
                    <div id="progress" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ff2200, #ff5500, #ff8800, #ff5500, #ff2200); background-size: 200% 100%; border-radius: 40px; transition: width 0.5s cubic-bezier(0.2, 0.9, 0.4, 1.1); position: relative; animation: fireGradient 2s linear infinite;">
                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation: shimmer 1.5s infinite;"></div>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 30px 0 25px;">
                <span style="background: rgba(255,51,0,0.2); padding: 8px 18px; border-radius: 40px; font-size: 12px; color: #ffaa77; border: 1px solid rgba(255,68,0,0.4); font-weight: bold;">🔥 السوق يقوم بتحليل نفسه </span>
            
            <a href="${TELEGRAM_CHANNEL}" target="_blank" id="channelBtn" style="display: flex; align-items: center; justify-content: center; gap: 12px; background: linear-gradient(95deg, #ff3300, #ff6600, #ff3300); background-size: 200% 100%; padding: 16px 25px; border-radius: 60px; text-decoration: none; color: #fff; font-weight: bold; font-size: 16px; margin: 20px 0 15px; transition: all 0.3s; cursor: pointer; box-shadow: 0 0 30px rgba(255,51,0,0.5); animation: btnFire 1.5s infinite;">
                <span style="font-size: 18px;">🌋</span>
                <span>انضم لقناة </span>
                <span style="font-size: 18px;">🔥</span>
            </a>
            
            <div style="font-size: 10px; color: rgba(255,80,50,0.4); margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,80,0,0.2);">
                © 2025 ${CHANNEL_NAME} • أقوى نظام تداول آلي
            </div>
        `;
        
        ui.appendChild(card);
        document.body.appendChild(ui);
        
        // إضافة الأنماط النارية
        var style = document.createElement('style');
        style.textContent = `
            @keyframes cardFloat {
                0% { opacity: 0; transform: scale(0.85) translateY(40px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes fireRise {
                0%, 100% { opacity: 0.4; transform: translateY(0) scale(1); }
                50% { opacity: 0.8; transform: translateY(-20px) scale(1.05); }
            }
            @keyframes firePulse {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.1); }
            }
            @keyframes fireGlow {
                0%, 100% { opacity: 0.2; }
                50% { opacity: 0.5; }
            }
            @keyframes iconBlaze {
                0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(255,68,0,0.5); }
                50% { transform: scale(1.08); box-shadow: 0 0 45px rgba(255,68,0,0.9); }
            }
            @keyframes blazePulse {
                0%, 100% { opacity: 0.9; transform: scale(1); box-shadow: 0 0 20px rgba(255,51,0,0.5); }
                50% { opacity: 1; transform: scale(1.03); box-shadow: 0 0 40px rgba(255,51,0,0.9); }
            }
            @keyframes fireGradient {
                0% { background-position: 0% 50%; }
                100% { background-position: 200% 50%; }
            }
            @keyframes btnFire {
                0%, 100% { background-position: 0% 50%; box-shadow: 0 0 20px rgba(255,51,0,0.4); }
                50% { background-position: 100% 50%; box-shadow: 0 0 40px rgba(255,51,0,0.8); }
            }
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            @keyframes floatFire {
                0% { transform: translateY(0) translateX(0); opacity: 0.6; }
                100% { transform: translateY(-150px) translateX(${Math.random() * 100 - 50}px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        startProgress();
        checkCompletion();
    }
    
    function startProgress() {
        var startTime = new Date();
        var totalDuration = TARGET_DATE - startTime;
        
        progressInterval = setInterval(function() {
            var now = new Date();
            if (now >= TARGET_DATE) {
                clearInterval(progressInterval);
                showFinalMessage();
                return;
            }
            var elapsed = now - startTime;
            var percent = (elapsed / totalDuration) * 100;
            percent = Math.min(99, Math.max(0, percent));
            
            var progressBar = document.getElementById('progress');
            var percentText = document.getElementById('percent');
            if (progressBar) progressBar.style.width = percent + '%';
            if (percentText) percentText.innerText = Math.floor(percent) + '%';
        }, 1000);
    }
    
    function checkCompletion() {
        var checkInterval = setInterval(function() {
            if (new Date() >= TARGET_DATE) {
                clearInterval(checkInterval);
                clearInterval(progressInterval);
                showFinalMessage();
            }
        }, 1000);
    }
    
    function showFinalMessage() {
        var card = document.querySelector('#epic-ui > div');
        if (!card) return;
        
        var oldProgress = card.querySelector('div[style*="margin: 30px 0 25px;"]');
        if (oldProgress) oldProgress.style.display = 'none';
        
        var oldDate = card.querySelector('div[style*="background: rgba(255,51,0,0.15);"]');
        if (oldDate) oldDate.style.display = 'none';
        
        var msg = document.createElement('div');
        msg.style.cssText = `
            background: linear-gradient(145deg, rgba(255,51,0,0.25), rgba(255,51,0,0.08));
            border-radius: 50px;
            padding: 40px 25px;
            margin: 20px 0;
            border: 2px solid #ff4400;
            text-align: center;
            animation: blazePulse 0.8s infinite;
            box-shadow: 0 0 30px rgba(255,68,0,0.3);
        `;
        msg.innerHTML = `
            <div style="font-size: 75px; margin-bottom: 10px; filter: drop-shadow(0 0 10px #ff4400);">🌋🔥</div>
            <div style="color: #ff6633; font-size: 26px; font-weight: 900; margin: 10px 0; text-shadow: 0 0 10px rgba(255,68,0,0.5);">لم يكتمل التحديث الأقوى!</div>
            <div style="color: rgba(255,150,100,0.9); font-size: 15px; margin: 15px 0 25px; line-height: 1.8;">
                يرجى الانضمام للقناة لمعرفة السبب 🔥<br>
            </div>
            <a href="${TELEGRAM_CHANNEL}" target="_blank" style="display: inline-flex; align-items: center; gap: 12px; background: linear-gradient(95deg, #ff3300, #ff6600); padding: 15px 40px; border-radius: 60px; text-decoration: none; color: white; font-weight: bold; font-size: 16px; box-shadow: 0 0 35px rgba(255,51,0,0.6); transition: all 0.3s;">
                🔓 انضم الآن لمعرفة السبب 🔥
            </a>
            <div style="color: #ff8866; font-size: 12px; margin-top: 20px;">💡 سيعمل البوت فور انضمامك</div>
        `;
        
        var btn = card.querySelector('#channelBtn');
        if (btn) {
            card.insertBefore(msg, btn);
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        } else {
            card.appendChild(msg);
        }
        
        var statusDiv = card.querySelector('div[style*="background: linear-gradient(95deg, #ff3300"]');
        if (statusDiv) {
            statusDiv.style.background = "linear-gradient(95deg, #ff5500, #ff2200)";
            var statusSpan = statusDiv.querySelector('span');
            if (statusSpan) statusSpan.innerText = "⚠️ يلزم الانضمام للقناة ⚠️";
        }
        
        console.log("%c═══════════════════════════════════════════", "color: #ff4400");
        console.log("%c🌋 انتهى وقت التحديث الناري! انضم للقناة 🔥", "color: #ff6633; font-size: 14px; font-weight: bold");
        console.log("%c📢 " + TELEGRAM_CHANNEL, "color: #ffaa66; font-size: 13px");
        console.log("%c═══════════════════════════════════════════", "color: #ff4400");
    }
    
    createEpicUI();
    
    console.log("%c═══════════════════════════════════════════", "color: #ff4400");
    console.log("%c🌋 OBEIDA - التحديث الناري الأسطوري 🌋", "color: #ff4400; font-size: 16px; font-weight: bold");
    console.log("%c═══════════════════════════════════════════", "color: #ff4400");
    console.log("%c📅 موعد الإطلاق: " + weekDays[TARGET_DATE.getDay()] + " " + TARGET_DATE.getDate() + " " + months[TARGET_DATE.getMonth()] + " • الساعة " + String(TARGET_DATE.getHours()).padStart(2,'0') + ":" + String(TARGET_DATE.getMinutes()).padStart(2,'0'), "color: #ff8866");
    console.log("%c📢 قناة التليجرام: " + TELEGRAM_CHANNEL, "color: #88aaff");
    console.log("%c═══════════════════════════════════════════", "color: #ff4400");
    
})();
