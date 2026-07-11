// sw.js — Service Worker，放在网站根目录
// 用于支持安卓通知栏推送

const CACHE_NAME = "aries-home-v1";

// 安装
self.addEventListener("install", (e) => {
  console.log("[SW] 安装完成");
  self.skipWaiting();
});

// 激活
self.addEventListener("activate", (e) => {
  console.log("[SW] 激活完成");
  e.waitUntil(self.clients.claim());
});

// 接收推送消息（来自服务端的Web Push，选用）
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

// fetch缓存（可选，保持离线可用）
self.addEventListener("fetch", (e) => {
  // 只处理同源请求，跨域直接放行
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
