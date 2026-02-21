// sw.js - Service Worker for Egg Timer
const CACHE_NAME = 'egg-timer-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './assets/alarm.ogg'
];

// Install: Cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: Serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});

// Message: Alarm scheduling via setTimeout in SW scope
let alarmTimeout = null;

self.addEventListener('message', (event) => {
    const { type, endTime } = event.data;

    if (type === 'START_ALARM') {
        // Clear any existing alarm
        if (alarmTimeout) {
            clearTimeout(alarmTimeout);
            alarmTimeout = null;
        }

        const delay = endTime - Date.now();
        if (delay <= 0) {
            // Already expired
            triggerAlarmNotification();
            return;
        }

        alarmTimeout = setTimeout(() => {
            triggerAlarmNotification();
        }, delay);
    }

    if (type === 'CANCEL_ALARM') {
        if (alarmTimeout) {
            clearTimeout(alarmTimeout);
            alarmTimeout = null;
        }
    }
});

function triggerAlarmNotification() {
    // Notify all open clients
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: 'ALARM_TRIGGERED' });
        });
    });

    // Show push notification if page is in background
    self.registration.showNotification('Yumurtanız Hazır! 🥚', {
        body: 'Afiyet olsun! Yumurtanız pişti.',
        icon: 'assets/5min.png',
        badge: 'assets/5min.png',
        tag: 'egg-timer-alarm',
        renotify: true,
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 500],
        actions: [
            { action: 'stop', title: '🔕 Alarmı Durdur' }
        ]
    });
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'stop') {
        // Send message to page to stop alarm
        self.clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'STOP_ALARM' }));
            if (clients.length > 0) {
                clients[0].focus();
            }
        });
    } else {
        // Open the app
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then(clients => {
                if (clients.length > 0) {
                    clients[0].focus();
                } else {
                    self.clients.openWindow('./');
                }
            })
        );
    }
});
