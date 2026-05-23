/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// Workbox injektoi manifest tähän build-vaiheessa
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() as { title?: string; body?: string; url?: string } | undefined ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Päivän yhteenveto', {
      body: data.body ?? 'Avaa nähdäksesi.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string }).url ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})
