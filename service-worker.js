/**
 * Service Worker - PWA 离线缓存
 */

const CACHE_NAME = 'diary-app-v1';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/db.js',
    './js/calendar.js',
    './js/image-utils.js',
    './js/app.js',
    './manifest.json'
];

// 安装时缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .catch(function(error) {
                console.error('Cache failed:', error);
            })
    );
    // 立即激活新的 service worker
    self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) {
                        return name !== CACHE_NAME;
                    })
                    .map(function(name) {
                        console.log('Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // 立即接管所有页面
    self.clients.claim();
});

// 拦截网络请求，优先使用缓存
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // 缓存命中，直接返回
                if (response) {
                    return response;
                }

                // 未命中，发起网络请求
                return fetch(event.request)
                    .then(function(response) {
                        // 检查是否是有效响应
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // 克隆响应（响应只能使用一次）
                        var responseToCache = response.clone();

                        // 添加到缓存
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(function() {
                        // 网络请求失败，尝试返回离线页面
                        console.log('Fetch failed, serving cached or offline');
                    });
            })
    );
});

// 处理后台同步（用于备份提醒）
self.addEventListener('sync', function(event) {
    if (event.tag === 'backup-reminder') {
        event.waitUntil(showBackupNotification());
    }
});

// 显示备份提醒通知
async function showBackupNotification() {
    try {
        await self.registration.showNotification('日记备份提醒', {
            body: '您已经很久没有备份日记数据了，点击立即备份',
            icon: './icon-192x192.png',
            badge: './icon-72x72.png',
            tag: 'backup-reminder',
            requireInteraction: true,
            actions: [
                {
                    action: 'backup',
                    title: '立即备份'
                },
                {
                    action: 'dismiss',
                    title: '稍后再说'
                }
            ]
        });
    } catch (error) {
        console.error('Notification failed:', error);
    }
}

// 处理通知点击
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'backup' || event.action === '') {
        event.waitUntil(
            clients.openWindow('./?action=backup')
        );
    }
});
