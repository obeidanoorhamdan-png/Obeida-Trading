// ============================================
// Obeida Trading Bot - واجهة الصيانة والتحديث
// نسخة احترافية تعمل داخل Console
// ============================================
(function(){
    'use strict';
    
    // قناة التليجرام
    const TELEGRAM_CHANNEL = "https://t.me/ObeidaTrading";
    const CHANNEL_NAME = "Obeida Trading";
    const BOT_NAME = "Obeida Trading";
    const VERSION = "V5.0";
    
    // حالة البوت
    let maintenanceMode = true;
    let updateProgress = 0;
    let updateInterval = null;
    
    // =====================================================
    // ========== إنشاء الواجهة الاحترافية ==========
    // =====================================================
    
    function createMaintenanceUI() {
        // إزالة أي واجهة سابقة
        const existingUI = document.getElementById('obeida-maintenance-ui');
        if (existingUI) existingUI.remove();
        
        // إنشاء العنصر الرئيسي
        const ui = document.createElement('div');
        ui.id = 'obeida-maintenance-ui';
        ui.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a0f1e 0%, #020408 100%);
            z-index: 9999999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Tahoma', 'Segoe UI', 'Cairo', monospace;
            direction: rtl;
            overflow: hidden;
        `;
        
        // إضافة تأثير الخلفية المتحركة
        const bgEffect = document.createElement('div');
        bgEffect.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 20% 50%, rgba(255,217,102,0.05) 0%, transparent 50%);
            animation: pulse 4s ease-in-out infinite;
            pointer-events: none;
        `;
        ui.appendChild(bgEffect);
        
        // المحتوى الرئيسي
        const content = document.createElement('div');
        content.style.cssText = `
            position: relative;
            z-index: 2;
            text-align: center;
            max-width: 550px;
            width: 90%;
            padding: 40px 30px;
            background: rgba(10, 15, 30, 0.7);
            backdrop-filter: blur(20px);
            border-radius: 60px;
            border: 2px solid rgba(255, 217, 102, 0.3);
            box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,217,102,0.1) inset;
            animation: slideUp 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.1);
        `;
        
        // أيقونة التحديث المتحركة
        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = `
            margin-bottom: 25px;
            animation: rotate 2s linear infinite;
            display: inline-block;
        `;
        iconContainer.innerHTML = `
            <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="40" stroke="rgba(255,217,102,0.2)" stroke-width="6" fill="none"/>
                <path d="M50 10 A40 40 0 0 1 90 50" stroke="#ffd966" stroke-width="6" fill="none" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1.5s" repeatCount="indefinite"/>
                </path>
                <circle cx="50" cy="50" r="8" fill="#ffd966">
                    <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
        `;
        content.appendChild(iconContainer);
        
        // عنوان البوت
        const title = document.createElement('h1');
        title.style.cssText = `
            font-size: 32px;
            font-weight: bold;
            background: linear-gradient(135deg, #ffd966, #ffaa33);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            margin: 0 0 10px 0;
            text-shadow: 0 0 20px rgba(255,217,102,0.3);
        `;
        title.innerText = BOT_NAME;
        content.appendChild(title);
        
        // إصدار البوت
        const version = document.createElement('div');
        version.style.cssText = `
            font-size: 14px;
            color: #88ccff;
            margin-bottom: 25px;
            letter-spacing: 2px;
        `;
        version.innerText = VERSION + " | ULTIMATE EDITION";
        content.appendChild(version);
        
        // حالة البوت
        const statusBadge = document.createElement('div');
        statusBadge.style.cssText = `
            display: inline-block;
            background: linear-gradient(95deg, #ff4466, #cc2244);
            padding: 6px 18px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: bold;
            color: #fff;
            margin-bottom: 25px;
            animation: pulse 1.5s ease-in-out infinite;
        `;
        statusBadge.innerText = "🔧 جاري التحديث والصيانة";
        content.appendChild(statusBadge);
        
        // شريط التقدم
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            background: rgba(0,0,0,0.5);
            border-radius: 30px;
            height: 12px;
            width: 100%;
            margin: 20px 0;
            overflow: hidden;
            border: 1px solid rgba(255,217,102,0.3);
        `;
        
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #ffd966, #ffaa33);
            border-radius: 30px;
            transition: width 0.3s ease;
            animation: shimmer 1.5s infinite;
        `;
        progressContainer.appendChild(progressBar);
        content.appendChild(progressContainer);
        
        // نص التقدم
        const progressText = document.createElement('div');
        progressText.style.cssText = `
            font-size: 12px;
            color: #aaa;
            margin-bottom: 25px;
        `;
        progressText.innerText = "جاري تحميل التحديثات... 0%";
        content.appendChild(progressText);
        
        // معلومات التحديث
        const updateInfo = document.createElement('div');
        updateInfo.style.cssText = `
            background: rgba(0,0,0,0.4);
            border-radius: 20px;
            padding: 15px;
            margin: 20px 0;
            text-align: right;
            font-size: 12px;
            border-right: 3px solid #ffd966;
        `;
        updateInfo.innerHTML = `
            <div style="color:#88ccff; margin-bottom:8px;">📋 قائمة التحديثات الجديدة:</div>
            <div style="color:#ddd; font-size:11px;">• ✨ إضافة اقوى استراتيجيات</div>
            <div style="color:#ddd; font-size:11px;">• 📊 تحليل الشموع المؤثرة مع توصيات</div>
            <div style="color:#ddd; font-size:11px;">• 🎯 نظام دخول ذكي وفق فيبوناتشي</div>
            <div style="color:#ddd; font-size:11px;">• 📈 رادار سعر لحظي متطور</div>
            <div style="color:#ddd; font-size:11px;">• 🔄 تحسين الأداء وسرعة الاستجابة</div>
            <div style="color:#ddd; font-size:11px;">• 🛡️ إدارة مخاطر متقدمة</div>
        `;
        content.appendChild(updateInfo);
        
        // رابط القناة
        const channelLink = document.createElement('a');
        channelLink.href = TELEGRAM_CHANNEL;
        channelLink.target = "_blank";
        channelLink.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: linear-gradient(95deg, #0088cc, #006699);
            padding: 14px 25px;
            border-radius: 50px;
            text-decoration: none;
            color: #fff;
            font-weight: bold;
            font-size: 16px;
            margin: 20px 0;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
            border: none;
        `;
        channelLink.onmouseover = () => {
            channelLink.style.transform = "scale(1.02)";
            channelLink.style.boxShadow = "0 5px 20px rgba(0,136,204,0.4)";
        };
        channelLink.onmouseout = () => {
            channelLink.style.transform = "scale(1)";
            channelLink.style.boxShadow = "none";
        };
        channelLink.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
            <span>📢 انضم إلى قناة ${CHANNEL_NAME}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2zM17 3H3v18h18V3h-4zm0 2h2v14h-2V5z"/>
            </svg>
        `;
        content.appendChild(channelLink);
        
        // نص حقوق الملكية
        const copyright = document.createElement('div');
        copyright.style.cssText = `
            font-size: 10px;
            color: #555;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.1);
        `;
        copyright.innerHTML = `
            <div>© 2024 ${CHANNEL_NAME} | جميع الحقوق محفوظة</div>
            <div style="margin-top:5px;">⚡ أقوى نظام تداول آلي في العالم العربي ⚡</div>
        `;
        content.appendChild(copyright);
        
        ui.appendChild(content);
        document.body.appendChild(ui);
        
        // بدء محاكاة التحديث
        startUpdateSimulation(progressBar, progressText);
        
        // إضافة الأنماط
        addStyles();
    }
    
    function startUpdateSimulation(progressBar, progressText) {
        let progress = 0;
        updateInterval = setInterval(() => {
            progress += Math.random() * 8 + 2;
            if (progress >= 100) {
                progress = 100;
                clearInterval(updateInterval);
                showCompleteMessage();
            }
            progressBar.style.width = progress + '%';
            progressText.innerText = `جاري تحميل التحديثات... ${Math.floor(progress)}%`;
            
            // تحديث لون شريط التقدم حسب النسبة
            if (progress < 30) {
                progressBar.style.background = "linear-gradient(90deg, #ffaa33, #ff8866)";
            } else if (progress < 70) {
                progressBar.style.background = "linear-gradient(90deg, #ffd966, #ffaa33)";
            } else {
                progressBar.style.background = "linear-gradient(90deg, #00ffaa, #00cc88)";
            }
        }, 200);
    }
    
    function showCompleteMessage() {
        const content = document.querySelector('#obeida-maintenance-ui > div');
        if (!content) return;
        
        // إخفاء شريط التقدم القديم
        const oldProgress = content.querySelector('.update-progress-container');
        
        // إضافة رسالة الاكتمال
        const completeDiv = document.createElement('div');
        completeDiv.style.cssText = `
            background: rgba(0,255,170,0.1);
            border-radius: 20px;
            padding: 15px;
            margin: 15px 0;
            border: 1px solid #00ffaa;
            animation: fadeIn 0.5s ease;
        `;
        completeDiv.innerHTML = `
            <div style="color:#00ffaa; font-size:14px; font-weight:bold;">✅ اكتملت التحديثات بنجاح!</div>
            <div style="color:#88ccff; font-size:11px; margin-top:8px;">البوت جاهز للتشغيل - انتظر الإعلان في القناة</div>
        `;
        
        // إضافة زر إعادة المحاولة
        const refreshBtn = document.createElement('button');
        refreshBtn.style.cssText = `
            background: linear-gradient(95deg, #ffd966, #ffaa33);
            border: none;
            padding: 10px 25px;
            border-radius: 30px;
            color: #000;
            font-weight: bold;
            cursor: pointer;
            margin-top: 15px;
            font-size: 13px;
            transition: transform 0.2s;
        `;
        refreshBtn.innerHTML = "🔄 تحديث الصفحة بعد الانتهاء";
        refreshBtn.onclick = () => {
            window.location.reload();
        };
        refreshBtn.onmouseover = () => { refreshBtn.style.transform = "scale(1.02)"; };
        refreshBtn.onmouseout = () => { refreshBtn.style.transform = "scale(1)"; };
        
        // إضافة العناصر
        const channelLink = content.querySelector('a');
        if (channelLink) {
            content.insertBefore(completeDiv, channelLink);
            content.insertBefore(refreshBtn, channelLink);
        } else {
            content.appendChild(completeDiv);
            content.appendChild(refreshBtn);
        }
        
        // تحديث حالة البوت
        const statusBadge = content.querySelector('div[style*="background: linear-gradient(95deg, #ff4466"]');
        if (statusBadge) {
            statusBadge.style.background = "linear-gradient(95deg, #00aa44, #008833)";
            statusBadge.style.animation = "none";
            statusBadge.innerHTML = "✅ البوت جاهز للتشغيل";
        }
    }
    
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(50px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes glow {
                0%, 100% { box-shadow: 0 0 5px rgba(255,217,102,0.3); }
                50% { box-shadow: 0 0 20px rgba(255,217,102,0.6); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // =====================================================
    // ========== دوال إضافية للتحكم ==========
    // =====================================================
    
    function showNotification(message, type = "info") {
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            backdrop-filter: blur(10px);
            padding: 12px 20px;
            border-radius: 15px;
            color: #fff;
            font-size: 13px;
            z-index: 10000000;
            border-right: 3px solid ${type === "success" ? "#00ffaa" : (type === "error" ? "#ff4466" : "#ffd966")};
            animation: slideUp 0.3s ease;
            font-family: monospace;
        `;
        notif.innerHTML = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }
    
    function openChannel() {
        window.open(TELEGRAM_CHANNEL, '_blank');
        showNotification("✨ جاري فتح قناة " + CHANNEL_NAME, "success");
    }
    
    // تصدير API للاستخدام الخارجي
    window.ObeidaMaintenance = {
        version: VERSION,
        channel: TELEGRAM_CHANNEL,
        channelName: CHANNEL_NAME,
        isMaintenance: () => maintenanceMode,
        getProgress: () => updateProgress,
        openChannel: openChannel,
        refreshUI: createMaintenanceUI,
        showNotification: showNotification
    };
    
    // =====================================================
    // ========== بدء التشغيل ==========
    // =====================================================
    
    console.log(`%c✨ ${BOT_NAME} - وضع الصيانة والتحديث ✨`, "color: #ffd966; font-size: 16px; font-weight: bold;");
    console.log(`%c📢 قناة التليجرام: ${TELEGRAM_CHANNEL}`, "color: #88ccff; font-size: 12px;");
    console.log(`%c🔧 جاري تجهيز التحديثات الجديدة...`, "color: #ffaa66; font-size: 12px;");
    
    // إنشاء الواجهة
    createMaintenanceUI();
    
    // إضافة مستمع لأزرار القناة في أي مكان
    document.addEventListener('click', function(e) {
        if (e.target.closest('[data-telegram]') || (e.target.innerText && e.target.innerText.includes(CHANNEL_NAME))) {
            openChannel();
        }
    });
    
})();
