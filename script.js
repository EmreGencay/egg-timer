const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const alarmSound = document.getElementById('alarm-sound');
// Sınıf ismi değişti: .preset-card
const presetBtns = document.querySelectorAll('.preset-card');

let timeLeft = 0;
let initialTime = 0;
let intervalId = null;
let isRunning = false;

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

// Ekranı güncelle
function updateDisplay() {
    timerDisplay.textContent = formatTime(timeLeft);
    document.title = `${formatTime(timeLeft)} - Yumurta Zamanlayıcı`;
}

// Push Bildirimi Gönder
function sendNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: 'assets/5min.png'
        });
    }
}

// Haptic Feedback (Titreşim)
function triggerHaptic(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// Sayacı başlat
function startTimer() {
    if (timeLeft <= 0) return;
    if (isRunning) return;

    isRunning = true;
    pauseBtn.style.display = 'flex'; // Duraklat butonu görünür

    document.querySelector('.timer-glow').style.animationDuration = "1s"; // Hızlandır

    intervalId = setInterval(() => {
        timeLeft--;
        updateDisplay();

        if (timeLeft <= 0) {
            clearInterval(intervalId);
            timerFinished();
        }
    }, 1000);
}

// Duraklat (Bu fonksiyon doğrudan kullanılmıyor, pauseBtn event listener'ı tarafından yönetiliyor)
function pauseTimer() {
    clearInterval(intervalId);
    isRunning = false;
    pauseBtn.style.display = 'none'; // Duraklat gizle (Tekrar başlatma için karta tıklanmalı veya sadece durdurulmuş kalır)
    releaseWakeLock(); // Ekran kilidini bırak

    pauseBtn.style.display = 'flex';
    pauseBtn.innerHTML = "▶️ Devam Et";
    pauseBtn.classList.remove('secondary');
    pauseBtn.classList.add('primary');

    triggerHaptic(50);

    document.querySelector('.timer-glow').style.animationDuration = "2s";
}

// Pause/Resume Toggle
pauseBtn.addEventListener('click', () => {
    triggerHaptic(50);
    if (isRunning) {
        pauseTimer(); // Wake lock serbest bırakılır
        document.querySelector('.timer-glow').style.animationDuration = "0s";
    } else {
        startTimer(); // Wake lock istenir
        pauseBtn.innerHTML = "⏸️ Duraklat";
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');
    }
});


// Sıfırla
function resetTimer() {
    triggerHaptic(50);
    if (alarmSound.loop) {
        stopAlarm();
        return;
    }

    const isConfirm = isRunning ? confirm("İşlemi iptal etmek istiyor musunuz?") : true;

    if (isConfirm) {
        clearInterval(intervalId);
        isRunning = false;
        releaseWakeLock(); // Ekran kilidini bırak
        timeLeft = 0;
        updateDisplay();

        pauseBtn.style.display = 'none';
        pauseBtn.innerHTML = "⏸️ Duraklat";
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');

        document.body.style.backgroundColor = "";
        document.title = "Yumurta Zamanlayıcı";

        presetBtns.forEach(b => b.classList.remove('active'));
    }
}

function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    alarmSound.loop = false;
    document.body.style.backgroundColor = "";
    timerDisplay.style.color = "";
    document.title = "Yumurta Zamanlayıcı";

    timeLeft = 0;
    updateDisplay();
    releaseWakeLock(); // Emin olmak için

    pauseBtn.style.display = 'none';
    resetBtn.innerHTML = "🔄 Sıfırla";
    resetBtn.classList.remove('primary');
    resetBtn.classList.add('danger');
    resetBtn.classList.remove('pulse-active');

    presetBtns.forEach(b => b.classList.remove('active'));
    triggerHaptic(50);
}

// Süre bittiğinde
function timerFinished() {
    isRunning = false;
    // releaseWakeLock(); // Ekran kilidini bırak (artık gerek yok veya kalsa mı? Alarm çalarken ekran açık kalsın)
    // Aslında alarm çalarken ekranın açık kalması daha iyi olur, kullanıcı durdurabilsin diye.
    // O yüzden releaseWakeLock() burada çağırmayalım, stopAlarm'da çağıralım.
    // Ancak pil tassarrufu için timeout koyabiliriz ama şimdilik kalsın.
    // Düzeltme: Kullanıcı "Alarmı Durdur" diyene kadar ekran açık kalsın.

    pauseBtn.style.display = 'none';

    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = "🔕 Alarmı Durdur";
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary');
    resetBtn.classList.add('pulse-active');

    // Ses çalma (Daha güvenilir yöntem)
    const playPromise = alarmSound.play();
    if (playPromise !== undefined) {
        playPromise.then(_ => {
            // Otomatik oynatma başladı
            alarmSound.loop = true;
        })
            .catch(error => {
                // Otomatik oynatma engellendi
                console.log("Otomatik oynatma engellendi, bildirim gönderiliyor.");
                sendNotification("Süre Bitti!", "Alarm çalınamadı, lütfen kontrol edin.");
            });
    }

    sendNotification("Yumurtanız Hazır!", "Afiyet olsun! 🥚");

    triggerHaptic([500, 200, 500, 200, 500]);

    document.body.style.backgroundColor = "#FFF9C4";
    timerDisplay.textContent = "Hazır!";
    timerDisplay.style.color = "#F44336";
    document.title = "🔔 Hazır! - Yumurta Zamanlayıcı";
}

// Hazır süre butonları
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        clearInterval(intervalId);
        isRunning = false;
        stopAlarm();

        triggerHaptic(70);
        unlockAudio(); // Kullanıcı etkileşimi anında ses kilidini aç

        const min = parseInt(btn.dataset.time);
        timeLeft = min * 60;
        initialTime = timeLeft;
        updateDisplay();

        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        startTimer();

        pauseBtn.innerHTML = "⏸️ Duraklat";
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');
    });
});

resetBtn.addEventListener('click', resetTimer);

pauseBtn.style.display = 'none';
updateDisplay();
