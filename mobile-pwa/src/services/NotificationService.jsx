/**
 * Notification Service for NeoBank PWA
 * Handles push notifications, in-app notifications, and notification permissions
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class NotificationService {
  static isInitialized = false;
  static registration = null;

  /**
   * Initialize notification service
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if service worker is supported
      if ('serviceWorker' in navigator) {
        this.registration = await navigator.serviceWorker.ready;
        console.log('Notification service initialized');
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('Notification service initialization error:', error);
    }
  }

  /**
   * Request notification permission
   * @returns {Promise<boolean>} Permission granted status
   */
  static async requestPermission() {
    try {
      if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return false;
      }

      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Notification permission request error:', error);
      return false;
    }
  }

  /**
   * Check if notifications are supported
   * @returns {boolean} Support status
   */
  static isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Check if permission is granted
   * @returns {boolean} Permission status
   */
  static isPermissionGranted() {
    return Notification.permission === 'granted';
  }

  /**
   * Subscribe to push notifications
   * @returns {Promise<PushSubscription|null>} Push subscription
   */
  static async subscribeToPush() {
    try {
      if (!this.registration) {
        await this.initialize();
      }

      const permission = await this.requestPermission();
      
      if (!permission) {
        return null;
      }

      // Get VAPID public key from server
      const response = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
      const { publicKey } = await response.json();

      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);

      return subscription;
    } catch (error) {
      console.error('Push subscription error:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   * @returns {Promise<boolean>} Success status
   */
  static async unsubscribeFromPush() {
    try {
      if (!this.registration) {
        return false;
      }

      const subscription = await this.registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await this.removeSubscriptionFromServer(subscription);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Push unsubscription error:', error);
      return false;
    }
  }

  /**
   * Show local notification
   * @param {string} title - Notification title
   * @param {Object} options - Notification options
   * @returns {Promise<void>}
   */
  static async showNotification(title, options = {}) {
    try {
      if (!this.isPermissionGranted()) {
        const granted = await this.requestPermission();
        if (!granted) {
          return;
        }
      }

      const defaultOptions = {
        icon: '/logo192.png',
        badge: '/badge-72x72.png',
        vibrate: [100, 50, 100],
        requireInteraction: false,
        ...options,
      };

      if (this.registration) {
        await this.registration.showNotification(title, defaultOptions);
      } else {
        new Notification(title, defaultOptions);
      }
    } catch (error) {
      console.error('Show notification error:', error);
    }
  }

  /**
   * Get all notifications
   * @returns {Promise<Array>} Notifications array
   */
  static async getAllNotifications() {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      return data.notifications || [];
    } catch (error) {
      console.error('Get notifications error:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<boolean>} Success status
   */
  static async markAsRead(notificationId) {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Mark as read error:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read
   * @returns {Promise<boolean>} Success status
   */
  static async markAllAsRead() {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Mark all as read error:', error);
      return false;
    }
  }

  /**
   * Delete notification
   * @param {string} notificationId - Notification ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteNotification(notificationId) {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Delete notification error:', error);
      return false;
    }
  }

  /**
   * Get unread notification count
   * @returns {Promise<number>} Unread count
   */
  static async getUnreadCount() {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.count || 0;
    } catch (error) {
      console.error('Get unread count error:', error);
      return 0;
    }
  }

  /**
   * Send subscription to server
   * @param {PushSubscription} subscription - Push subscription
   * @returns {Promise<void>}
   */
  static async sendSubscriptionToServer(subscription) {
    try {
      const token = localStorage.getItem('authToken');
      
      await fetch(`${API_BASE_URL}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(subscription),
      });
    } catch (error) {
      console.error('Send subscription error:', error);
    }
  }

  /**
   * Remove subscription from server
   * @param {PushSubscription} subscription - Push subscription
   * @returns {Promise<void>}
   */
  static async removeSubscriptionFromServer(subscription) {
    try {
      const token = localStorage.getItem('authToken');
      
      await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(subscription),
      });
    } catch (error) {
      console.error('Remove subscription error:', error);
    }
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   * @param {string} base64String - Base64 encoded string
   * @returns {Uint8Array} Uint8Array
   */
  static urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Schedule local notification
   * @param {string} title - Notification title
   * @param {Object} options - Notification options
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timeout ID
   */
  static scheduleNotification(title, options, delay) {
    return setTimeout(() => {
      this.showNotification(title, options);
    }, delay);
  }

  /**
   * Cancel scheduled notification
   * @param {number} timeoutId - Timeout ID
   */
  static cancelScheduledNotification(timeoutId) {
    clearTimeout(timeoutId);
  }

  /**
   * Show transaction notification
   * @param {Object} transaction - Transaction data
   * @returns {Promise<void>}
   */
  static async showTransactionNotification(transaction) {
    const title = transaction.type === 'credit' ? 'Money Received' : 'Money Sent';
    const body = `₦${transaction.amount.toLocaleString()} ${transaction.type === 'credit' ? 'received from' : 'sent to'} ${transaction.counterparty}`;

    await this.showNotification(title, {
      body,
      icon: '/icons/transaction.png',
      tag: `transaction-${transaction.id}`,
      data: { type: 'transaction', id: transaction.id },
    });
  }

  /**
   * Show loan notification
   * @param {Object} loan - Loan data
   * @returns {Promise<void>}
   */
  static async showLoanNotification(loan) {
    const title = 'Loan Update';
    const body = `Your loan application for ₦${loan.amount.toLocaleString()} has been ${loan.status}`;

    await this.showNotification(title, {
      body,
      icon: '/icons/loan.png',
      tag: `loan-${loan.id}`,
      data: { type: 'loan', id: loan.id },
    });
  }

  /**
   * Show bill reminder notification
   * @param {Object} bill - Bill data
   * @returns {Promise<void>}
   */
  static async showBillReminderNotification(bill) {
    const title = 'Bill Reminder';
    const body = `${bill.name} payment of ₦${bill.amount.toLocaleString()} is due ${bill.dueDate}`;

    await this.showNotification(title, {
      body,
      icon: '/icons/bill.png',
      tag: `bill-${bill.id}`,
      data: { type: 'bill', id: bill.id },
      requireInteraction: true,
    });
  }
}

export default NotificationService;

// ---------------------------------------------------------------------------
// Module-level namespace API
// Pages use `import * as NotificationService from '../services/NotificationService'`;
// these named exports make the static class members reachable on the namespace.
// ---------------------------------------------------------------------------
const _Notify = NotificationService;

export const initialize = _Notify.initialize.bind(_Notify);
export const requestPermission = _Notify.requestPermission.bind(_Notify);
export const showNotification = _Notify.showNotification.bind(_Notify);
export const markAsRead = _Notify.markAsRead.bind(_Notify);
export const markAllAsRead = _Notify.markAllAsRead.bind(_Notify);
export const deleteNotification = _Notify.deleteNotification.bind(_Notify);
export const getUnreadCount = _Notify.getUnreadCount.bind(_Notify);
export const getNotifications = _Notify.getAllNotifications.bind(_Notify);
export const getAllNotifications = _Notify.getAllNotifications.bind(_Notify);

export async function deleteAllReadNotifications() {
  const all = (await _Notify.getAllNotifications()) || [];
  const read = all.filter((n) => n.read || n.is_read);
  await Promise.all(read.map((n) => _Notify.deleteNotification(n.id)));
  return read.length;
}

// Lightweight toast bus: NotificationProvider listens for `app:toast`.
export function notify(message, type = 'info', title) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app:toast', { detail: { message, type, title } })
    );
  }
}

export const showToast = notify;
export const success = (message, title) => notify(message, 'success', title);
export const showSuccess = success;
export const error = (message, title) => notify(message, 'error', title);
export const showError = error;
export const info = (message, title) => notify(message, 'info', title);
export const warn = (message, title) => notify(message, 'warning', title);
export const warning = warn;
