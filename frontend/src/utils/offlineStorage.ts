/**
 * Offline Storage Utilities
 * Week 5 Day 5: PWA Implementation
 *
 * IndexedDB wrapper for offline data persistence
 */

const DB_NAME = 'FlashSalePWA';
const DB_VERSION = 1;

interface DBSchema {
  products: { id: string; data: Record<string, unknown>; updatedAt: number };
  flashSales: { id: string; data: Record<string, unknown>; updatedAt: number };
  cart: { key: string; items: Record<string, unknown>[]; userId?: string };
  pendingActions: {
    id?: number;
    type: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
  };
  userPreferences: { key: string; value: unknown };
}

type StoreName = keyof DBSchema;

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Open IndexedDB connection
   */
  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Products store
        if (!db.objectStoreNames.contains('products')) {
          const store = db.createObjectStore('products', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Flash sales store
        if (!db.objectStoreNames.contains('flashSales')) {
          const store = db.createObjectStore('flashSales', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Cart store
        if (!db.objectStoreNames.contains('cart')) {
          db.createObjectStore('cart', { keyPath: 'key' });
        }

        // Pending actions for background sync
        if (!db.objectStoreNames.contains('pendingActions')) {
          const store = db.createObjectStore('pendingActions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // User preferences
        if (!db.objectStoreNames.contains('userPreferences')) {
          db.createObjectStore('userPreferences', { keyPath: 'key' });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Get an item from a store
   */
  async get<T extends StoreName>(
    storeName: T,
    key: string | number,
  ): Promise<DBSchema[T] | undefined> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get all items from a store
   */
  async getAll<T extends StoreName>(storeName: T): Promise<DBSchema[T][]> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Put an item into a store
   */
  async put<T extends StoreName>(storeName: T, item: DBSchema[T]): Promise<IDBValidKey> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Delete an item from a store
   */
  async delete(storeName: StoreName, key: string | number): Promise<void> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear all items from a store
   */
  async clear(storeName: StoreName): Promise<void> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ Specialized Methods ============

  /**
   * Cache products for offline access
   */
  async cacheProducts(products: Record<string, unknown>[]): Promise<void> {
    const timestamp = Date.now();
    await Promise.all(
      products.map((product) =>
        this.put('products', { id: String(product.id), data: product, updatedAt: timestamp }),
      ),
    );
  }

  /**
   * Get cached products
   */
  async getCachedProducts(): Promise<Record<string, unknown>[]> {
    const items = await this.getAll('products');
    return items.map((item) => item.data);
  }

  /**
   * Cache flash sales
   */
  async cacheFlashSales(sales: Record<string, unknown>[]): Promise<void> {
    const timestamp = Date.now();
    await Promise.all(
      sales.map((sale) =>
        this.put('flashSales', { id: String(sale.id), data: sale, updatedAt: timestamp }),
      ),
    );
  }

  /**
   * Get cached flash sales
   */
  async getCachedFlashSales(): Promise<Record<string, unknown>[]> {
    const items = await this.getAll('flashSales');
    return items.map((item) => item.data);
  }

  /**
   * Save cart for offline access
   */
  async saveCart(items: Record<string, unknown>[], userId?: string): Promise<void> {
    await this.put('cart', { key: 'current', items, userId });
  }

  /**
   * Get offline cart
   */
  async getCart(): Promise<Record<string, unknown>[] | null> {
    const cart = await this.get('cart', 'current');
    return cart?.items || null;
  }

  /**
   * Queue an action for background sync
   */
  async queueAction(action: Omit<DBSchema['pendingActions'], 'id' | 'timestamp'>): Promise<void> {
    await this.put('pendingActions', {
      ...action,
      timestamp: Date.now(),
    } as DBSchema['pendingActions']);

    // Request background sync if available
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      // Background Sync API not fully typed in TS lib
      (
        registration as unknown as { sync: { register: (tag: string) => Promise<void> } }
      ).sync.register('sync-queue-actions');
    }
  }

  /**
   * Get pending actions
   */
  async getPendingActions(): Promise<DBSchema['pendingActions'][]> {
    return this.getAll('pendingActions');
  }

  /**
   * Set user preference
   */
  async setPreference(key: string, value: unknown): Promise<void> {
    await this.put('userPreferences', { key, value });
  }

  /**
   * Get user preference
   */
  async getPreference<T = unknown>(key: string): Promise<T | undefined> {
    const pref = await this.get('userPreferences', key);
    return pref?.value as T | undefined;
  }

  /**
   * Clear expired cache entries (older than 24 hours)
   */
  async clearExpiredCache(): Promise<void> {
    const expirationTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const db = await this.openDB();

    const clearStore = async (storeName: 'products' | 'flashSales') => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('updatedAt');
        const range = IDBKeyRange.upperBound(expirationTime);
        const request = index.openCursor(range);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    };

    await Promise.all([clearStore('products'), clearStore('flashSales')]);
  }

  /**
   * Get storage usage estimate
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number; percent: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percent: estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0,
      };
    }
    return null;
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();

// Export types
export type { DBSchema, StoreName };
