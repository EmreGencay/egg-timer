// sw.js - Service Worker for Egg Timer
// Cache version – bump this when you deploy new assets
const CACHE_NAME = 'egg-timer-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './assets/alarm.ogg',
    './assets/5min.png',
    './assets/6min.png',
    './assets/8min.png',
    './assets/10min.png'
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request))
    );
});

// ── ALARM SCHEDULING ────────────────────────────────────────
// NOTE: SW setTimeout is unreliable when SW is put to sleep.
// The reliable pattern: page sends TRIGGER_NOTIFICATION message 
// exactly when the timer fires (handled in script.js).
// SW only shows the notification & handles notification clicks.

self.addEventListener('message', (event) => {
    const { type } = event.data;

    // Page says "fire the alarm notification now"
    if (type === 'TRIGGER_NOTIFICATION') {
        const { title, presetName } = event.data;
        showAlarmNotification(title, presetName);
    }

    // Page says "close any pending alarm notification"
    if (type === 'CLOSE_NOTIFICATION') {
        self.registration.getNotifications({ tag: 'egg-timer-alarm' })
            .then(notifications => notifications.forEach(n => n.close()));
    }
});

// ── SHOW NOTIFICATION ───────────────────────────────────────
function showAlarmNotification(title = 'Yumurtanız Hazır! 🥚', presetName = '') {
    const body = presetName
        ? `${presetName} yumurtası pişti. Afiyet olsun!`
        : 'Afiyet olsun! Yumurtanız pişti.';

    // Use absolute URL so the icon always resolves correctly from SW scope
    const iconUrl = self.registration.scope + 'assets/5min.png';
    const badgeUrl = self.registration.scope + 'assets/5min.png';

    return self.registration.showNotification(title, {
        body,
        icon: iconUrl,
        badge: badgeUrl,
        tag: 'egg-timer-alarm',
        renotify: true,
        requireInteraction: true,          // stays visible until dismissed
        silent: false,
        vibrate: [500, 200, 500, 200, 500, 200, 500],
        data: { url: self.registration.scope },
        actions: [
            { action: 'stop', title: '🔕 Alarmı Durdur' },
            { action: 'open', title: '🥚 Uygulamayı Aç' }
        ]
    });
}

// ── NOTIFICATION CLICK ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const appUrl = event.notification.data?.url || self.registration.scope;

    if (event.action === 'stop') {
        // Tell any open clients to stop the alarm sound
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(clients => {
                    clients.forEach(c => c.postMessage({ type: 'STOP_ALARM' }));
                    // Focus the first open tab
                    if (clients.length > 0) clients[0].focus();
                })
        );
    } else {
        // 'open' action or tapping the body – open / focus the app
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(clients => {
                    const existingClient = clients.find(c => c.url.startsWith(appUrl));
                    if (existingClient) {
                        existingClient.focus();
                        existingClient.postMessage({ type: 'ALARM_TRIGGERED' });
                    } else {
                        self.clients.openWindow(appUrl);
                    }
                })
        );
    }
});

// ── NOTIFICATION CLOSE (dismissed by user) ──────────────────
self.addEventListener('notificationclose', (event) => {
    // Notify page so it can stop the alarm sound if still playing
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => clients.forEach(c => c.postMessage({ type: 'STOP_ALARM' })));
});
