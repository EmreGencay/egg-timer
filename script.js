const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
// Ses dosyasını assets/alarm.ogg olarak değiştirdik
const alarmSound = new Audio('assets/alarm.ogg');
alarmSound.id = 'alarm-sound';
// HTML'deki audio element yerine bunu kullanacağız veya HTML'i güncelleyeceğiz ama JS'den yönetmek daha temiz.
// Mevcut HTML'deki alarm-sound elementini de kullanabiliriz ama src değişti.
if (document.getElementById('alarm-sound')) {
    document.getElementById('alarm-sound').src = 'assets/alarm.ogg';
}

const presetBtns = document.querySelectorAll('.preset-card');

let timeLeft = 0;
let initialTime = 0;
let intervalId = null;
let isRunning = false;
let wakeLock = null;
let vibrationInterval = null;

// Notification İzni (Gerekirse)
// Butona tıklanınca istenecek

// Zamanı formatla (MM:SS)
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Ekranı güncelle
function updateDisplay() {
    timerDisplay.textContent = formatTime(timeLeft);
    document.title = `${formatTime(timeLeft)} - Yumurta Zamanlayıcı`;
}

// Haptic Feedback (Titreşim) - Tek Seferlik
function triggerHaptic(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// Sürekli Titreşim Başlat
function startVibrationLoop() {
    // İlk titreşim
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);

    // Döngü
    vibrationInterval = setInterval(() => {
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 500]);
        }
    }, 2500); // Titreşim süresi + boşluk kadar bekle
}

// Sürekli Titreşim Durdur
function stopVibrationLoop() {
    if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
    }
    if (navigator.vibrate) {
        navigator.vibrate(0); // Titreşimi hemen kes
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

// Ses ve Bildirim Kilidini Aç & Media Session Hazırla
function unlockAudioAndNotify() {
    // Ses
    alarmSound.play().then(() => {
        alarmSound.pause();
        alarmSound.currentTime = 0;
    }).catch(e => console.log("Audio unlock failed", e));

    // Bildirim İzni
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // Media Session Hazırlığı (Arka planda çalışması için)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
    }
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

        // Media Session Güncellemesi (Kilit ekranında süre görünsün diye metadata güncellenebilir ama zorunlu değil)

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

    // Eğer alarm çalıyorsa (loop veya pause değilse) veya titreşim varsa
    if (alarmSound.loop || !alarmSound.paused || vibrationInterval) {
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
    stopVibrationLoop();

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
    // Alarm çalarken ekran açık kalsın: releaseWakeLock() çağırmıyoruz.

    pauseBtn.style.display = 'none';

    // Butonu "Alarmı Durdur" yap
    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = "🔕 Alarmı Durdur";
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary');
    resetBtn.classList.add('pulse-active');

    // Alarmı Çal (LOOP)
    alarmSound.loop = true;
    alarmSound.play()
        .then(() => {
            // Media Session Metadata Ayarla (Kilit Ekranı İçin)
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'Yumurtanız Hazır!',
                    artist: 'Afiyet Olsun 🥚',
                    artwork: [
                        { src: 'assets/5min.png', sizes: '96x96', type: 'image/png' },
                        { src: 'assets/5min.png', sizes: '128x128', type: 'image/png' },
                    ]
                });

                // Kilit ekranından durdurulabilsin diye handler ekle
                navigator.mediaSession.setActionHandler('stop', function () {
                    stopAlarm();
                });
                navigator.mediaSession.setActionHandler('pause', function () {
                    stopAlarm();
                });
                navigator.mediaSession.playbackState = 'playing';
            }
        })
        .catch(e => {
            console.log("Alarm play error", e);
            sendNotification("Süre Bitti!", "Alarm çalınamadı, lütfen kontrol edin.");
        });

    // Titreşim Döngüsünü Başlat
    startVibrationLoop();

    // Görsel Uyarı
    document.body.style.backgroundColor = "#FFF9C4";
    timerDisplay.textContent = "Hazır!";
    timerDisplay.style.color = "#F44336";
    document.title = "🔔 Hazır! - Yumurta Zamanlayıcı";

    if (Notification.permission === "granted") {
        new Notification("Yumurtanız Hazır!", {
            body: "Afiyet olsun! 🥚",
            icon: 'assets/5min.png',
            tag: 'egg-timer-alarm', // Yeni bildirim eskini silsin
            renotify: true
        });
    }
}

// Alarmı Durdur ve Normale Dön
function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    alarmSound.loop = false;

    stopVibrationLoop();
    releaseWakeLock();

    // Media Session Durdur
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
    }

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

        // Eğer alarm çalıyorsa durdur
        if (alarmSound.loop || !alarmSound.paused || vibrationInterval) {
            stopAlarm();
        }

        triggerHaptic(70);
        unlockAudioAndNotify(); // Ses ve bildirim

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

// Push Bildirimi Gönder (Yedek fonksiyon, gerekirse)
function sendNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: 'assets/5min.png'
        });
    }
}

// Başlangıç Ayarları
pauseBtn.style.display = 'none';
updateDisplay();
