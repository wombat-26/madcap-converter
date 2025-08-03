"use client"

import React, { useEffect } from 'react'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const notificationIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const notificationColors = {
  success: 'bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  error: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  warning: 'bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
  info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
}

export function NotificationProvider() {
  const { notifications, removeNotification } = useNotificationStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => {
        const Icon = notificationIcons[notification.type]
        
        return (
          <div
            key={notification.id}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300",
              notificationColors[notification.type]
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">{notification.title}</p>
              {notification.message && (
                <p className="text-sm opacity-90">{notification.message}</p>
              )}
              {notification.action && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-inherit hover:text-inherit/80"
                  onClick={notification.action.onClick}
                >
                  {notification.action.label}
                </Button>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 hover:bg-transparent"
              onClick={() => removeNotification(notification.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}