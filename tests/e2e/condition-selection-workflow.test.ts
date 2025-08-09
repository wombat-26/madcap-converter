import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs/promises'

// Helper to create test HTML files
async function createTestFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

test.describe('MadCap Condition Selection Workflow', () => {
  const testDir = path.join(process.cwd(), 'test-temp-e2e')
  
  test.beforeAll(async () => {
    // Create test files with various conditions
    await createTestFile(
      path.join(testDir, 'file1.html'),
      `<!DOCTYPE html>
      <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <body>
        <h1>Main Documentation</h1>
        <p>Regular content</p>
        <p madcap:conditions="Draft">Draft content here</p>
        <p data-mc-conditions="Internal">Internal documentation</p>
        <div madcap:conditions="Deprecated">Old deprecated content</div>
      </body>
      </html>`
    )
    
    await createTestFile(
      path.join(testDir, 'file2.html'),
      `<!DOCTYPE html>
      <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <body>
        <h1>Advanced Features</h1>
        <p data-mc-conditions="Beta">Beta feature documentation</p>
        <p madcap:conditions="Print-Only">This appears only in print</p>
        <section data-mc-conditions="CustomerPortal.Advanced">
          Advanced customer documentation
        </section>
      </body>
      </html>`
    )
    
    await createTestFile(
      path.join(testDir, 'file3.html'),
      `<!DOCTYPE html>
      <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <body>
        <h1>Legacy Documentation</h1>
        <p madcap:conditions="Legacy, Hidden">Hidden legacy content</p>
        <p data-mc-conditions="Red">Content marked for review</p>
        <div madcap:conditions="Maintenance">Maintenance notes</div>
      </body>
      </html>`
    )
  })
  
  test.afterAll(async () => {
    // Clean up test files
    await fs.rm(testDir, { recursive: true, force: true })
  })

  test('should complete full condition selection workflow', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3003')
    
    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('MadCap Converter')
    
    // Switch to batch conversion tab
    await page.click('button[role="tab"]:has-text("Batch Conversion")')
    
    // Upload test files
    const fileInput = await page.locator('input[type="file"]')
    const files = [
      path.join(testDir, 'file1.html'),
      path.join(testDir, 'file2.html'),
      path.join(testDir, 'file3.html')
    ]
    await fileInput.setInputFiles(files)
    
    // Wait for condition analysis to trigger
    await expect(page.locator('text=MadCap files detected')).toBeVisible({ timeout: 10000 })
    
    // Wait for the condition selection modal to appear
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).toBeVisible({ timeout: 10000 })
    
    // Verify condition discovery
    await expect(page.locator('text=/Found .* conditions in 3 files/')).toBeVisible()
    
    // Test search functionality
    const searchInput = page.locator('input[placeholder="Search conditions..."]')
    await searchInput.fill('draft')
    
    // Verify search results
    await expect(page.locator('label:has-text("Draft")')).toBeVisible()
    await expect(page.locator('label:has-text("Deprecated")')).not.toBeVisible()
    
    // Clear search
    await searchInput.clear()
    
    // Test preset selection
    await page.click('button[role="combobox"]')
    await page.click('text=Production Ready')
    
    // Verify preset application
    const deprecatedCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Deprecated') })
    const draftCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Draft') })
    const internalCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Internal') })
    
    await expect(deprecatedCheckbox).toBeChecked()
    await expect(draftCheckbox).toBeChecked()
    await expect(internalCheckbox).toBeChecked()
    
    // Test mode switching
    await page.click('button:has-text("Include Only")')
    
    // Test bulk pattern selection
    const patternInput = page.locator('input[placeholder*="deprecated|draft"]')
    await patternInput.fill('beta|print')
    await page.click('button:has-text("Apply")')
    
    // Verify pattern application
    const betaCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Beta') })
    const printCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Print-Only') })
    
    await expect(betaCheckbox).toBeChecked()
    await expect(printCheckbox).toBeChecked()
    
    // Test impact preview
    await expect(page.locator('text=/Impact:.*files/')).toBeVisible()
    
    // Test keyboard shortcuts help
    await page.click('button:has-text("Keyboard Shortcuts")')
    await expect(page.locator('text=Select All:')).toBeVisible()
    await expect(page.locator('kbd:has-text("Ctrl+A")')).toBeVisible()
    
    // Test save custom preset
    await page.click('button:has-text("Exclude")') // Switch back to exclude mode
    await page.click('label:has-text("Legacy")')
    await page.click('label:has-text("Hidden")')
    
    await page.click('button[aria-label*="Save"]')
    
    // Fill preset details
    await page.fill('input[id="preset-name"]', 'E2E Test Preset')
    await page.fill('input[id="preset-description"]', 'Custom preset for E2E testing')
    await page.click('button:has-text("Save Preset")')
    
    // Verify preset was saved
    await page.click('button[role="combobox"]')
    await expect(page.locator('text=E2E Test Preset')).toBeVisible()
    
    // Test reset functionality
    await page.click('button:has-text("Reset to Recommended")')
    
    // Verify reset
    await expect(deprecatedCheckbox).toBeChecked()
    await expect(draftCheckbox).toBeChecked()
    await expect(internalCheckbox).toBeChecked()
    
    // Confirm selection
    await page.click('button:has-text("Continue with Selection")')
    
    // Verify modal closed and conversion can proceed
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).not.toBeVisible()
    
    // Verify success notification
    await expect(page.locator('text=/Excluding .* and including .* conditions/')).toBeVisible()
  })

  test('should handle keyboard shortcuts', async ({ page }) => {
    await page.goto('http://localhost:3003')
    
    // Switch to batch conversion and upload files
    await page.click('button[role="tab"]:has-text("Batch Conversion")')
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles([path.join(testDir, 'file1.html')])
    
    // Wait for modal
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).toBeVisible({ timeout: 10000 })
    
    // Test Ctrl+A (Select All)
    await page.keyboard.press('Control+a')
    
    // Verify all checkboxes are checked
    const checkboxes = await page.locator('input[type="checkbox"]').all()
    for (const checkbox of checkboxes) {
      await expect(checkbox).toBeChecked()
    }
    
    // Test Ctrl+D (Deselect All)
    await page.keyboard.press('Control+d')
    
    // Verify all checkboxes are unchecked
    for (const checkbox of checkboxes) {
      await expect(checkbox).not.toBeChecked()
    }
    
    // Test number key for preset selection
    await page.keyboard.press('1') // Should select first preset (Production Ready)
    
    // Verify preset is selected
    const presetValue = await page.locator('button[role="combobox"]').textContent()
    expect(presetValue).toContain('Production Ready')
    
    // Test Escape to close
    await page.keyboard.press('Escape')
    
    // Verify modal is closed
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).not.toBeVisible()
  })

  test('should handle empty condition analysis gracefully', async ({ page }) => {
    // Create a file without conditions
    const noConditionsFile = path.join(testDir, 'no-conditions.html')
    await createTestFile(
      noConditionsFile,
      `<!DOCTYPE html>
      <html>
      <body>
        <h1>Document without conditions</h1>
        <p>Just regular content here</p>
      </body>
      </html>`
    )
    
    await page.goto('http://localhost:3003')
    await page.click('button[role="tab"]:has-text("Batch Conversion")')
    
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles([noConditionsFile])
    
    // Should not show the modal if no conditions are found
    await page.waitForTimeout(2000) // Wait a bit to ensure no modal appears
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).not.toBeVisible()
  })

  test('should maintain state across mode switches', async ({ page }) => {
    await page.goto('http://localhost:3003')
    await page.click('button[role="tab"]:has-text("Batch Conversion")')
    
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles([path.join(testDir, 'file1.html')])
    
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).toBeVisible({ timeout: 10000 })
    
    // Select some conditions in exclude mode
    await page.click('label:has-text("Draft")')
    await page.click('label:has-text("Internal")')
    
    // Switch to include mode
    await page.click('button:has-text("Include Only")')
    
    // Select different conditions
    await page.click('label:has-text("Deprecated")')
    
    // Switch back to exclude mode
    await page.click('button:has-text("Exclude")')
    
    // Original selections should be maintained
    const draftCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Draft') })
    const internalCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('text=Internal') })
    
    await expect(draftCheckbox).toBeChecked()
    await expect(internalCheckbox).toBeChecked()
  })

  test('should handle responsive layout on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('http://localhost:3003')
    await page.click('button[role="tab"]:has-text("Batch Conversion")')
    
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles([path.join(testDir, 'file1.html')])
    
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).toBeVisible({ timeout: 10000 })
    
    // Verify mobile-friendly layout
    // Check that elements stack vertically
    const modalContent = page.locator('[role="dialog"] > div')
    await expect(modalContent).toBeVisible()
    
    // Verify buttons are full width on mobile
    const buttons = page.locator('[role="dialog"] button')
    const firstButton = buttons.first()
    const buttonBox = await firstButton.boundingBox()
    
    // Button should be nearly full width (accounting for padding)
    expect(buttonBox?.width).toBeGreaterThan(300)
    
    // Test that all functionality works on mobile
    await page.click('button[role="combobox"]')
    await page.click('text=Production Ready')
    await page.click('button:has-text("Continue with Selection")')
    
    await expect(page.locator('h2:has-text("Select MadCap Conditions")')).not.toBeVisible()
  })
})