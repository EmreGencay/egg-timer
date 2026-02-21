// ============================================================
// ELEMENT REFERENCES
// ============================================================
const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');

// ============================================================
// ALARM SOUND – prefer local OGG, fallback to HTML element src
// ============================================================
const alarmSound = new Audio('assets/alarm.ogg');
alarmSound.id = 'alarm-sound';
if (document.getElementById('alarm-sound')) {
    document.getElementById('alarm-sound').src = 'assets/alarm.ogg';
}

// ============================================================
// STATE
// ============================================================
let endTime = null;   // timestamp (ms) when the timer expires
let intervalId = null;
let isRunning = false;
let isAlarmActive = false;
let wakeLock = null;
let vibrationInterval = null;
let swRegistration = null;

const presetBtns = document.querySelectorAll('.preset-card');

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        swRegistration = reg;
        console.log('SW registered:', reg.scope);
    }).catch(err => console.warn('SW registration failed:', err));

    // Listen for messages FROM the service worker (alarm trigger / stop)
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'ALARM_TRIGGERED') {
            // SW fired the alarm (background case)
            if (!isAlarmActive) timerFinished();
        }
        if (event.data.type === 'STOP_ALARM') {
            stopAlarm();
        }
    });
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
    } else {
        localStorage.removeItem('eggTimerEndTime');
    }
}

function loadState() {
    const saved = localStorage.getItem('eggTimerEndTime');
    if (saved) {
        const savedEnd = parseInt(saved, 10);
        if (savedEnd > Date.now()) {
            // Timer was running and hasn't expired yet – restore
            endTime = savedEnd;
            startTimer(/* resume */ true);
            return;
        } else if (savedEnd <= Date.now()) {
            // Timer expired while page was closed – fire alarm immediately
            localStorage.removeItem('eggTimerEndTime');
            endTime = savedEnd;
            timerFinished();
            return;
        }
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
            console.log('Wake lock acquired');
        }
    } catch (err) {
        console.warn('Wake lock error:', err.name, err.message);
    }
}

async function releaseWakeLock() {
    if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
    }
}

// ============================================================
// AUDIO UNLOCK
// ============================================================
function unlockAudioAndNotify() {
    alarmSound.play().then(() => {
        alarmSound.pause();
        alarmSound.currentTime = 0;
    }).catch(e => console.log('Audio unlock failed', e));

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
    }
}

// ============================================================
// SERVICE WORKER: alarm scheduling
// ============================================================
function scheduleAlarmInSW() {
    if (!swRegistration || !swRegistration.active) return;
    swRegistration.active.postMessage({ type: 'START_ALARM', endTime });
}

function cancelAlarmInSW() {
    if (!swRegistration || !swRegistration.active) return;
    swRegistration.active.postMessage({ type: 'CANCEL_ALARM' });
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

    // Schedule alarm in Service Worker (works even when page is throttled)
    scheduleAlarmInSW();

    // Save so we survive page refresh
    saveState();

    // Tick loop – compares against real wall clock, so throttling doesn't matter
    intervalId = setInterval(() => {
        const remaining = getRemainingSeconds();
        updateDisplay();

        if (remaining <= 0) {
            clearInterval(intervalId);
            intervalId = null;
            timerFinished();
        }
    }, 500); // poll every 500ms – still works even if throttled to 1s
}

function pauseTimer() {
    if (!isRunning) return;
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
    releaseWakeLock();
    cancelAlarmInSW();
    localStorage.removeItem('eggTimerEndTime');

    // Snapshot remaining time so we can resume from here
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
    isRunning = false;
    isAlarmActive = true;
    clearInterval(intervalId);
    intervalId = null;
    localStorage.removeItem('eggTimerEndTime');

    pauseBtn.style.display = 'none';
    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = '🔕 Alarmı Durdur';
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary', 'pulse-active');

    // Play sound (loop)
    alarmSound.loop = true;
    alarmSound.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Yumurtanız Hazır!',
                artist: 'Afiyet Olsun 🥚',
                artwork: [
                    { src: 'assets/5min.png', sizes: '96x96', type: 'image/png' },
                    { src: 'assets/5min.png', sizes: '128x128', type: 'image/png' }
                ]
            });
            navigator.mediaSession.setActionHandler('stop', () => stopAlarm());
            navigator.mediaSession.setActionHandler('pause', () => stopAlarm());
            navigator.mediaSession.playbackState = 'playing';
        }
    }).catch(e => {
        console.log('Alarm play error:', e);
        // Couldn't auto-play → send notification as fallback
        sendNotification('Yumurtanız Hazır! 🥚', 'Alarm çalınamadı, lütfen kontrol edin.');
    });

    startVibrationLoop();

    // Visual
    document.body.style.backgroundColor = '#FFF9C4';
    timerDisplay.textContent = 'Hazır!';
    timerDisplay.style.color = '#F44336';
    document.title = '🔔 Hazır! - Yumurta Zamanlayıcı';

    // System notification
    sendNotification('Yumurtanız Hazır! 🥚', 'Afiyet olsun! Yumurtanız pişti.');
}

function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    alarmSound.loop = false;
    isAlarmActive = false;

    stopVibrationLoop();
    releaseWakeLock();
    cancelAlarmInSW();

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
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
}

// ============================================================
// CONTROLS
// ============================================================
pauseBtn.addEventListener('click', () => {
    triggerHaptic(50);
    if (isRunning) {
        pauseTimer();
    } else {
        // Resume: endTime is already set from when we paused
        startTimer();
    }
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
    isRunning = false;
    isAlarmActive = false;
    endTime = null;
    releaseWakeLock();
    stopVibrationLoop();
    cancelAlarmInSW();
    localStorage.removeItem('eggTimerEndTime');

    updateDisplay();

    pauseBtn.style.display = 'none';
    document.querySelector('.timer-glow').style.animationDuration = '0s';
    presetBtns.forEach(b => b.classList.remove('active'));

    document.title = 'Yumurta Zamanlayıcı';
    document.body.style.backgroundColor = '';
});

// ============================================================
// PRESET SELECTION
// ============================================================
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        clearInterval(intervalId);
        intervalId = null;
        isRunning = false;

        if (isAlarmActive || alarmSound.loop || !alarmSound.paused || vibrationInterval) {
            stopAlarm();
        }

        triggerHaptic(70);
        unlockAudioAndNotify();

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
            // Check if it expired while we were in background
            if (getRemainingSeconds() <= 0) {
                clearInterval(intervalId);
                intervalId = null;
                timerFinished();
            } else {
                // Just update the display immediately so the jump is invisible
                updateDisplay();
            }
        }

        // Re-acquire wake lock if it was released by the OS
        if (isRunning && !wakeLock) {
            requestWakeLock();
        }
    }
});

// ============================================================
// NOTIFICATION HELPER
// ============================================================
function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: 'assets/5min.png',
            tag: 'egg-timer-alarm',
            renotify: true
        });
    }
}

// ============================================================
// INIT
// ============================================================
pauseBtn.style.display = 'none';
updateDisplay();
loadState(); // restore timer if page was refreshed while running
