/**
 * Push Notification Service
 * Week 5 Day 5: PWA Implementation
 *
 * Features:
 * - Browser notification permissions
 * - Push subscription management
 * - Notification preferences
 * - Rich notification support
 */

import { offlineStorage } from './offlineStorage';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: { action: string; title: string }[];
  data?: Record<string, any>;
  vibrate?: number[];
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private permission: NotificationPermission = 'default';

  /**
   * Initialize push notification service
   */
  async initialize(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return false;
    }

    this.permission = Notification.permission;

    // Get service worker registration
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.ready;
        console.log('Push notification service initialized');
        return true;
      } catch (error) {
        console.error('Failed to get service worker registration:', error);
        return false;
      }
    }

    return false;
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  /**
   * Get current permission status
   */
  getPermission(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return 'denied';
    }

    try {
      this.permission = await Notification.requestPermission();

      // Save preference
      await offlineStorage.setPreference('notificationPermission', this.permission);

      return this.permission;
    } catch (error) {
      console.error('Failed to request permission:', error);
      return 'denied';
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(vapidPublicKey: string): Promise<PushSubscriptionData | null> {
    if (!this.swRegistration) {
      await this.initialize();
    }

    if (!this.swRegistration || this.permission !== 'granted') {
      return null;
    }

    try {
      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: this.arrayBufferToBase64(subscription.getKey('auth')),
        },
      };

      // Save subscription locally
      await offlineStorage.setPreference('pushSubscription', subscriptionData);

      return subscriptionData;
    } catch (error) {
      console.error('Failed to subscribe to push:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    if (!this.swRegistration) {
      return false;
    }

    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await offlineStorage.delete('userPreferences', 'pushSubscription');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    }
  }

  /**
   * Get current push subscription
   */
  async getSubscription(): Promise<PushSubscription | null> {
    if (!this.swRegistration) {
      await this.initialize();
    }

    if (!this.swRegistration) {
      return null;
    }

    return this.swRegistration.pushManager.getSubscription();
  }

  /**
   * Show a local notification
   */
  async showNotification(options: NotificationOptions): Promise<void> {
    if (this.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    const notificationOptions: NotificationOptions = {
      icon: options.icon || '/icons/icon-192x192.png',
      badge: options.badge || '/icons/badge-72x72.png',
      vibrate: options.vibrate || [100, 50, 100],
      tag: options.tag || 'flash-sale-notification',
      ...options,
    };

    // Use service worker notification if available
    if (this.swRegistration) {
      await this.swRegistration.showNotification(options.title, notificationOptions);
    } else {
      // Fallback to basic notification
      new Notification(options.title, {
        body: options.body,
        icon: notificationOptions.icon,
        tag: notificationOptions.tag,
      });
    }
  }

  /**
   * Show flash sale starting notification
   */
  async notifySaleStarting(saleId: string, saleName: string, startsIn: number): Promise<void> {
    await this.showNotification({
      title: '⚡ Flash Sale Starting Soon!',
      body: `${saleName} starts in ${Math.ceil(startsIn / 60)} minutes!`,
      tag: `sale-starting-${saleId}`,
      requireInteraction: true,
      actions: [
        { action: 'view', title: 'View Sale' },
        { action: 'queue', title: 'Join Queue' },
      ],
      data: { saleId, type: 'sale-starting' },
    });
  }

  /**
   * Show queue position notification
   */
  async notifyQueuePosition(saleId: string, position: number): Promise<void> {
    let message = `You're #${position} in line`;

    if (position <= 10) {
      message = `🔥 Almost your turn! You're #${position}`;
    } else if (position <= 50) {
      message = `Getting close! You're #${position}`;
    }

    await this.showNotification({
      title: '📊 Queue Update',
      body: message,
      tag: `queue-position-${saleId}`,
      data: { saleId, position, type: 'queue-update' },
    });
  }

  /**
   * Show purchase reminder notification
   */
  async notifyPurchaseReady(saleId: string, timeLimit: number): Promise<void> {
    await this.showNotification({
      title: "🎉 It's Your Turn!",
      body: `You have ${timeLimit} seconds to complete your purchase!`,
      tag: `purchase-ready-${saleId}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      actions: [{ action: 'purchase', title: 'Buy Now!' }],
      data: { saleId, type: 'purchase-ready' },
    });
  }

  /**
   * Show cart expiration notification
   */
  async notifyCartExpiring(minutesLeft: number): Promise<void> {
    await this.showNotification({
      title: '⏰ Cart Expiring Soon',
      body: `Your reserved items expire in ${minutesLeft} minutes!`,
      tag: 'cart-expiring',
      actions: [{ action: 'checkout', title: 'Checkout Now' }],
      data: { type: 'cart-expiring' },
    });
  }

  // ============ Helper Methods ============

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return '';

    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();

// Export types
export type { NotificationOptions, PushSubscriptionData };
