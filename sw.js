// Service Worker for Dish Duty PWA
const CACHE_NAME = 'dish-duty-v10';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests, chrome extensions, etc.
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // Skip Supabase API requests - let them go directly to network
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        // Clone and cache the response
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    });
            })
    );
});

// Handle messages from main app
self.addEventListener('message', (event) => {
    if (event.data.type === 'SCHEDULE_NOTIFICATION') {
        scheduleNotification(event.data.time, event.data.person);
    }
});

// Schedule daily notification
let notificationTimeout = null;

function scheduleNotification(timeString, personName) {
    // Clear any existing scheduled notification
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    const [hours, minutes] = timeString.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If the time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();

    notificationTimeout = setTimeout(() => {
        showNotification(personName);
        // Reschedule for next day
        scheduleNotification(timeString, personName);
    }, delay);

    console.log(`Notification scheduled for ${scheduledTime.toLocaleString()}`);
}

function showNotification(personName) {
    self.registration.showNotification('🍽️ Dish Duty Reminder', {
        body: `It's ${personName}'s turn to wash the dishes!`,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'dish-duty-daily',
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // If app is already open, focus it
                    for (const client of clientList) {
                        if (client.url.includes('/') && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // Otherwise open new window
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});

// Handle push events from server
self.addEventListener('push', (event) => {
    console.log('Push event received:', event);

    let data = {
        title: '🍽️ Dish Duty',
        body: 'Someone finished the dishes!',
        icon: '/icons/icon-192.svg'
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        tag: 'dish-duty-push',
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: data
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

