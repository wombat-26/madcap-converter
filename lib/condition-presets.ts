export interface ConditionPreset {
  id: string
  name: string
  description: string
  icon: string
  excludeConditions: string[]
  includeConditions: string[]
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

export const BUILTIN_PRESETS: ConditionPreset[] = [
  {
    id: 'production',
    name: 'Production Ready',
    description: 'Exclude all deprecated, draft, and internal content for production release',
    icon: '🚀',
    excludeConditions: [
      'Deprecated', 'Draft', 'Internal', 'Beta', 'Alpha', 'Hidden', 
      'Legacy', 'Obsolete', 'Red', 'Gray', 'Grey', 'Black',
      'Print-Only', 'Cancelled', 'Canceled', 'Abandoned', 'Shelved'
    ],
    includeConditions: [],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'draft-review',
    name: 'Draft Review',
    description: 'Show only draft and beta content for internal review',
    icon: '📝',
    excludeConditions: [],
    includeConditions: ['Draft', 'Beta', 'Internal'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'print-output',
    name: 'Print Output',
    description: 'Exclude online-only content and include print-specific content',
    icon: '🖨️',
    excludeConditions: ['Online-Only', 'OnlineOnly', 'Hidden', 'Internal'],
    includeConditions: ['Print-Only', 'PrintOnly'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'customer-portal',
    name: 'Customer Portal',
    description: 'Include only customer-facing content, exclude internal documentation',
    icon: '👥',
    excludeConditions: ['Internal', 'Hidden', 'Deprecated', 'Draft', 'Beta'],
    includeConditions: [],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'maintenance',
    name: 'Maintenance Review',
    description: 'Show only deprecated and legacy content for cleanup',
    icon: '🔧',
    excludeConditions: [],
    includeConditions: ['Deprecated', 'Legacy', 'Obsolete', 'Red', 'Cancelled'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'no-filter',
    name: 'No Filtering',
    description: 'Include all content regardless of conditions',
    icon: '📋',
    excludeConditions: [],
    includeConditions: [],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

export class ConditionPresetManager {
  private static readonly STORAGE_KEY = 'madcap-condition-presets'
  
  static getCustomPresets(): ConditionPreset[] {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to load custom presets:', error)
      return []
    }
  }
  
  static getAllPresets(): ConditionPreset[] {
    return [...BUILTIN_PRESETS, ...this.getCustomPresets()]
  }
  
  static saveCustomPreset(preset: Omit<ConditionPreset, 'id' | 'isBuiltIn' | 'createdAt' | 'updatedAt'>): ConditionPreset {
    const fullPreset: ConditionPreset = {
      ...preset,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    const customPresets = this.getCustomPresets()
    customPresets.push(fullPreset)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(customPresets))
      return fullPreset
    } catch (error) {
      console.error('Failed to save custom preset:', error)
      throw new Error('Failed to save preset')
    }
  }
  
  static updateCustomPreset(id: string, updates: Partial<ConditionPreset>): ConditionPreset {
    const customPresets = this.getCustomPresets()
    const index = customPresets.findIndex(p => p.id === id)
    
    if (index === -1) {
      throw new Error('Preset not found')
    }
    
    const updatedPreset = {
      ...customPresets[index],
      ...updates,
      id, // Ensure ID doesn't change
      isBuiltIn: false, // Ensure custom preset status
      updatedAt: new Date().toISOString()
    }
    
    customPresets[index] = updatedPreset
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(customPresets))
      return updatedPreset
    } catch (error) {
      console.error('Failed to update custom preset:', error)
      throw new Error('Failed to update preset')
    }
  }
  
  static deleteCustomPreset(id: string): void {
    const customPresets = this.getCustomPresets()
    const filtered = customPresets.filter(p => p.id !== id)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
    } catch (error) {
      console.error('Failed to delete custom preset:', error)
      throw new Error('Failed to delete preset')
    }
  }
  
  static findPresetById(id: string): ConditionPreset | null {
    return this.getAllPresets().find(p => p.id === id) || null
  }
  
  static exportPresets(): string {
    const customPresets = this.getCustomPresets()
    return JSON.stringify(customPresets, null, 2)
  }
  
  static importPresets(jsonData: string): number {
    try {
      const importedPresets = JSON.parse(jsonData) as ConditionPreset[]
      
      if (!Array.isArray(importedPresets)) {
        throw new Error('Invalid format: expected array of presets')
      }
      
      // Validate preset structure
      for (const preset of importedPresets) {
        if (!preset.name || !Array.isArray(preset.excludeConditions) || !Array.isArray(preset.includeConditions)) {
          throw new Error('Invalid preset structure')
        }
      }
      
      const existingPresets = this.getCustomPresets()
      const mergedPresets = [...existingPresets]
      let importedCount = 0
      
      // Add imported presets with new IDs to avoid conflicts
      for (const preset of importedPresets) {
        const newPreset: ConditionPreset = {
          ...preset,
          id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        mergedPresets.push(newPreset)
        importedCount++
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mergedPresets))
      return importedCount
      
    } catch (error) {
      console.error('Failed to import presets:', error)
      throw new Error('Failed to import presets: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }
  
  static getLastUsedPreset(): string | null {
    if (typeof window === 'undefined') return null
    
    try {
      return localStorage.getItem('madcap-last-used-preset')
    } catch (error) {
      console.error('Failed to get last used preset:', error)
      return null
    }
  }
  
  static setLastUsedPreset(presetId: string): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem('madcap-last-used-preset', presetId)
    } catch (error) {
      console.error('Failed to save last used preset:', error)
    }
  }
}