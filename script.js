// ============================================================
// ELEMENT REFERENCES
// ============================================================
const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');

// ============================================================
// ALARM SOUND
// ============================================================
const alarmSound = new Audio('assets/alarm.ogg');

// ============================================================
// STATE
// ============================================================
let endTime = null;   // wall-clock timestamp (ms) when timer expires
let alarmJsTimeout = null;   // in-page JS timeout for exact alarm firing
let intervalId = null;   // display refresh interval
let isRunning = false;
let isAlarmActive = false;
let wakeLock = null;
let vibrationInterval = null;
let swRegistration = null;
let currentPresetName = '';     // e.g. "Kayısı", used in notification body

const presetBtns = document.querySelectorAll('.preset-card');

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                swRegistration = reg;
                console.log('SW registered:', reg.scope);
            })
            .catch(err => console.warn('SW registration failed:', err));
    });

    // Messages FROM service worker → page
    navigator.serviceWorker.addEventListener('message', (event) => {
        const { type } = event.data;
        if (type === 'ALARM_TRIGGERED' && !isAlarmActive) timerFinished();
        if (type === 'STOP_ALARM') stopAlarm();
    });
}

// ============================================================
// NOTIFICATION PERMISSION – UI Banner
// ============================================================
function createNotificationBanner() {
    if ('Notification' in window && Notification.permission === 'default') {
        const banner = document.createElement('div');
        banner.id = 'notif-banner';
        banner.innerHTML = `
            <span>🔔 Arka planda alarm için bildirim iznine ihtiyacımız var.</span>
            <button id="notif-allow-btn">İzin Ver</button>
            <button id="notif-dismiss-btn" title="Kapat">✕</button>
        `;
        banner.style.cssText = `
            position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
            background: #333; color: #fff; padding: 12px 16px;
            border-radius: 12px; display: flex; align-items: center; gap: 10px;
            font-family: Nunito, sans-serif; font-size: 14px; font-weight: 600;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 9999;
            max-width: 92vw; animation: slideUp 0.3s ease;
        `;

        document.getElementById('notif-allow-btn').addEventListener?.call;
        document.body.appendChild(banner);

        document.getElementById('notif-allow-btn').addEventListener('click', async () => {
            const result = await Notification.requestPermission();
            banner.remove();
            if (result === 'granted') {
                showToast('✅ Bildirim izni verildi!');
            }
        });

        document.getElementById('notif-dismiss-btn').addEventListener('click', () => {
            banner.remove();
        });
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #4CAF50; color: #fff; padding: 10px 20px;
        border-radius: 10px; font-family: Nunito, sans-serif; font-size: 14px;
        font-weight: 700; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// HELPERS: NOTIFICATION → SW
// ============================================================
function getActiveSW() {
    if (!swRegistration) return null;
    return swRegistration.active || swRegistration.installing || swRegistration.waiting;
}

function sendSWMessage(data) {
    const sw = getActiveSwActive();
    if (sw) sw.postMessage(data);
}

// Correct helper name
function getActiveSwActive() {
    if (!swRegistration) return null;
    return swRegistration.active || swRegistration.installing || swRegistration.waiting;
}

function triggerNotificationViaSW(presetName) {
    const sw = getActiveSwActive();
    if (sw) {
        sw.postMessage({
            type: 'TRIGGER_NOTIFICATION',
            title: 'Yumurtanız Hazır! 🥚',
            presetName: presetName || currentPresetName
        });
    } else {
        // Fallback: direct Notification API
        sendDirectNotification();
    }
}

function closeNotificationViaSW() {
    const sw = getActiveSwActive();
    if (sw) sw.postMessage({ type: 'CLOSE_NOTIFICATION' });
}

function sendDirectNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
        const body = currentPresetName
            ? `${currentPresetName} yumurtası pişti. Afiyet olsun!`
            : 'Afiyet olsun! Yumurtanız pişti.';
        new Notification('Yumurtanız Hazır! 🥚', {
            body,
            icon: 'assets/5min.png',
            badge: 'assets/5min.png',
            tag: 'egg-timer-alarm',
            renotify: true,
            requireInteraction: true
        });
    }
}

// ============================================================
// HELPERS: TIME & DISPLAY
// ============================================================
function formatTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function updateDisplay() {
    const remaining = getRemainingSeconds();
    timerDisplay.textContent = formatTime(remaining);
    document.title = `${formatTime(remaining)} - Yumurta Zamanlayıcı`;
}

function getRemainingSeconds() {
    if (!endTime) return 0;
    return Math.max(0, (endTime - Date.now()) / 1000);
}

// ============================================================
// PERSISTENCE – kaydet / yükle (sayfa yenilense kalsın)
// ============================================================
function saveState() {
    if (endTime && isRunning) {
        localStorage.setItem('eggTimerEndTime', endTime.toString());
        localStorage.setItem('eggTimerPreset', currentPresetName);
    } else {
        localStorage.removeItem('eggTimerEndTime');
        localStorage.removeItem('eggTimerPreset');
    }
}

function loadState() {
    const saved = localStorage.getItem('eggTimerEndTime');
    if (!saved) return;

    const savedEnd = parseInt(saved, 10);
    currentPresetName = localStorage.getItem('eggTimerPreset') || '';

    if (savedEnd > Date.now()) {
        // Timer still running → resume
        endTime = savedEnd;
        startTimer(true);
    } else {
        // Timer expired while page was closed → fire alarm now
        localStorage.removeItem('eggTimerEndTime');
        localStorage.removeItem('eggTimerPreset');
        endTime = savedEnd;
        timerFinished();
    }
}

// ============================================================
// HAPTIC
// ============================================================
function triggerHaptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function startVibrationLoop() {
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    vibrationInterval = setInterval(() => {
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    }, 2500);
}

function stopVibrationLoop() {
    if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
}

// ============================================================
// WAKE LOCK
// ============================================================
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn('Wake lock:', err.name, err.message);
    }
}

async function releaseWakeLock() {
    if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
    }
}

// ============================================================
// AUDIO UNLOCK (user gesture required for autoplay)
// ============================================================
function unlockAudio() {
    alarmSound.play()
        .then(() => { alarmSound.pause(); alarmSound.currentTime = 0; })
        .catch(e => console.log('Audio unlock:', e));
}

// ============================================================
// TIMER CORE  (Date.now-based — immune to throttling)
// ============================================================
function startTimer(isResume = false) {
    if (isRunning) return;
    if (!isResume && (!endTime || endTime <= Date.now())) return;

    isRunning = true;
    isAlarmActive = false;
    requestWakeLock();

    // UI
    pauseBtn.style.display = 'flex';
    pauseBtn.innerHTML = '⏸️ Duraklat';
    pauseBtn.classList.remove('primary');
    pauseBtn.classList.add('secondary');
    document.querySelector('.timer-glow').style.animationDuration = '1s';

    saveState();

    // ── Exact JS timeout for alarm firing ──────────────────
    // This fires even if the page is throttled slightly,
    // and triggers the SW notification immediately.
    scheduleAlarmTimeout();

    // ── Display refresh loop ────────────────────────────────
    intervalId = setInterval(() => {
        const remaining = getRemainingSeconds();
        updateDisplay();
        if (remaining <= 0) {
            clearInterval(intervalId);
            intervalId = null;
            if (!isAlarmActive) timerFinished();
        }
    }, 500);
}

function scheduleAlarmTimeout() {
    clearAlarmTimeout();
    const delay = endTime - Date.now();
    if (delay <= 0) return;

    // We use a JS page-side timeout. When the page is in background,
    // this may be clamped to 1s granularity but WILL eventually fire.
    alarmJsTimeout = setTimeout(() => {
        if (!isAlarmActive) timerFinished();
    }, delay);
}

function clearAlarmTimeout() {
    if (alarmJsTimeout) {
        clearTimeout(alarmJsTimeout);
        alarmJsTimeout = null;
    }
}

function pauseTimer() {
    if (!isRunning) return;
    clearInterval(intervalId);
    intervalId = null;
    clearAlarmTimeout();
    isRunning = false;
    releaseWakeLock();
    localStorage.removeItem('eggTimerEndTime');
    localStorage.removeItem('eggTimerPreset');

    // Snapshot remaining time for resume
    const remaining = getRemainingSeconds();
    endTime = Date.now() + remaining * 1000;

    pauseBtn.innerHTML = '▶️ Devam Et';
    pauseBtn.classList.remove('secondary');
    pauseBtn.classList.add('primary');
    document.querySelector('.timer-glow').style.animationDuration = '0s';
}

// ============================================================
// ALARM
// ============================================================
function timerFinished() {
    if (isAlarmActive) return;  // guard against double-fire
    isRunning = false;
    isAlarmActive = true;
    clearInterval(intervalId);
    intervalId = null;
    clearAlarmTimeout();
    localStorage.removeItem('eggTimerEndTime');
    localStorage.removeItem('eggTimerPreset');

    pauseBtn.style.display = 'none';
    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = '🔕 Alarmı Durdur';
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary', 'pulse-active');

    // ── Send push notification via SW ───────────────────────
    // Always fires: works both in foreground and background.
    // If Notification permission is granted, the OS shows it.
    if (Notification.permission === 'granted') {
        triggerNotificationViaSW(currentPresetName);
    } else if (Notification.permission === 'default') {
        // Ask now and show if granted
        Notification.requestPermission().then(result => {
            if (result === 'granted') triggerNotificationViaSW(currentPresetName);
        });
    }

    // ── Play alarm sound (loop) ─────────────────────────────
    alarmSound.loop = true;
    alarmSound.play()
        .then(() => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'Yumurtanız Hazır!',
                    artist: currentPresetName ? `${currentPresetName} - Afiyet Olsun 🥚` : 'Afiyet Olsun 🥚',
                    artwork: [
                        { src: 'assets/5min.png', sizes: '96x96', type: 'image/png' },
                        { src: 'assets/5min.png', sizes: '128x128', type: 'image/png' },
                        { src: 'assets/5min.png', sizes: '256x256', type: 'image/png' }
                    ]
                });
                navigator.mediaSession.setActionHandler('stop', () => stopAlarm());
                navigator.mediaSession.setActionHandler('pause', () => stopAlarm());
                navigator.mediaSession.playbackState = 'playing';
            }
        })
        .catch(e => console.log('Alarm play error:', e));

    startVibrationLoop();

    // Visual
    document.body.style.backgroundColor = '#FFF9C4';
    timerDisplay.textContent = 'Hazır!';
    timerDisplay.style.color = '#F44336';
    document.title = '🔔 Hazır! - Yumurta Zamanlayıcı';
}

function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    alarmSound.loop = false;
    isAlarmActive = false;

    stopVibrationLoop();
    releaseWakeLock();
    closeNotificationViaSW();

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
    }

    endTime = null;
    updateDisplay();

    document.body.style.backgroundColor = '';
    timerDisplay.style.color = '';
    document.title = 'Yumurta Zamanlayıcı';

    resetBtn.innerHTML = '🔄 Sıfırla';
    resetBtn.classList.remove('primary', 'pulse-active');
    resetBtn.classList.add('danger');

    presetBtns.forEach(b => b.classList.remove('active'));
    currentPresetName = '';
}

// ============================================================
// CONTROLS
// ============================================================
pauseBtn.addEventListener('click', () => {
    triggerHaptic(50);
    if (isRunning) pauseTimer();
    else startTimer();
});

resetBtn.addEventListener('click', () => {
    triggerHaptic(50);

    if (isAlarmActive || alarmSound.loop || !alarmSound.paused || vibrationInterval) {
        stopAlarm();
        return;
    }

    if (isRunning) {
        if (!confirm('Sayacı sıfırlamak istiyor musunuz?')) return;
    }

    clearInterval(intervalId);
    intervalId = null;
    clearAlarmTimeout();
    isRunning = false;
    isAlarmActive = false;
    endTime = null;
    releaseWakeLock();
    stopVibrationLoop();
    closeNotificationViaSW();
    localStorage.removeItem('eggTimerEndTime');
    localStorage.removeItem('eggTimerPreset');

    updateDisplay();
    pauseBtn.style.display = 'none';
    document.querySelector('.timer-glow').style.animationDuration = '0s';
    presetBtns.forEach(b => b.classList.remove('active'));
    document.title = 'Yumurta Zamanlayıcı';
    document.body.style.backgroundColor = '';
    currentPresetName = '';
});

// ============================================================
// PRESET SELECTION
// ============================================================
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        clearInterval(intervalId);
        intervalId = null;
        clearAlarmTimeout();
        isRunning = false;

        if (isAlarmActive || alarmSound.loop || !alarmSound.paused || vibrationInterval) {
            stopAlarm();
        }

        triggerHaptic(70);
        unlockAudio();

        // Request notification permission here (user gesture context)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(result => {
                if (result === 'denied') {
                    showToast('⚠️ Bildirim izni reddedildi. Alarm sadece uygulama açıkken çalışır.');
                } else if (result === 'granted') {
                    showToast('✅ Bildirim izni verildi!');
                }
            });
        }

        currentPresetName = btn.querySelector('.preset-name')?.textContent || '';
        const min = parseInt(btn.dataset.time, 10);
        endTime = Date.now() + min * 60 * 1000;

        updateDisplay();
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        startTimer();
    });
});

// ============================================================
// VISIBILITY CHANGE – re-sync when screen turns back on
// ============================================================
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (isRunning) {
            if (getRemainingSeconds() <= 0) {
                clearInterval(intervalId);
                intervalId = null;
                if (!isAlarmActive) timerFinished();
            } else {
                updateDisplay();
                // Re-schedule the JS alarm timeout (page-side)
                scheduleAlarmTimeout();
            }
        }

        // Re-acquire wake lock if the OS released it
        if (isRunning && !wakeLock) requestWakeLock();
    }
});

// ============================================================
// INIT
// ============================================================
pauseBtn.style.display = 'none';
updateDisplay();

// Add keyframes for banner/toast animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
    }
    #notif-banner button {
        background: #FFC107; color: #333; border: none;
        padding: 6px 14px; border-radius: 8px;
        font-family: Nunito, sans-serif; font-size: 13px;
        font-weight: 700; cursor: pointer;
    }
    #notif-dismiss-btn {
        background: transparent !important; color: #aaa !important;
        padding: 4px 8px !important;
    }
`;
document.head.appendChild(style);

loadState(); // restore timer if page was refreshed while running
