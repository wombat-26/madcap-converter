"use client"

import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Eye,
  EyeOff,
  Palette,
  FileText,
  Settings,
  Tag,
  Bookmark,
  Plus,
  Download,
  Upload,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { ConditionPresetManager, ConditionPreset } from '@/lib/condition-presets'

// Helper component for highlighted text
const HighlightedText: React.FC<{ text: string; searchTerm: string }> = ({ text, searchTerm }) => {
  if (!searchTerm.trim()) {
    return <span>{text}</span>
  }
  
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  
  return (
    <span>
      {parts.map((part, index) => (
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      ))}
    </span>
  )
}

interface ConditionInfo {
  condition: string
  usage: number
  category: 'status' | 'color' | 'print' | 'development' | 'visibility' | 'custom'
  isDeprecated?: boolean
  description?: string
  files: string[]
}

interface ConditionsByCategory {
  [category: string]: ConditionInfo[]
}

interface ConditionAnalysisResult {
  conditions: string[]
  fileCount: number
  conditionUsage: Record<string, number>
  filesByCondition: Record<string, string[]>
  conditionsByCategory: ConditionsByCategory
  conditionsWithInfo: ConditionInfo[]
  recommendedExclusions: string[]
  totalConditions: number
  filesAnalyzed: number
}

interface ConditionSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedConditions: { excludeConditions: string[], includeConditions: string[] }) => void
  analysisResult: ConditionAnalysisResult | null
  isLoading?: boolean
}

const categoryIcons = {
  status: AlertTriangle,
  development: Settings,
  visibility: Eye,
  color: Palette,
  print: FileText,
  custom: Tag
}

const categoryLabels = {
  status: 'Status',
  development: 'Development',
  visibility: 'Visibility', 
  color: 'Color',
  print: 'Print',
  custom: 'Custom'
}

const categoryDescriptions = {
  status: 'Content status and lifecycle conditions',
  development: 'Development and review stages',
  visibility: 'Content visibility and access control',
  color: 'Color-based review and categorization',
  print: 'Print vs online content targeting',
  custom: 'Project-specific custom conditions'
}

export function ConditionSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  analysisResult,
  isLoading = false
}: ConditionSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMode, setSelectedMode] = useState<'exclude' | 'include'>('exclude')
  const [excludeConditions, setExcludeConditions] = useState<Set<string>>(new Set())
  const [includeConditions, setIncludeConditions] = useState<Set<string>>(new Set())
  
  // Preset-related state
  const [availablePresets, setAvailablePresets] = useState<ConditionPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetDescription, setNewPresetDescription] = useState('')
  
  // Enhanced selection features
  const [bulkPattern, setBulkPattern] = useState('')
  const [showImpactPreview, setShowImpactPreview] = useState(true)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)

  // Load available presets
  useEffect(() => {
    if (isOpen) {
      const presets = ConditionPresetManager.getAllPresets()
      setAvailablePresets(presets)
      
      // Load last used preset or default to recommended exclusions
      const lastUsedPresetId = ConditionPresetManager.getLastUsedPreset()
      if (lastUsedPresetId) {
        const preset = presets.find(p => p.id === lastUsedPresetId)
        if (preset) {
          applyPreset(preset)
          setSelectedPresetId(lastUsedPresetId)
          return
        }
      }
    }
  }, [isOpen])

  // Initialize with recommended exclusions if no preset is applied
  useEffect(() => {
    if (analysisResult?.recommendedExclusions && selectedPresetId === '') {
      setExcludeConditions(new Set(analysisResult.recommendedExclusions))
    }
  }, [analysisResult, selectedPresetId])

  // Handler functions (defined before useEffect to avoid circular dependency)
  const handleConfirm = () => {
    onConfirm({
      excludeConditions: Array.from(excludeConditions),
      includeConditions: Array.from(includeConditions)
    })
    onClose()
  }

  const handleReset = () => {
    setExcludeConditions(new Set(analysisResult?.recommendedExclusions || []))
    setIncludeConditions(new Set())
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts if not typing in an input
      if (event.target instanceof HTMLInputElement) return
      
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'a':
            event.preventDefault()
            // Select all conditions in current mode
            if (analysisResult) {
              if (selectedMode === 'exclude') {
                setExcludeConditions(new Set(analysisResult.conditions))
                setIncludeConditions(new Set())
              } else {
                setIncludeConditions(new Set(analysisResult.conditions))
                setExcludeConditions(new Set())
              }
              setSelectedPresetId('')
            }
            break
          case 'd':
            event.preventDefault()
            // Deselect all conditions
            setExcludeConditions(new Set())
            setIncludeConditions(new Set())
            setSelectedPresetId('')
            break
          case 'r':
            event.preventDefault()
            // Reset to recommended
            handleReset()
            break
          case 'Enter':
            event.preventDefault()
            // Confirm selection
            handleConfirm()
            break
        }
      } else {
        switch (event.key) {
          case 'Escape':
            onClose()
            break
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
            // Quick preset selection (1-6 for built-in presets)
            const presetIndex = parseInt(event.key) - 1
            if (availablePresets[presetIndex]) {
              handlePresetSelect(availablePresets[presetIndex].id)
            }
            break
        }
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, analysisResult, selectedMode, availablePresets, handleConfirm, handleReset, onClose])

  // Filter conditions based on search query
  const filteredConditions = useMemo(() => {
    if (!analysisResult) return {}
    
    const filtered: ConditionsByCategory = {}
    
    Object.entries(analysisResult.conditionsByCategory).forEach(([category, conditions]) => {
      const matchingConditions = conditions.filter(conditionInfo =>
        conditionInfo.condition.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conditionInfo.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      
      if (matchingConditions.length > 0) {
        filtered[category] = matchingConditions
      }
    })
    
    return filtered
  }, [analysisResult, searchQuery])

  // Preset handling functions
  const applyPreset = (preset: ConditionPreset) => {
    setExcludeConditions(new Set(preset.excludeConditions))
    setIncludeConditions(new Set(preset.includeConditions))
    
    // Set the appropriate mode based on preset
    if (preset.includeConditions.length > 0) {
      setSelectedMode('include')
    } else {
      setSelectedMode('exclude')
    }
  }

  const handlePresetSelect = (presetId: string) => {
    const preset = availablePresets.find(p => p.id === presetId)
    if (preset) {
      applyPreset(preset)
      setSelectedPresetId(presetId)
      ConditionPresetManager.setLastUsedPreset(presetId)
    }
  }

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return
    
    try {
      const newPreset = ConditionPresetManager.saveCustomPreset({
        name: newPresetName.trim(),
        description: newPresetDescription.trim(),
        icon: '⭐',
        excludeConditions: Array.from(excludeConditions),
        includeConditions: Array.from(includeConditions)
      })
      
      // Refresh presets list
      setAvailablePresets(ConditionPresetManager.getAllPresets())
      setSelectedPresetId(newPreset.id)
      
      // Clear form
      setNewPresetName('')
      setNewPresetDescription('')
      setShowSavePresetDialog(false)
      
    } catch (error) {
      console.error('Failed to save preset:', error)
    }
  }

  // Enhanced selection features
  const handleBulkPatternSelect = () => {
    if (!bulkPattern.trim() || !analysisResult) return
    
    // Clear preset selection
    setSelectedPresetId('')
    
    try {
      const pattern = new RegExp(bulkPattern, 'i')
      const matchingConditions = analysisResult.conditions.filter(condition =>
        pattern.test(condition)
      )
      
      if (selectedMode === 'exclude') {
        const newExcludeConditions = new Set([...excludeConditions, ...matchingConditions])
        const newIncludeConditions = new Set(includeConditions)
        matchingConditions.forEach(condition => newIncludeConditions.delete(condition))
        setExcludeConditions(newExcludeConditions)
        setIncludeConditions(newIncludeConditions)
      } else {
        const newIncludeConditions = new Set([...includeConditions, ...matchingConditions])
        const newExcludeConditions = new Set(excludeConditions)
        matchingConditions.forEach(condition => newExcludeConditions.delete(condition))
        setIncludeConditions(newIncludeConditions)
        setExcludeConditions(newExcludeConditions)
      }
      
      setBulkPattern('') // Clear pattern after applying
    } catch (error) {
      console.error('Invalid regex pattern:', error)
    }
  }

  // Calculate impact preview
  const impactPreview = useMemo(() => {
    if (!analysisResult || !showImpactPreview) return null
    
    let affectedFiles = new Set<string>()
    let affectedConditions = 0
    
    if (selectedMode === 'exclude') {
      excludeConditions.forEach(condition => {
        const files = analysisResult.filesByCondition[condition] || []
        files.forEach(file => affectedFiles.add(file))
        affectedConditions++
      })
    } else {
      // For include mode, calculate files that would be kept
      includeConditions.forEach(condition => {
        const files = analysisResult.filesByCondition[condition] || []
        files.forEach(file => affectedFiles.add(file))
        affectedConditions++
      })
    }
    
    const totalFiles = analysisResult.filesAnalyzed
    const affectedFileCount = affectedFiles.size
    const impactPercentage = totalFiles > 0 ? Math.round((affectedFileCount / totalFiles) * 100) : 0
    
    return {
      affectedFiles: affectedFileCount,
      totalFiles,
      affectedConditions,
      impactPercentage,
      mode: selectedMode
    }
  }, [analysisResult, excludeConditions, includeConditions, selectedMode, showImpactPreview])

  const handleConditionToggle = (condition: string, checked: boolean) => {
    // Clear preset selection when manually changing conditions
    setSelectedPresetId('')
    
    if (selectedMode === 'exclude') {
      const newExcludeConditions = new Set(excludeConditions)
      if (checked) {
        newExcludeConditions.add(condition)
        // Remove from include if it was there
        const newIncludeConditions = new Set(includeConditions)
        newIncludeConditions.delete(condition)
        setIncludeConditions(newIncludeConditions)
      } else {
        newExcludeConditions.delete(condition)
      }
      setExcludeConditions(newExcludeConditions)
    } else {
      const newIncludeConditions = new Set(includeConditions)
      if (checked) {
        newIncludeConditions.add(condition)
        // Remove from exclude if it was there
        const newExcludeConditions = new Set(excludeConditions)
        newExcludeConditions.delete(condition)
        setExcludeConditions(newExcludeConditions)
      } else {
        newIncludeConditions.delete(condition)
      }
      setIncludeConditions(newIncludeConditions)
    }
  }

  const handleCategorySelectAll = (category: string, conditions: ConditionInfo[]) => {
    // Clear preset selection when manually changing conditions
    setSelectedPresetId('')
    
    const conditionNames = conditions.map(c => c.condition)
    
    if (selectedMode === 'exclude') {
      const newExcludeConditions = new Set([...excludeConditions, ...conditionNames])
      const newIncludeConditions = new Set(includeConditions)
      conditionNames.forEach(name => newIncludeConditions.delete(name))
      setExcludeConditions(newExcludeConditions)
      setIncludeConditions(newIncludeConditions)
    } else {
      const newIncludeConditions = new Set([...includeConditions, ...conditionNames])
      const newExcludeConditions = new Set(excludeConditions)
      conditionNames.forEach(name => newExcludeConditions.delete(name))
      setIncludeConditions(newIncludeConditions)
      setExcludeConditions(newExcludeConditions)
    }
  }

  const handleCategorySelectNone = (category: string, conditions: ConditionInfo[]) => {
    // Clear preset selection when manually changing conditions
    setSelectedPresetId('')
    
    const conditionNames = conditions.map(c => c.condition)
    
    if (selectedMode === 'exclude') {
      const newExcludeConditions = new Set(excludeConditions)
      conditionNames.forEach(name => newExcludeConditions.delete(name))
      setExcludeConditions(newExcludeConditions)
    } else {
      const newIncludeConditions = new Set(includeConditions)
      conditionNames.forEach(name => newIncludeConditions.delete(name))
      setIncludeConditions(newIncludeConditions)
    }
  }

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Analyzing MadCap Conditions...</DialogTitle>
            <DialogDescription>
              Discovering and categorizing conditions in your MadCap files.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Analyzing conditions...</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!analysisResult) {
    return null
  }

  const isConditionSelected = (condition: string) => {
    if (selectedMode === 'exclude') {
      return excludeConditions.has(condition)
    } else {
      return includeConditions.has(condition)
    }
  }

  const totalSelected = selectedMode === 'exclude' ? excludeConditions.size : includeConditions.size

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] sm:w-full flex flex-col">
        <DialogHeader>
          <DialogTitle>Select MadCap Conditions</DialogTitle>
          <DialogDescription>
            Found {analysisResult.totalConditions} conditions in {analysisResult.filesAnalyzed} files. 
            Choose which conditions to include or exclude from conversion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 flex-1 min-h-0">
          {/* Preset Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <Bookmark className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Preset:</Label>
            </div>
            <div className="flex-1">
              <Select value={selectedPresetId} onValueChange={handlePresetSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a preset..." />
                </SelectTrigger>
                <SelectContent>
                  {availablePresets.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="flex items-center space-x-2">
                        <span>{preset.icon}</span>
                        <div>
                          <div className="font-medium">{preset.name}</div>
                          <div className="text-xs text-muted-foreground">{preset.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSavePresetDialog(true)}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>

          {/* Mode Selection and Search */}
          <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="mode-exclude" className="text-sm font-medium">Mode:</Label>
              <div className="flex items-center space-x-1">
                <Button
                  variant={selectedMode === 'exclude' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMode('exclude')}
                >
                  <EyeOff className="h-4 w-4 mr-1" />
                  Exclude ({excludeConditions.size})
                </Button>
                <Button
                  variant={selectedMode === 'include' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMode('include')}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Include Only ({includeConditions.size})
                </Button>
              </div>
            </div>
            
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search conditions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Help */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
              className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <HelpCircle className="h-4 w-4" />
                <span>Keyboard Shortcuts</span>
              </div>
              {showKeyboardHelp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            
            {showKeyboardHelp && (
              <div className="border-t p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Select All:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Ctrl+A</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deselect All:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Ctrl+D</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reset:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Ctrl+R</kbd>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confirm:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Ctrl+Enter</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Close:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Escape</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Presets:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">1-6</kbd>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                  <p>💡 <strong>Tip:</strong> Use keyboard shortcuts for faster condition selection. Shortcuts don't work when typing in input fields.</p>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Selection Tools */}
          <div className="border rounded-lg p-3 space-y-3">
            {/* Bulk Pattern Selection */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
              <Label className="text-sm font-medium shrink-0">Bulk Pattern:</Label>
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                <Input
                  placeholder="e.g., ^(deprecated|draft).*$ or *beta*"
                  value={bulkPattern}
                  onChange={(e) => setBulkPattern(e.target.value)}
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleBulkPatternSelect()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkPatternSelect}
                  disabled={!bulkPattern.trim()}
                  className="shrink-0"
                >
                  Apply
                </Button>
              </div>
            </div>
            
            {/* Impact Preview */}
            {impactPreview && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 text-sm bg-muted/30 rounded p-2">
                <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4">
                  <div>
                    <span className="font-medium">Impact:</span> {impactPreview.affectedFiles}/{impactPreview.totalFiles} files ({impactPreview.impactPercentage}%)
                  </div>
                  <div>
                    <span className="font-medium">Conditions:</span> {impactPreview.affectedConditions} {impactPreview.mode}d
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImpactPreview(!showImpactPreview)}
                  className="h-6 px-2"
                >
                  {showImpactPreview ? 'Hide' : 'Show'} Preview
                </Button>
              </div>
            )}
          </div>

          {/* Conditions List */}
          <ScrollArea className="flex-1 border rounded-md p-4">
            <div className="space-y-6">
              {Object.entries(filteredConditions).map(([category, conditions]) => {
                const IconComponent = categoryIcons[category as keyof typeof categoryIcons]
                const allSelected = conditions.every(c => isConditionSelected(c.condition))
                const someSelected = conditions.some(c => isConditionSelected(c.condition))
                
                return (
                  <div key={category} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">{categoryLabels[category as keyof typeof categoryLabels]}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {conditions.length}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCategorySelectAll(category, conditions)}
                          disabled={allSelected}
                          className="text-xs h-7"
                        >
                          <CheckSquare className="h-3 w-3 mr-1" />
                          All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCategorySelectNone(category, conditions)}
                          disabled={!someSelected}
                          className="text-xs h-7"
                        >
                          <Square className="h-3 w-3 mr-1" />
                          None
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground pl-6">
                      {categoryDescriptions[category as keyof typeof categoryDescriptions]}
                    </p>
                    
                    <div className="space-y-2 pl-6">
                      {conditions.map((conditionInfo) => (
                        <div key={conditionInfo.condition} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50">
                          <Checkbox
                            id={conditionInfo.condition}
                            checked={isConditionSelected(conditionInfo.condition)}
                            onCheckedChange={(checked) => 
                              handleConditionToggle(conditionInfo.condition, checked as boolean)
                            }
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center space-x-2">
                              <Label
                                htmlFor={conditionInfo.condition}
                                className="text-sm font-medium cursor-pointer"
                              >
                                <HighlightedText 
                                  text={conditionInfo.condition} 
                                  searchTerm={searchQuery} 
                                />
                              </Label>
                              {conditionInfo.isDeprecated && (
                                <Badge variant="destructive" className="text-xs">
                                  Deprecated
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {conditionInfo.usage} files
                              </Badge>
                            </div>
                            {conditionInfo.description && (
                              <p className="text-xs text-muted-foreground">
                                <HighlightedText 
                                  text={conditionInfo.description} 
                                  searchTerm={searchQuery} 
                                />
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <Separator />
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            {selectedMode === 'exclude' ? 'Excluding' : 'Including only'}: {totalSelected} condition{totalSelected !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <Button variant="outline" onClick={handleReset}>
              Reset to Recommended
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Continue with Selection
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      
      {/* Save Preset Dialog */}
      {showSavePresetDialog && (
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Condition Preset</DialogTitle>
            <DialogDescription>
              Save your current condition selection as a reusable preset
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g., My Custom Filter"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-description">Description (optional)</Label>
              <Input
                id="preset-description"
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="Brief description of what this preset does"
                className="w-full"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <div>Excluding: {excludeConditions.size} conditions</div>
              <div>Including: {includeConditions.size} conditions</div>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSavePresetDialog(false)
                setNewPresetName('')
                setNewPresetDescription('')
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSavePreset}
              disabled={!newPresetName.trim()}
              className="w-full sm:w-auto"
            >
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}