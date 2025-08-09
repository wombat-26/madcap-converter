import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/analyze-conditions/route'

// Mock the ConditionAnalyzer
jest.mock('@/src/core/services/condition-analyzer', () => ({
  ConditionAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeFiles: jest.fn().mockResolvedValue({
      conditions: ['Draft', 'Internal', 'Deprecated', 'Beta', 'Print-Only'],
      fileCount: 3,
      conditionUsage: {
        'Draft': 2,
        'Internal': 1,
        'Deprecated': 1,
        'Beta': 2,
        'Print-Only': 1
      },
      filesByCondition: {
        'Draft': ['file1.html', 'file2.html'],
        'Internal': ['file1.html'],
        'Deprecated': ['file3.html'],
        'Beta': ['file2.html', 'file3.html'],
        'Print-Only': ['file1.html']
      }
    }),
    getConditionInfo: jest.fn().mockImplementation((condition, usage) => ({
      condition,
      usage,
      category: condition.toLowerCase().includes('draft') || condition.toLowerCase().includes('internal') 
        ? 'development' 
        : condition.toLowerCase().includes('deprecated') 
          ? 'status' 
          : condition.toLowerCase().includes('print') 
            ? 'print' 
            : 'custom',
      isDeprecated: condition.toLowerCase().includes('deprecated'),
      description: `${condition} condition for testing`
    }))
  }))
}))

// Mock file system operations
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined)
}))

describe('Analyze Conditions API', () => {
  describe('POST /api/analyze-conditions', () => {
    it('should analyze conditions from valid HTML files', async () => {
      const mockFiles = [
        {
          name: 'test1.html',
          content: '<p data-mc-conditions="Draft">Draft content</p>',
          isBase64: false
        },
        {
          name: 'test2.html',
          content: '<div madcap:conditions="Internal, Beta">Internal beta content</div>',
          isBase64: false
        },
        {
          name: 'test3.html',
          content: '<span data-mc-conditions="Deprecated, Beta">Deprecated content</span>',
          isBase64: false
        }
      ]

      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          files: mockFiles,
          sessionId: 'test-session-123'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.analysis).toBeDefined()
      expect(data.analysis.totalConditions).toBe(5)
      expect(data.analysis.filesAnalyzed).toBe(3)
      expect(data.analysis.conditionsByCategory).toBeDefined()
      expect(data.analysis.recommendedExclusions).toContain('Deprecated')
    })

    it('should handle base64 encoded files', async () => {
      const htmlContent = '<p data-mc-conditions="Print-Only">Print content</p>'
      const base64Content = Buffer.from(htmlContent).toString('base64')

      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          files: [{
            name: 'test-base64.html',
            content: base64Content,
            isBase64: true
          }]
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return error for empty file list', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          files: []
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('At least one file is required')
    })

    it('should handle invalid request data', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required 'files' field
          sessionId: 'test'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('should categorize conditions correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          files: [{
            name: 'test.html',
            content: '<div data-mc-conditions="Draft, Deprecated, Print-Only">Mixed content</div>'
          }]
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.analysis.conditionsByCategory).toHaveProperty('development')
      expect(data.analysis.conditionsByCategory).toHaveProperty('status')
      expect(data.analysis.conditionsByCategory).toHaveProperty('print')
      
      // Check that conditions are in the correct categories
      const devConditions = data.analysis.conditionsByCategory.development.map(c => c.condition)
      const statusConditions = data.analysis.conditionsByCategory.status.map(c => c.condition)
      const printConditions = data.analysis.conditionsByCategory.print.map(c => c.condition)
      
      expect(devConditions).toContain('Draft')
      expect(statusConditions).toContain('Deprecated')
      expect(printConditions).toContain('Print-Only')
    })

    it('should sort conditions by usage within categories', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze-conditions', {
        method: 'POST',
        body: JSON.stringify({
          files: [
            { name: 'test1.html', content: '<p data-mc-conditions="Draft">1</p>' },
            { name: 'test2.html', content: '<p data-mc-conditions="Draft, Beta">2</p>' },
            { name: 'test3.html', content: '<p data-mc-conditions="Beta">3</p>' }
          ]
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Draft has usage 2, Beta has usage 2, but they should be sorted consistently
      const conditions = data.analysis.conditionsWithInfo
      expect(conditions).toBeDefined()
      expect(conditions.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/analyze-conditions', () => {
    it('should return health check information', async () => {
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.service).toBe('MadCap Condition Analyzer')
      expect(data.version).toBe('1.0.0')
      expect(data.status).toBe('ready')
    })
  })
})