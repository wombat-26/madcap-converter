import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { ConversionOptions, OutputFormat } from './useConversionStore'

export interface ConversionPreset {
  id: string
  name: string
  description?: string
  format: OutputFormat
  options: ConversionOptions
  createdAt: Date
  lastUsed?: Date
  usageCount: number
}

export interface RecentConversion {
  id: string
  fileName: string
  format: OutputFormat
  timestamp: Date
  fileSize: number
  processingTime: number
  success: boolean
  errorMessage?: string
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  autoSavePresets: boolean
  showAdvancedOptions: boolean
  defaultFormat: OutputFormat
  maxRecentConversions: number
  enableAnalytics: boolean
  enableNotifications: boolean
  keyboardShortcuts: boolean
}

interface SettingsState {
  preferences: UserPreferences
  presets: ConversionPreset[]
  recentConversions: RecentConversion[]
}

interface SettingsActions {
  // Preferences
  updatePreferences: (preferences: Partial<UserPreferences>) => void
  setTheme: (theme: UserPreferences['theme']) => void
  toggleAdvancedOptions: () => void
  
  // Presets
  savePreset: (preset: Omit<ConversionPreset, 'id' | 'createdAt' | 'usageCount'>) => string
  updatePreset: (id: string, updates: Partial<ConversionPreset>) => void
  deletePreset: (id: string) => void
  usePreset: (id: string) => ConversionPreset | undefined
  getPresetById: (id: string) => ConversionPreset | undefined
  
  // Recent conversions
  addRecentConversion: (conversion: Omit<RecentConversion, 'id'>) => void
  clearRecentConversions: () => void
  getRecentConversions: (limit?: number) => RecentConversion[]
  
  // Import/Export
  exportSettings: () => string
  importSettings: (settingsJson: string) => boolean
}

export type SettingsStore = SettingsState & SettingsActions

const initialState: SettingsState = {
  preferences: {
    theme: 'system',
    autoSavePresets: true,
    showAdvancedOptions: false,
    defaultFormat: 'asciidoc',
    maxRecentConversions: 50,
    enableAnalytics: false,
    enableNotifications: true,
    keyboardShortcuts: true,
  },
  presets: [],
  recentConversions: [],
}

export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // Preferences
        updatePreferences: (preferences) =>
          set((state) => ({
            preferences: { ...state.preferences, ...preferences },
          })),
        
        setTheme: (theme) =>
          set((state) => ({
            preferences: { ...state.preferences, theme },
          })),
        
        toggleAdvancedOptions: () =>
          set((state) => ({
            preferences: {
              ...state.preferences,
              showAdvancedOptions: !state.preferences.showAdvancedOptions,
            },
          })),
        
        // Presets
        savePreset: (preset) => {
          const id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const newPreset: ConversionPreset = {
            ...preset,
            id,
            createdAt: new Date(),
            usageCount: 0,
          }
          
          set((state) => ({
            presets: [...state.presets, newPreset],
          }))
          
          return id
        },
        
        updatePreset: (id, updates) =>
          set((state) => ({
            presets: state.presets.map((preset) =>
              preset.id === id ? { ...preset, ...updates } : preset
            ),
          })),
        
        deletePreset: (id) =>
          set((state) => ({
            presets: state.presets.filter((preset) => preset.id !== id),
          })),
        
        usePreset: (id) => {
          const preset = get().presets.find((p) => p.id === id)
          if (preset) {
            set((state) => ({
              presets: state.presets.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      lastUsed: new Date(),
                      usageCount: p.usageCount + 1,
                    }
                  : p
              ),
            }))
          }
          return preset
        },
        
        getPresetById: (id) => get().presets.find((p) => p.id === id),
        
        // Recent conversions
        addRecentConversion: (conversion) => {
          const id = `conversion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const newConversion: RecentConversion = { ...conversion, id }
          
          set((state) => {
            const recentConversions = [newConversion, ...state.recentConversions]
            // Keep only the max number of recent conversions
            return {
              recentConversions: recentConversions.slice(
                0,
                state.preferences.maxRecentConversions
              ),
            }
          })
        },
        
        clearRecentConversions: () => set({ recentConversions: [] }),
        
        getRecentConversions: (limit) => {
          const conversions = get().recentConversions
          return limit ? conversions.slice(0, limit) : conversions
        },
        
        // Import/Export
        exportSettings: () => {
          const { preferences, presets, recentConversions } = get()
          return JSON.stringify(
            {
              preferences,
              presets,
              recentConversions,
              exportedAt: new Date().toISOString(),
              version: '1.0.0',
            },
            null,
            2
          )
        },
        
        importSettings: (settingsJson) => {
          try {
            const data = JSON.parse(settingsJson)
            if (!data.version || !data.preferences) {
              throw new Error('Invalid settings format')
            }
            
            set({
              preferences: data.preferences,
              presets: data.presets || [],
              recentConversions: data.recentConversions || [],
            })
            
            return true
          } catch (error) {
            console.error('Failed to import settings:', error)
            return false
          }
        },
      }),
      {
        name: 'madcap-converter-settings',
      }
    )
  )
)