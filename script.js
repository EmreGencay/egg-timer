const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const alarmSound = document.getElementById('alarm-sound');
const presetBtns = document.querySelectorAll('.preset-card');

let timeLeft = 0;
let initialTime = 0;
let intervalId = null;
let isRunning = false;
let wakeLock = null;

// Notification İzni İste
if ("Notification" in window) {
    Notification.requestPermission();
}

// Zamanı formatla (MM:SS)
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timerDisplay.textContent = formatTime(timeLeft);
    document.title = `${formatTime(timeLeft)} - Yumurta Zamanlayıcı`;
}

// Haptic Feedback
function triggerHaptic(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// Wake Lock (Ekran Açık Tutma)
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }
}

// Ses Kilidini Aç
function unlockAudio() {
    alarmSound.play().then(() => {
        alarmSound.pause();
        alarmSound.currentTime = 0;
    }).catch(e => console.log("Audio unlock failed", e));
}

// Sayacı Başlat
function startTimer() {
    if (timeLeft <= 0) return;
    if (isRunning) return;

    isRunning = true;
    requestWakeLock();

    // UI Güncelleme
    pauseBtn.style.display = 'flex';
    pauseBtn.innerHTML = "⏸️ Duraklat";
    pauseBtn.classList.remove('primary');
    pauseBtn.classList.add('secondary');

    document.querySelector('.timer-glow').style.animationDuration = "1s";

    intervalId = setInterval(() => {
        timeLeft--;
        updateDisplay();

        if (timeLeft <= 0) {
            clearInterval(intervalId);
            timerFinished();
        }
    }, 1000);
}

// Sayacı Duraklat
function pauseTimer() {
    clearInterval(intervalId);
    isRunning = false;
    releaseWakeLock();

    // UI Güncelleme
    pauseBtn.innerHTML = "▶️ Devam Et";
    pauseBtn.classList.remove('secondary');
    pauseBtn.classList.add('primary');

    document.querySelector('.timer-glow').style.animationDuration = "0s";
}

// Duraklat/Devam Et Butonu
pauseBtn.addEventListener('click', () => {
    triggerHaptic(50);
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

// Sıfırla
resetBtn.addEventListener('click', () => {
    triggerHaptic(50);

    // Eğer alarm çalıyorsa, sadece alarmı durdur ve sıfırla
    if (alarmSound.loop || !alarmSound.paused) {
        stopAlarm();
        return;
    }

    // Sayaç çalışıyorsa onay iste
    if (isRunning) {
        if (!confirm("Sayacı sıfırlamak istiyor musunuz?")) return;
    }

    // Her şeyi sıfırla
    clearInterval(intervalId);
    isRunning = false;
    releaseWakeLock();
    timeLeft = 0;
    updateDisplay();

    pauseBtn.style.display = 'none';
    document.querySelector('.timer-glow').style.animationDuration = "0s";
    presetBtns.forEach(b => b.classList.remove('active'));

    document.title = "Yumurta Zamanlayıcı";
    document.body.style.backgroundColor = "";
});

// Süre Bittiğinde
function timerFinished() {
    isRunning = false;
    // releaseWakeLock(); // Alarm çalarken ekran açık kalsın

    pauseBtn.style.display = 'none';

    // Butonu "Alarmı Durdur" yap
    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = "🔕 Alarmı Durdur";
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary');
    resetBtn.classList.add('pulse-active');

    // Alarmı Çal
    alarmSound.loop = true;
    alarmSound.play().catch(e => console.log("Alarm play error", e));

    triggerHaptic([500, 200, 500, 200, 500]);

    // Görsel Uyarı
    document.body.style.backgroundColor = "#FFF9C4";
    timerDisplay.textContent = "Hazır!";
    timerDisplay.style.color = "#F44336";
    document.title = "🔔 Hazır! - Yumurta Zamanlayıcı";

    if (Notification.permission === "granted") {
        new Notification("Yumurtanız Hazır!", {
            body: "Afiyet olsun! 🥚",
            icon: 'assets/5min.png'
        });
    }
}

// Alarmı Durdur ve Normale Dön
function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    alarmSound.loop = false;

    releaseWakeLock();

    timeLeft = 0;
    updateDisplay();

    // UI Normale Dön
    document.body.style.backgroundColor = "";
    timerDisplay.style.color = "";
    document.title = "Yumurta Zamanlayıcı";

    resetBtn.innerHTML = "🔄 Sıfırla";
    resetBtn.classList.remove('primary');
    resetBtn.classList.add('danger');
    resetBtn.classList.remove('pulse-active');

    presetBtns.forEach(b => b.classList.remove('active'));
}

// Yumurta Seçimi (Preset Buttons)
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Önceki işlemi temizle
        clearInterval(intervalId);
        isRunning = false;
        stopAlarm(); // Eğer alarm çalıyorsa durdur

        triggerHaptic(70);
        unlockAudio(); // Ses kilidini aç

        // Süreyi Ayarla
        const min = parseInt(btn.dataset.time);
        timeLeft = min * 60;
        initialTime = timeLeft;
        updateDisplay();

        // Aktif Butonu İşaretle
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Otomatik Başlat
        startTimer();
    });
});

// Başlangıç Ayarları
pauseBtn.style.display = 'none';
updateDisplay();
