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
    // Sade tasarımda "Devam Et" butonu koymadık, kullanıcı karta tekrar basarsa baştan başlar veya resetler.
    // Ancak mantıklı olan: Duraklatınca "Başlat" butonu çıkması gerekirdi ama kaldırdık.
    // Bu durumda "Duraklat" yerine "İptal/Sıfırla" gibi çalışabilir ya da 
    // Kullanıcı duraklatırsa geri sayım durur. Devam etmesi için belki karta tekrar tıklatabiliriz? 
    // Ama karta tıklayınca süre sıfırlanıyor.
    // Kullanıcı isteğinde "Başlat butonu kaldırıldı" dendi. 
    // Duraklat özelliği istenmedi ama kodda bıraktım. Eğer duraklatırsa devam ettirecek bir buton yok şu an.
    // O yüzden pauseBtn metnini "Devam Et" yapıp click eventi değiştirebiliriz.

    pauseBtn.style.display = 'flex';
    pauseBtn.innerHTML = "▶️ Devam Et";
    pauseBtn.classList.remove('secondary');
    pauseBtn.classList.add('primary');

    // Event listener'ı değiştirmek yerine durumu kontrol edelim.
    // Aşağıda pauseBtn click handler'ını güncelleyeceğim.

    triggerHaptic(50); // Kısa titreşim

    document.querySelector('.timer-glow').style.animationDuration = "2s"; // Yavaşlat
}

// Pause/Resume Toggle
pauseBtn.addEventListener('click', () => {
    triggerHaptic(50);
    if (isRunning) {
        // Durdur
        clearInterval(intervalId);
        isRunning = false;
        pauseBtn.innerHTML = "▶️ Devam Et";
        pauseBtn.classList.remove('secondary');
        pauseBtn.classList.add('primary');
        document.querySelector('.timer-glow').style.animationDuration = "0s";
    } else {
        // Devam Et
        startTimer();
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

    // Çalışıyorsa sor, değilse direkt sıfırla
    const isConfirm = isRunning ? confirm("İşlemi iptal etmek istiyor musunuz?") : true;

    if (isConfirm) {
        clearInterval(intervalId);
        isRunning = false;
        timeLeft = 0; // Sıfırla
        updateDisplay();

        pauseBtn.style.display = 'none';
        pauseBtn.innerHTML = "⏸️ Duraklat";
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');

        document.body.style.backgroundColor = "";
        document.title = "Yumurta Zamanlayıcı";

        // Kart seçimlerini kaldır
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

    pauseBtn.style.display = 'none';
    resetBtn.innerHTML = "🔄 Sıfırla";
    resetBtn.classList.remove('primary'); // Varsayılan renge dön
    resetBtn.classList.add('danger');
    resetBtn.classList.remove('pulse-active'); // Pulse kaldır

    presetBtns.forEach(b => b.classList.remove('active'));
    triggerHaptic(50);
}

// Süre bittiğinde
function timerFinished() {
    isRunning = false;
    pauseBtn.style.display = 'none';

    resetBtn.style.display = 'flex';
    resetBtn.innerHTML = "🔕 Alarmı Durdur";
    resetBtn.classList.remove('danger');
    resetBtn.classList.add('primary');
    resetBtn.classList.add('pulse-active'); // Pulse ekle

    alarmSound.loop = true;
    alarmSound.play().catch(e => console.log("Otomatik oynatma hatası:", e));
    sendNotification("Yumurtanız Hazır!", "Afiyet olsun! 🥚");

    // Uzun titreşim (zzzz - zzzz - zzzz)
    triggerHaptic([500, 200, 500, 200, 500]);

    document.body.style.backgroundColor = "#FFF9C4";
    timerDisplay.textContent = "Hazır!";
    timerDisplay.style.color = "#F44336";
    document.title = "🔔 Hazır! - Yumurta Zamanlayıcı";
}

// Hazır süre butonları (Karta tıklayınca direkt başlar)
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Önce durdur ve sıfırla
        clearInterval(intervalId);
        isRunning = false;
        stopAlarm(); // Alarm çalıyorsa sustur

        // Seçim titreşimi
        triggerHaptic(70);

        const min = parseInt(btn.dataset.time);
        timeLeft = min * 60;
        initialTime = timeLeft;
        updateDisplay();

        // Aktif yap
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // OTO BAŞLAT
        startTimer();

        // Buton görünümü düzelt (Eğer duraklat modunda kaldıysa)
        pauseBtn.innerHTML = "⏸️ Duraklat";
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');
    });
});

resetBtn.addEventListener('click', resetTimer);

pauseBtn.style.display = 'none';
updateDisplay();
