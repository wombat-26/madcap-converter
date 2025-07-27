/**
 * @jest-environment node
 */

import { MathNotationHandler } from '../../src/core/converters/math-notation-handler.js';
import { CitationHandler } from '../../src/core/converters/citation-handler.js';
import { PerformanceOptimizer } from '../../src/core/converters/performance-optimizer.js';
import { JSDOM } from 'jsdom';

describe('Specialized Content Handlers', () => {
  describe('MathNotationHandler', () => {
    let mathHandler: MathNotationHandler;

    beforeEach(() => {
      mathHandler = new MathNotationHandler();
    });

    it('should convert LaTeX inline math to AsciiDoc format', () => {
      const input = 'The equation $E = mc^2$ represents mass-energy equivalence.';
      const result = mathHandler.convertForAsciiDoc(input);
      
      expect(result).toContain('latexmath:[E = mc^2]');
      expect(result).not.toContain('$E = mc^2$');
    });

    it('should convert LaTeX display math to AsciiDoc format', () => {
      const input = '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$';
      const result = mathHandler.convertForAsciiDoc(input);
      
      expect(result).toContain('[latexmath]');
      expect(result).toContain('++++');
      expect(result).toContain('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
    });

    it('should convert HTML subscript and superscript', () => {
      const input = 'Water is H<sub>2</sub>O and E = mc<sup>2</sup>.';
      const result = mathHandler.convertForAsciiDoc(input);
      
      expect(result).toContain('H~2~O');
      expect(result).toContain('mc^2^');
    });

    it('should convert scientific notation', () => {
      const input = 'Speed of light: 3.0 × 10^8 m/s';
      const result = mathHandler.convertForAsciiDoc(input);
      
      expect(result).toContain('3.0 × 10^8^');
    });

    it('should detect mathematical notation in content', () => {
      expect(mathHandler.containsMathNotation('$E = mc^2$')).toBe(true);
      expect(mathHandler.containsMathNotation('H<sub>2</sub>O')).toBe(true);
      expect(mathHandler.containsMathNotation('π ≈ 3.14')).toBe(true);
      expect(mathHandler.containsMathNotation('Regular text')).toBe(false);
    });

    it('should convert math for Markdown format', () => {
      const input = 'Formula: $x^2 + y^2 = z^2$ and H<sub>2</sub>O';
      const result = mathHandler.convertForMarkdown(input);
      
      expect(result).toContain('$x^2 + y^2 = z^2$');
      expect(result).toContain('<sub>2</sub>');
    });

    it('should process math in document elements', () => {
      const dom = new JSDOM(`
        <html>
          <body>
            <p>The equation $E = mc^2$ is famous.</p>
            <div>Also: <sup>2</sup> and <sub>x</sub></div>
          </body>
        </html>
      `);
      
      mathHandler.processMathInDocument(dom.window.document, 'asciidoc');
      
      const body = dom.window.document.body;
      expect(body?.innerHTML).toContain('latexmath:');
      expect(body?.innerHTML).toContain('^2^');
      expect(body?.innerHTML).toContain('~x~');
    });
  });

  describe('CitationHandler', () => {
    let citationHandler: CitationHandler;

    beforeEach(() => {
      citationHandler = new CitationHandler();
    });

    it('should process HTML footnotes', () => {
      const input = `<p>This has a footnote<a href="#fn1">1</a>.</p><div id="fn1"><p>This is the footnote content.</p></div>`;
      
      const result = citationHandler.processCitations(input, 'asciidoc');
      
      expect(result.processedContent).toContain('footnote:[');
      expect(result.processedContent).toContain('This is the footnote content');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].type).toBe('footnote');
    });

    it('should process academic citations', () => {
      const input = 'Recent studies (Smith, 2023) show improvements.';
      
      const result = citationHandler.processCitations(input, 'asciidoc');
      
      expect(result.processedContent).toContain('<<');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].authors).toContain('Smith');
      expect(result.citations[0].year).toBe('2023');
    });

    it('should process numeric references', () => {
      const input = 'The methodology is described elsewhere [1].';
      
      const result = citationHandler.processCitations(input, 'asciidoc');
      
      expect(result.processedContent).toContain('<<ref_1,[1]>>');
    });

    it('should process bibliography entries', () => {
      const input = `<div class="bibliography"><p>Smith, J. (2023). "Advanced Processing" in Journal of Computing. DOI: 10.1000/example</p></div>`;
      
      const result = citationHandler.processCitations(input, 'asciidoc');
      
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].type).toBe('bibliography');
      expect(result.citations[0].doi).toBe('10.1000/example');
    });

    it('should generate citations section for AsciiDoc', () => {
      const input = `
        <p>Reference (Smith, 2023) here.</p>
        <div class="bibliography">
          <p>Smith, J. (2023). Test Article.</p>
        </div>
      `;
      
      const result = citationHandler.processCitations(input, 'asciidoc');
      
      expect(result.processedContent).toContain('== References');
      expect(result.citations.length).toBeGreaterThan(0);
    });

    it('should detect citations in content', () => {
      expect(citationHandler.containsCitations('<a href="#fn1">1</a>')).toBe(true);
      expect(citationHandler.containsCitations('(Smith, 2023)')).toBe(true);
      expect(citationHandler.containsCitations('[1]')).toBe(true);
      expect(citationHandler.containsCitations('Regular text')).toBe(false);
    });

    it('should process citations in document elements', () => {
      const dom = new JSDOM(`
        <html>
          <body>
            <p>Citation example (Johnson, 2022).</p>
            <p>Also see [1] for details.</p>
          </body>
        </html>
      `);
      
      const result = citationHandler.processCitationsInDocument(dom.window.document, 'asciidoc');
      
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.processedContent).toContain('<<');
    });
  });

  describe('PerformanceOptimizer', () => {
    let performanceOptimizer: PerformanceOptimizer;

    beforeEach(() => {
      performanceOptimizer = new PerformanceOptimizer();
    });

    it('should process small documents normally', async () => {
      const smallInput = '<h1>Small Document</h1><p>Short content.</p>';
      const mockProcessor = jest.fn().mockResolvedValue('= Small Document\n\nShort content.');
      
      const result = await performanceOptimizer.optimizeDocumentProcessing(
        smallInput,
        mockProcessor
      );
      
      expect(result.optimizedContent).toContain('= Small Document');
      expect(result.metrics.contentSize).toBe(smallInput.length);
      expect(result.warnings).toHaveLength(0);
      expect(mockProcessor).toHaveBeenCalledTimes(1);
    });

    it('should optimize large documents with chunking', async () => {
      // Create large input (>50KB)
      const largeInput = Array.from({ length: 2000 }, (_, i) => 
        `<h2>Section ${i}</h2><p>Content for section ${i} with substantial text.</p>`
      ).join('\n');
      
      const mockProcessor = jest.fn().mockImplementation(async (chunk: string) => 
        chunk.replace(/<h2>/g, '== ').replace(/<\/h2>/g, '\n\n')
      );
      
      const result = await performanceOptimizer.optimizeDocumentProcessing(
        largeInput,
        mockProcessor
      );
      
      expect(result.optimizedContent).toContain('== Section');
      expect(result.metrics.contentSize).toBe(largeInput.length);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large document detected');
      expect(mockProcessor).toHaveBeenCalled();
    });

    it('should optimize DOM processing', () => {
      const dom = new JSDOM(`
        <html>
          <body>
            <div style="">
              <p class="">   </p>
              <span style="color: red;">Content</span>
            </div>
          </body>
        </html>
      `);
      
      performanceOptimizer.optimizeDOMProcessing(dom.window.document);
      
      // Should have cleaned up empty attributes
      const divs = dom.window.document.querySelectorAll('div[style=""]');
      const paragraphs = dom.window.document.querySelectorAll('p[class=""]');
      
      expect(divs).toHaveLength(0);
      expect(paragraphs).toHaveLength(0);
    });

    it('should handle performance metrics correctly', async () => {
      const input = '<h1>Test</h1><p>Content for metrics testing.</p>';
      const mockProcessor = jest.fn().mockResolvedValue('= Test\n\nContent for metrics testing.');
      
      const result = await performanceOptimizer.optimizeDocumentProcessing(
        input,
        mockProcessor
      );
      
      expect(result.metrics).toHaveProperty('contentSize');
      expect(result.metrics).toHaveProperty('elementCount');
      expect(result.metrics).toHaveProperty('processingTime');
      expect(result.metrics).toHaveProperty('memoryUsage');
      
      expect(result.metrics.contentSize).toBe(input.length);
      expect(result.metrics.elementCount).toBeGreaterThan(0);
      expect(result.metrics.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle processing errors gracefully', async () => {
      const input = '<h1>Test Document</h1>';
      const mockProcessor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      await expect(
        performanceOptimizer.optimizeDocumentProcessing(input, mockProcessor)
      ).rejects.toThrow('Processing failed');
    });
  });

  describe('Integration Tests', () => {
    it('should work together for complex content', async () => {
      const mathHandler = new MathNotationHandler();
      const citationHandler = new CitationHandler();
      
      const input = `
        <h1>Mathematical Research Paper</h1>
        <p>The equation $E = mc^2$ was derived by Einstein (Smith, 2023).</p>
        <p>For more complex cases: $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$</p>
        <p>Also see H<sub>2</sub>O for chemical examples.</p>
      `;
      
      // Process math first
      const mathProcessed = mathHandler.convertForAsciiDoc(input);
      
      // Then process citations
      const citationResult = citationHandler.processCitations(mathProcessed, 'asciidoc');
      
      expect(citationResult.processedContent).toContain('latexmath:');
      expect(citationResult.processedContent).toContain('H~2~O');
      expect(citationResult.processedContent).toContain('<<');
      expect(citationResult.citations.length).toBeGreaterThan(0);
    });

    it('should handle performance optimization with specialized content', async () => {
      const performanceOptimizer = new PerformanceOptimizer();
      const mathHandler = new MathNotationHandler();
      
      // Create large document with math content
      const largeInput = Array.from({ length: 200 }, (_, i) => 
        `<h2>Section ${i}</h2><p>Formula: $x_{${i}} = \\sqrt{${i}^2 + 1}$</p>`
      ).join('\n');
      
      const mockProcessor = jest.fn().mockImplementation(async (chunk: string) => {
        return mathHandler.convertForAsciiDoc(chunk);
      });
      
      const result = await performanceOptimizer.optimizeDocumentProcessing(
        largeInput,
        mockProcessor
      );
      
      expect(result.optimizedContent).toContain('latexmath:');
      expect(result.metrics.contentSize).toBe(largeInput.length);
      expect(mockProcessor).toHaveBeenCalled();
    });
  });
});