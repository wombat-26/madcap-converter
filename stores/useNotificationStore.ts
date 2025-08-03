import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // in milliseconds, undefined = persistent
  timestamp: Date
  action?: {
    label: string
    onClick: () => void
  }
}

interface NotificationState {
  notifications: Notification[]
  maxNotifications: number
}

interface NotificationActions {
  // Add notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string
  success: (title: string, message?: string, duration?: number) => string
  error: (title: string, message?: string, duration?: number) => string
  warning: (title: string, message?: string, duration?: number) => string
  info: (title: string, message?: string, duration?: number) => string
  
  // Remove notifications
  removeNotification: (id: string) => void
  clearNotifications: () => void
  clearByType: (type: NotificationType) => void
  
  // Update notifications
  updateNotification: (id: string, updates: Partial<Notification>) => void
}

export type NotificationStore = NotificationState & NotificationActions

const DEFAULT_DURATION = 5000 // 5 seconds

const initialState: NotificationState = {
  notifications: [],
  maxNotifications: 5,
}

export const useNotificationStore = create<NotificationStore>()(
  devtools((set, get) => ({
    ...initialState,
    
    // Add notifications
    addNotification: (notification) => {
      const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newNotification: Notification = {
        ...notification,
        id,
        timestamp: new Date(),
      }
      
      set((state) => {
        const notifications = [newNotification, ...state.notifications]
        // Keep only the max number of notifications
        return {
          notifications: notifications.slice(0, state.maxNotifications),
        }
      })
      
      // Auto-remove notification after duration
      if (notification.duration !== undefined && notification.duration > 0) {
        setTimeout(() => {
          get().removeNotification(id)
        }, notification.duration)
      }
      
      return id
    },
    
    success: (title, message, duration = DEFAULT_DURATION) =>
      get().addNotification({
        type: 'success',
        title,
        message,
        duration,
      }),
    
    error: (title, message, duration) =>
      get().addNotification({
        type: 'error',
        title,
        message,
        duration, // Errors are persistent by default
      }),
    
    warning: (title, message, duration = DEFAULT_DURATION) =>
      get().addNotification({
        type: 'warning',
        title,
        message,
        duration,
      }),
    
    info: (title, message, duration = DEFAULT_DURATION) =>
      get().addNotification({
        type: 'info',
        title,
        message,
        duration,
      }),
    
    // Remove notifications
    removeNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    
    clearNotifications: () => set({ notifications: [] }),
    
    clearByType: (type) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.type !== type),
      })),
    
    // Update notifications
    updateNotification: (id, updates) =>
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, ...updates } : n
        ),
      })),
  }))
)