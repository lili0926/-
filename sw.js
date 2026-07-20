// sw.js — Service Worker

const CACHE_NAME = "aries-home-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/aries-init.js",
  "/style.css",
  "/style-aries.css",
];

// 安装时预缓存核心文件
self.addEventListener("install", (e) => {
  console.log("[SW] 安装完成 v2");
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 静默缓存，不阻塞
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// 激活时清除旧缓存
self.addEventListener("activate", (e) => {
  console.log("[SW] 激活完成 v2");
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  e.waitUntil(self.clients.claim());
});

// 接收推送消息
self.addEventListener("push", (e) => {
  let data = { title: "Aries", body: "我刚刚突然想找你。" };
  try {
    data = e.data.json();
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || "Aries", {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "aries-push",
      renotify: true,
      vibrate: [200, 100, 200],
    })
  );
});

// 点击通知跳转
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

// fetch — network-first，确保每次都拿最新，离线时走缓存
self.addEventListener("fetch", (e) => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 更新缓存
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || fetch(e.request)))
  );
});
