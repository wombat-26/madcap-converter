import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConditionSelectionModal } from '@/components/ConditionSelectionModal'
import { ConditionPresetManager } from '@/lib/condition-presets'

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock the preset manager
jest.mock('@/lib/condition-presets', () => {
  const mockPresets = [
    {
      id: 'production',
      name: 'Production Ready',
      description: 'Exclude all deprecated, draft, and internal content',
      icon: '🚀',
      excludeConditions: ['Deprecated', 'Draft', 'Internal'],
      includeConditions: [],
      isBuiltIn: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    },
    {
      id: 'draft-review',
      name: 'Draft Review',
      description: 'Show only draft content',
      icon: '📝',
      excludeConditions: [],
      includeConditions: ['Draft', 'Beta'],
      isBuiltIn: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
  ]

  return {
    ConditionPresetManager: {
      getAllPresets: jest.fn(() => mockPresets),
      getLastUsedPreset: jest.fn(() => null),
      setLastUsedPreset: jest.fn(),
      saveCustomPreset: jest.fn((preset) => ({
        ...preset,
        id: 'custom-123',
        isBuiltIn: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      }))
    }
  }
})

describe('ConditionSelectionModal', () => {
  const mockOnClose = jest.fn()
  const mockOnConfirm = jest.fn()
  
  const mockAnalysisResult = {
    conditions: ['Deprecated', 'Draft', 'Internal', 'Beta', 'Print-Only', 'Red'],
    fileCount: 10,
    conditionUsage: {
      'Deprecated': 5,
      'Draft': 8,
      'Internal': 3,
      'Beta': 2,
      'Print-Only': 4,
      'Red': 1
    },
    filesByCondition: {
      'Deprecated': ['file1.html', 'file2.html'],
      'Draft': ['file1.html', 'file3.html'],
      'Internal': ['file2.html'],
      'Beta': ['file4.html'],
      'Print-Only': ['file5.html'],
      'Red': ['file6.html']
    },
    conditionsByCategory: {
      status: [
        { condition: 'Deprecated', usage: 5, category: 'status', isDeprecated: true, files: ['file1.html', 'file2.html'] },
        { condition: 'Beta', usage: 2, category: 'status', files: ['file4.html'] }
      ],
      development: [
        { condition: 'Draft', usage: 8, category: 'development', files: ['file1.html', 'file3.html'] },
        { condition: 'Internal', usage: 3, category: 'development', files: ['file2.html'] }
      ],
      print: [
        { condition: 'Print-Only', usage: 4, category: 'print', files: ['file5.html'] }
      ],
      color: [
        { condition: 'Red', usage: 1, category: 'color', files: ['file6.html'] }
      ]
    },
    conditionsWithInfo: [],
    recommendedExclusions: ['Deprecated', 'Draft', 'Internal'],
    totalConditions: 6,
    filesAnalyzed: 10
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render loading state when isLoading is true', () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={null}
          isLoading={true}
        />
      )
      
      expect(screen.getByText('Analyzing MadCap Conditions...')).toBeInTheDocument()
      expect(screen.getByText('Analyzing conditions...')).toBeInTheDocument()
    })

    it('should return null when analysisResult is null and not loading', () => {
      const { container } = render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={null}
          isLoading={false}
        />
      )
      
      expect(container.firstChild).toBeNull()
    })

    it('should render modal with analysis results', () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      expect(screen.getByText('Select MadCap Conditions')).toBeInTheDocument()
      expect(screen.getByText(/Found 6 conditions in 10 files/)).toBeInTheDocument()
    })
  })

  describe('Condition Selection', () => {
    it('should select conditions in exclude mode by default', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      await userEvent.click(deprecatedCheckbox)
      
      expect(deprecatedCheckbox).toBeChecked()
    })

    it('should switch between exclude and include modes', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const includeModeButton = screen.getByRole('button', { name: /Include Only/i })
      await userEvent.click(includeModeButton)
      
      expect(includeModeButton).toHaveClass('bg-primary') // Active state
    })

    it('should handle category select all/none', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Find the "All" button for the status category
      const allButtons = screen.getAllByRole('button', { name: /All/i })
      const statusAllButton = allButtons[0] // Assuming status category is first
      
      await userEvent.click(statusAllButton)
      
      // Check that all status conditions are selected
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      const betaCheckbox = screen.getByRole('checkbox', { name: /Beta/i })
      
      expect(deprecatedCheckbox).toBeChecked()
      expect(betaCheckbox).toBeChecked()
    })
  })

  describe('Search Functionality', () => {
    it('should filter conditions based on search query', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search conditions...')
      await userEvent.type(searchInput, 'draft')
      
      // Draft should be visible
      expect(screen.getByText('Draft')).toBeInTheDocument()
      
      // Other conditions should not be visible
      expect(screen.queryByText('Deprecated')).not.toBeInTheDocument()
      expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    })

    it('should highlight search terms', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search conditions...')
      await userEvent.type(searchInput, 'dep')
      
      // Check for highlighted text (mark element)
      const highlightedText = screen.getByText((content, element) => {
        return element?.tagName === 'MARK' && content === 'Dep'
      })
      
      expect(highlightedText).toBeInTheDocument()
    })
  })

  describe('Preset Management', () => {
    it('should load and display presets', () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      expect(ConditionPresetManager.getAllPresets).toHaveBeenCalled()
    })

    it('should apply preset when selected', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Open preset dropdown
      const presetTrigger = screen.getByRole('combobox')
      await userEvent.click(presetTrigger)
      
      // Select production preset
      const productionPreset = screen.getByText('Production Ready')
      await userEvent.click(productionPreset)
      
      // Check that the appropriate conditions are selected
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      const draftCheckbox = screen.getByRole('checkbox', { name: /Draft/i })
      const internalCheckbox = screen.getByRole('checkbox', { name: /Internal/i })
      
      expect(deprecatedCheckbox).toBeChecked()
      expect(draftCheckbox).toBeChecked()
      expect(internalCheckbox).toBeChecked()
    })

    it('should save custom preset', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Select some conditions
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      await userEvent.click(deprecatedCheckbox)
      
      // Open save preset dialog
      const saveButton = screen.getByRole('button', { name: /Save/i })
      await userEvent.click(saveButton)
      
      // Fill in preset details
      const nameInput = screen.getByLabelText('Preset Name')
      await userEvent.type(nameInput, 'My Custom Preset')
      
      const descriptionInput = screen.getByLabelText('Description (optional)')
      await userEvent.type(descriptionInput, 'Custom filtering rules')
      
      // Save the preset
      const savePresetButton = screen.getByRole('button', { name: 'Save Preset' })
      await userEvent.click(savePresetButton)
      
      expect(ConditionPresetManager.saveCustomPreset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Custom Preset',
          description: 'Custom filtering rules',
          excludeConditions: ['Deprecated']
        })
      )
    })
  })

  describe('Bulk Pattern Selection', () => {
    it('should select conditions matching pattern', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const patternInput = screen.getByPlaceholderText(/e\.g\., \^\(deprecated\|draft\)/i)
      await userEvent.type(patternInput, 'draft|beta')
      
      const applyButton = screen.getByRole('button', { name: 'Apply' })
      await userEvent.click(applyButton)
      
      // Check that matching conditions are selected
      const draftCheckbox = screen.getByRole('checkbox', { name: /Draft/i })
      const betaCheckbox = screen.getByRole('checkbox', { name: /Beta/i })
      
      expect(draftCheckbox).toBeChecked()
      expect(betaCheckbox).toBeChecked()
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should toggle keyboard help', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      const helpButton = screen.getByRole('button', { name: /Keyboard Shortcuts/i })
      await userEvent.click(helpButton)
      
      // Check that help content is visible
      expect(screen.getByText('Select All:')).toBeInTheDocument()
      expect(screen.getByText('Ctrl+A')).toBeInTheDocument()
    })

    it('should handle Ctrl+A to select all', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Press Ctrl+A
      fireEvent.keyDown(document, { key: 'a', ctrlKey: true })
      
      // All checkboxes should be checked
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked()
      })
    })

    it('should handle Escape to close modal', () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      fireEvent.keyDown(document, { key: 'Escape' })
      
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should handle Ctrl+Enter to confirm', () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
      
      expect(mockOnConfirm).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Impact Preview', () => {
    it('should display impact statistics', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Select some conditions
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      await userEvent.click(deprecatedCheckbox)
      
      // Check impact preview
      expect(screen.getByText(/Impact:/)).toBeInTheDocument()
      expect(screen.getByText(/files/)).toBeInTheDocument()
    })
  })

  describe('Confirmation and Reset', () => {
    it('should call onConfirm with selected conditions', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Select some conditions
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      const draftCheckbox = screen.getByRole('checkbox', { name: /Draft/i })
      await userEvent.click(deprecatedCheckbox)
      await userEvent.click(draftCheckbox)
      
      // Confirm selection
      const confirmButton = screen.getByRole('button', { name: 'Continue with Selection' })
      await userEvent.click(confirmButton)
      
      expect(mockOnConfirm).toHaveBeenCalledWith({
        excludeConditions: ['Deprecated', 'Draft'],
        includeConditions: []
      })
    })

    it('should reset to recommended exclusions', async () => {
      render(
        <ConditionSelectionModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          analysisResult={mockAnalysisResult}
        />
      )
      
      // Select different conditions
      const betaCheckbox = screen.getByRole('checkbox', { name: /Beta/i })
      await userEvent.click(betaCheckbox)
      
      // Reset
      const resetButton = screen.getByRole('button', { name: 'Reset to Recommended' })
      await userEvent.click(resetButton)
      
      // Check that recommended conditions are selected
      const deprecatedCheckbox = screen.getByRole('checkbox', { name: /Deprecated/i })
      const draftCheckbox = screen.getByRole('checkbox', { name: /Draft/i })
      const internalCheckbox = screen.getByRole('checkbox', { name: /Internal/i })
      
      expect(deprecatedCheckbox).toBeChecked()
      expect(draftCheckbox).toBeChecked()
      expect(internalCheckbox).toBeChecked()
      expect(betaCheckbox).not.toBeChecked()
    })
  })
})