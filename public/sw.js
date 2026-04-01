// Self-destructing Service Worker
// 这个脚本的目标是替换掉旧版画廊残留的 PWA Service Worker 缓存，迫使浏览器放弃拉取过期的旧版文件。

self.addEventListener('install', function(e) {
  self.skipWaiting(); // 强制跳过等待，立刻接管当前页面
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // 清空浏览器在这个域名下的所有静态缓存
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      // 核心大招：立刻注销当前 Service Worker 进程自己
      self.registration.unregister();
      return self.clients.claim();
    })
  );
});
