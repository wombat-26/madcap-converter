/**
 * Specialized test cases for conversion functionality
 * These provide specific scenarios for testing edge cases and advanced features
 */

export interface ConversionTestCase {
  name: string;
  description: string;
  input: string;
  expectedOutput?: string;
  format?: 'asciidoc' | 'writerside-markdown' | 'zendesk';
  options?: any;
  shouldFail?: boolean;
  expectedError?: string;
}

/**
 * Table conversion test cases
 */
export const tableTestCases: ConversionTestCase[] = [
  {
    name: 'Simple Table',
    description: 'Basic table with headers and data',
    input: `<table>
  <thead>
    <tr><th>Name</th><th>Age</th><th>City</th></tr>
  </thead>
  <tbody>
    <tr><td>John</td><td>30</td><td>New York</td></tr>
    <tr><td>Jane</td><td>25</td><td>Boston</td></tr>
  </tbody>
</table>`,
    expectedOutput: `|===
| Name | Age | City

| John | 30 | New York
| Jane | 25 | Boston
|===`,
    format: 'asciidoc'
  },
  {
    name: 'Table with Complex Formatting',
    description: 'Table with colspan, rowspan, and formatting',
    input: `<table class="TableStyle-BasicTable">
  <colgroup>
    <col style="width: 40%;">
    <col style="width: 30%;">
    <col style="width: 30%;">
  </colgroup>
  <thead>
    <tr>
      <th colspan="2">Combined Header</th>
      <th>Single Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Bold Text</strong></td>
      <td><em>Italic Text</em></td>
      <td rowspan="2">Spanning Cell</td>
    </tr>
    <tr>
      <td>Normal Text</td>
      <td><code>Code Text</code></td>
    </tr>
  </tbody>
</table>`,
    format: 'asciidoc'
  },
  {
    name: 'MadCap Styled Table',
    description: 'Table with MadCap-specific styling classes',
    input: `<table class="TableStyle-BasicTable" style="mc-table-style: url('../Resources/TableStyles/BasicTable.css');">
  <thead>
    <tr class="TableStyle-BasicTable-Head-Header1">
      <th class="TableStyle-BasicTable-HeadE-Column1-Header1">Feature</th>
      <th class="TableStyle-BasicTable-HeadD-Column2-Header1">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr class="TableStyle-BasicTable-Body-Body1">
      <td class="TableStyle-BasicTable-BodyE-Column1-Body1">Authentication</td>
      <td class="TableStyle-BasicTable-BodyD-Column2-Body1">User login system</td>
    </tr>
  </tbody>
</table>`,
    format: 'asciidoc'
  }
];

/**
 * List conversion test cases
 */
export const listTestCases: ConversionTestCase[] = [
  {
    name: 'Nested Ordered Lists',
    description: 'Complex nested ordered lists with alphabetic sub-items',
    input: `<ol>
  <li>First main item
    <ol style="list-style-type: lower-alpha;">
      <li>Sub-item a</li>
      <li>Sub-item b</li>
    </ol>
  </li>
  <li>Second main item</li>
  <li>Third main item
    <ol style="list-style-type: lower-alpha;">
      <li>Another sub-item a</li>
      <li>Another sub-item b</li>
    </ol>
  </li>
</ol>`,
    expectedOutput: `. First main item
[loweralpha]
.. Sub-item a
.. Sub-item b

. Second main item
. Third main item
[loweralpha]
.. Another sub-item a
.. Another sub-item b`,
    format: 'asciidoc'
  },
  {
    name: 'Mixed List Types',
    description: 'Combination of ordered and unordered lists',
    input: `<ol>
  <li>Ordered item 1
    <ul>
      <li>Unordered sub-item</li>
      <li>Another unordered sub-item</li>
    </ul>
  </li>
  <li>Ordered item 2</li>
</ol>

<ul>
  <li>Unordered item
    <ol>
      <li>Ordered sub-item</li>
      <li>Another ordered sub-item</li>
    </ol>
  </li>
</ul>`,
    format: 'asciidoc'
  },
  {
    name: 'List with Continue Content',
    description: 'Lists with paragraphs and other content between items',
    input: `<ol>
  <li>First item
    <p>Additional paragraph for first item.</p>
    <p>Another paragraph with more details.</p>
  </li>
  <li>Second item
    <p>Paragraph for second item.</p>
    <ul>
      <li>Nested unordered item</li>
    </ul>
  </li>
</ol>`,
    format: 'asciidoc'
  }
];

/**
 * MadCap-specific element test cases
 */
export const madcapTestCases: ConversionTestCase[] = [
  {
    name: 'MadCap Dropdown',
    description: 'MadCap dropdown/expanding section',
    input: `<MadCap:dropDown>
  <MadCap:dropDownHead>
    <MadCap:dropDownHotspot>Click to Expand</MadCap:dropDownHotspot>
  </MadCap:dropDownHead>
  <MadCap:dropDownBody>
    <p>This content is hidden by default and revealed when clicked.</p>
    <ul>
      <li>Hidden list item 1</li>
      <li>Hidden list item 2</li>
    </ul>
  </MadCap:dropDownBody>
</MadCap:dropDown>`,
    expectedOutput: `=== Click to Expand

This content is hidden by default and revealed when clicked.

* Hidden list item 1
* Hidden list item 2`,
    format: 'asciidoc'
  },
  {
    name: 'MadCap Variables',
    description: 'Variable references in content',
    input: `<p>Welcome to <span data-mc-variable="General.ProductName">Product Name</span>!</p>
<p>Version <span data-mc-variable="General.Version">1.0</span> was released on <span data-mc-variable="General.ReleaseDate">January 2024</span>.</p>
<p>Contact us at <span data-mc-variable="General.SupportEmail">support@example.com</span>.</p>`,
    format: 'asciidoc'
  },
  {
    name: 'MadCap Conditions',
    description: 'Conditional content with data-mc-conditions',
    input: `<p>This content appears for everyone.</p>
<div data-mc-conditions="web">
  <p>This content only appears in web output.</p>
</div>
<p data-mc-conditions="mobile">This paragraph is mobile-only.</p>
<div data-mc-conditions="deprecated">
  <p>This deprecated content should be excluded.</p>
</div>`,
    format: 'asciidoc'
  },
  {
    name: 'MadCap Keyboard Elements',
    description: 'Keyboard shortcut formatting',
    input: `<p>Press <span class="Keyboard">Ctrl+S</span> to save your work.</p>
<p>Use <span class="Keyboard">Alt+Tab</span> to switch between applications.</p>
<p>Press <span class="Keyboard">Enter</span> to confirm your selection.</p>
<p>The <span class="Keyboard">…</span> menu provides additional options.</p>`,
    expectedOutput: `Press kbd:[Ctrl+S] to save your work.

Use kbd:[Alt+Tab] to switch between applications.

Press kbd:[Enter] to confirm your selection.

The kbd:[...] menu provides additional options.`,
    format: 'asciidoc'
  }
];

/**
 * Admonition test cases
 */
export const admonitionTestCases: ConversionTestCase[] = [
  {
    name: 'Note Admonition',
    description: 'MadCap note styling',
    input: `<div class="mc-note">
  <p>This is an important note that readers should pay attention to.</p>
</div>`,
    expectedOutput: `[NOTE]
====
This is an important note that readers should pay attention to.
====`,
    format: 'asciidoc'
  },
  {
    name: 'Warning Admonition',
    description: 'MadCap warning styling',
    input: `<div class="mc-warning">
  <p>Warning: This action cannot be undone.</p>
  <p>Please proceed with caution.</p>
</div>`,
    expectedOutput: `[WARNING]
====
Warning: This action cannot be undone.

Please proceed with caution.
====`,
    format: 'asciidoc'
  },
  {
    name: 'Tip Admonition',
    description: 'MadCap tip styling',
    input: `<div class="mc-tip">
  <p>Tip: You can use keyboard shortcuts to work more efficiently.</p>
</div>`,
    expectedOutput: `[TIP]
====
Tip: You can use keyboard shortcuts to work more efficiently.
====`,
    format: 'asciidoc'
  },
  {
    name: 'Caution Admonition',
    description: 'MadCap caution styling',
    input: `<div class="mc-caution">
  <p>Caution: Ensure all connections are secure before proceeding.</p>
</div>`,
    expectedOutput: `[CAUTION]
====
Caution: Ensure all connections are secure before proceeding.
====`,
    format: 'asciidoc'
  }
];

/**
 * Image handling test cases
 */
export const imageTestCases: ConversionTestCase[] = [
  {
    name: 'Block Image',
    description: 'Image in its own paragraph (block image)',
    input: `<p><img src="../Images/screenshot.png" alt="Application Screenshot" /></p>`,
    expectedOutput: `image::../Images/screenshot.png[Application Screenshot]`,
    format: 'asciidoc'
  },
  {
    name: 'Inline Image',
    description: 'Image within text content (inline image)',
    input: `<p>Click the <img src="../Images/save-icon.png" alt="Save" class="IconInline" /> icon to save your work.</p>`,
    expectedOutput: `Click the image:../Images/save-icon.png[Save,16,16] icon to save your work.`,
    format: 'asciidoc'
  },
  {
    name: 'Image with Size Attributes',
    description: 'Image with explicit width and height',
    input: `<p><img src="../Images/diagram.png" alt="System Diagram" width="400" height="300" /></p>`,
    expectedOutput: `image::../Images/diagram.png[System Diagram,400,300]`,
    format: 'asciidoc'
  },
  {
    name: 'UI Icon Image',
    description: 'Small UI icon image',
    input: `<p>Navigate to <img src="../Images/GUI/menu-icon.png" alt="Menu" /> Settings.</p>`,
    expectedOutput: `Navigate to image:../Images/GUI/menu-icon.png[Menu,18,18] Settings.`,
    format: 'asciidoc'
  }
];

/**
 * Error handling test cases
 */
export const errorTestCases: ConversionTestCase[] = [
  {
    name: 'Empty Content',
    description: 'Empty or whitespace-only content',
    input: '   \n  \t  \n   ',
    shouldFail: true,
    expectedError: 'No content to convert'
  },
  {
    name: 'Invalid HTML Structure',
    description: 'Severely malformed HTML',
    input: '<h1>Unclosed header <p>Paragraph without closing <div>Unclosed div',
    shouldFail: false, // Should attempt to fix with html-tidy
    format: 'asciidoc'
  },
  {
    name: 'Missing Required Elements',
    description: 'Content without any convertible elements',
    input: '<html><head></head><body></body></html>',
    shouldFail: true,
    expectedError: 'No convertible content found'
  },
  {
    name: 'Circular Reference',
    description: 'Content with potential circular references',
    input: `<p>See <a href="document-a.htm">Document A</a> for details.</p>
<!-- This would be in document-a.htm: -->
<!-- <p>See <a href="document-b.htm">Document B</a> for more info.</p> -->`,
    format: 'asciidoc'
  }
];

/**
 * Performance test cases
 */
export const performanceTestCases: ConversionTestCase[] = [
  {
    name: 'Large Document',
    description: 'Document with substantial content for performance testing',
    input: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Large Document</title></head>
  <body>
    <h1>Performance Test Document</h1>
    ${Array.from({ length: 100 }, (_, i) => `
    <h2>Section ${i + 1}</h2>
    <p>This is section ${i + 1} with multiple paragraphs and elements.</p>
    <ol>
      <li>First item in section ${i + 1}</li>
      <li>Second item in section ${i + 1}</li>
      <li>Third item in section ${i + 1}</li>
    </ol>
    <table>
      <tr><th>Column 1</th><th>Column 2</th></tr>
      <tr><td>Data ${i + 1}-1</td><td>Data ${i + 1}-2</td></tr>
    </table>
    <div class="mc-note">
      <p>This is note ${i + 1} for testing purposes.</p>
    </div>`).join('\n')}
  </body>
</html>`,
    format: 'asciidoc'
  },
  {
    name: 'Deep Nested Structure',
    description: 'Deeply nested HTML structure',
    input: Array.from({ length: 20 }, (_, i) => 
      `<div class="level-${i}">`.repeat(i + 1) + 
      `<p>Content at nesting level ${i + 1}</p>` +
      '</div>'.repeat(i + 1)
    ).join('\n'),
    format: 'asciidoc'
  }
];

/**
 * Format-specific test cases
 */
export const formatTestCases = {
  asciidoc: [
    ...tableTestCases,
    ...listTestCases,
    ...madcapTestCases,
    ...admonitionTestCases,
    ...imageTestCases
  ],
  'writerside-markdown': [
    {
      name: 'Writerside Admonition',
      description: 'Blockquote-style admonition for Writerside',
      input: `<div class="mc-note">
  <p>This is a note in Writerside format.</p>
</div>`,
      expectedOutput: `> This is a note in Writerside format.
{style="note"}`,
      format: 'writerside-markdown' as const
    },
    {
      name: 'Writerside Table',
      description: 'Markdown table for Writerside',
      input: `<table>
  <thead>
    <tr><th>Name</th><th>Value</th></tr>
  </thead>
  <tbody>
    <tr><td>Item 1</td><td>100</td></tr>
    <tr><td>Item 2</td><td>200</td></tr>
  </tbody>
</table>`,
      expectedOutput: `| Name | Value |
|------|-------|
| Item 1 | 100 |
| Item 2 | 200 |`,
      format: 'writerside-markdown' as const
    }
  ],
  zendesk: [
    {
      name: 'Zendesk HTML Output',
      description: 'Clean HTML for Zendesk Help Center',
      input: `<h1>Help Article</h1>
<p>This is a help article for Zendesk.</p>
<div class="mc-note">
  <p>Important information for users.</p>
</div>`,
      format: 'zendesk' as const
    }
  ]
};

/**
 * Math notation test cases
 */
export const mathTestCases: ConversionTestCase[] = [
  {
    name: 'LaTeX Inline Math',
    description: 'Basic LaTeX inline math expressions',
    input: `<p>The equation $E = mc^2$ represents mass-energy equivalence.</p>
<p>Also consider the formula $\\sqrt{a^2 + b^2}$ for distance.</p>`,
    expectedOutput: `The equation latexmath:[E = mc^2] represents mass-energy equivalence.

Also consider the formula latexmath:[\\sqrt{a^2 + b^2}] for distance.`,
    format: 'asciidoc'
  },
  {
    name: 'LaTeX Display Math',
    description: 'LaTeX display math blocks',
    input: `<p>The quadratic formula is:</p>
<p>$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$</p>`,
    expectedOutput: `The quadratic formula is:

[latexmath]
++++
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
++++`,
    format: 'asciidoc'
  },
  {
    name: 'HTML Subscript and Superscript',
    description: 'HTML sub and sup tags conversion',
    input: `<p>Water is H<sub>2</sub>O and E = mc<sup>2</sup>.</p>
<p>The area is x<sup>2</sup> + y<sup>2</sup>.</p>`,
    expectedOutput: `Water is H~2~O and E = mc^2^.

The area is x^2^ + y^2^.`,
    format: 'asciidoc'
  },
  {
    name: 'Scientific Notation',
    description: 'Scientific notation conversion',
    input: `<p>The speed of light is approximately 3.0 × 10<sup>8</sup> m/s.</p>
<p>Avogadro's number is 6.022 x 10^23.</p>`,
    expectedOutput: `The speed of light is approximately 3.0 × 10^8^ m/s.

Avogadro's number is 6.022 × 10^23^.`,
    format: 'asciidoc'
  },
  {
    name: 'Mathematical Symbols',
    description: 'Unicode mathematical symbols',
    input: `<p>Common symbols: ± ≤ ≥ ≠ ≈ ∞ π α β γ δ</p>
<p>Set operations: ∑ ∫ √ ² ³ ½ ¼ ¾</p>`,
    format: 'asciidoc'
  },
  {
    name: 'MathML Conversion',
    description: 'Basic MathML to AsciiDoc conversion',
    input: `<math xmlns="http://www.w3.org/1998/Math/MathML">
  <mfrac>
    <mi>x</mi>
    <mi>y</mi>
  </mfrac>
</math>`,
    expectedOutput: `math:[x/y]`,
    format: 'asciidoc'
  }
];

/**
 * Citation and footnote test cases
 */
export const citationTestCases: ConversionTestCase[] = [
  {
    name: 'HTML Footnotes',
    description: 'Standard HTML footnote references and content',
    input: `<p>This is a statement with a footnote<a href="#fn1">1</a>.</p>
<p>Another statement with a footnote<a href="#fn2">2</a>.</p>
<div id="fn1">
  <p>This is the first footnote content.</p>
</div>
<div id="fn2">
  <p>This is the <strong>second</strong> footnote with formatting.</p>
</div>`,
    format: 'asciidoc'
  },
  {
    name: 'Academic Citations',
    description: 'Author-year citation format',
    input: `<p>Recent studies (Smith, 2023) show significant improvements.</p>
<p>This approach was first described by (Johnson and Wilson, 2022).</p>`,
    format: 'asciidoc'
  },
  {
    name: 'Numeric References',
    description: 'Numeric citation references',
    input: `<p>The methodology is described elsewhere [1].</p>
<p>Multiple studies [2], [3], [4] confirm these results.</p>`,
    format: 'asciidoc'
  },
  {
    name: 'Bibliography Section',
    description: 'Bibliography entries with DOI and URLs',
    input: `<div class="bibliography">
  <p>Smith, J. (2023). "Advanced Document Processing" in Journal of Computing, vol. 45, no. 2, pp. 123-145, 2023. DOI: 10.1000/example.doi</p>
</div>
<div class="bibliography">
  <p>Johnson, A. and Wilson, B. (2022). Modern Approaches to Text Conversion. Available at: https://example.com/paper</p>
</div>`,
    format: 'asciidoc'
  },
  {
    name: 'Mixed Citation Types',
    description: 'Document with multiple citation types',
    input: `<p>The theory was established by Einstein<a href="#fn1">1</a> and later expanded (Hawking, 1988).</p>
<p>Modern applications [2] build on these foundations.</p>
<div id="fn1">
  <p>Einstein, A. (1905). "On the Electrodynamics of Moving Bodies"</p>
</div>`,
    format: 'asciidoc'
  }
];

/**
 * Performance optimization test cases
 */
export const performanceOptimizationTestCases: ConversionTestCase[] = [
  {
    name: 'Large Document Processing',
    description: 'Performance test with substantial content',
    input: `<html>
  <body>
    <h1>Large Document Test</h1>
    ${Array.from({ length: 50 }, (_, i) => `
    <h2>Section ${i + 1}</h2>
    <p>This is section ${i + 1} with substantial content for performance testing.</p>
    <table>
      <tr><th>Column 1</th><th>Column 2</th></tr>
      <tr><td>Data ${i + 1}-1</td><td>Data ${i + 1}-2</td></tr>
    </table>
    <ul>
      <li>Item 1 in section ${i + 1}</li>
      <li>Item 2 in section ${i + 1}</li>
    </ul>`).join('\n')}
  </body>
</html>`,
    format: 'asciidoc'
  },
  {
    name: 'Memory Efficiency Test',
    description: 'Test memory usage with repetitive content',
    input: Array.from({ length: 100 }, (_, i) => 
      `<div class="section"><h3>Subsection ${i}</h3><p>Content for subsection ${i} with various elements.</p></div>`
    ).join('\n'),
    format: 'asciidoc'
  },
  {
    name: 'Deep Nesting Performance',
    description: 'Performance with deeply nested HTML structure',
    input: Array.from({ length: 15 }, (_, i) => 
      '<div class="level-' + i + '">'.repeat(i + 1) + 
      `<p>Content at nesting level ${i + 1}</p>` +
      '</div>'.repeat(i + 1)
    ).join('\n'),
    format: 'asciidoc'
  }
];

/**
 * All test cases organized by category
 */
export const testCases = {
  tables: tableTestCases,
  lists: listTestCases,
  madcap: madcapTestCases,
  admonitions: admonitionTestCases,
  images: imageTestCases,
  errors: errorTestCases,
  performance: performanceTestCases,
  formats: formatTestCases,
  math: mathTestCases,
  citations: citationTestCases,
  performanceOptimization: performanceOptimizationTestCases
};

/**
 * Helper function to get test cases by category
 */
export function getTestCases(category: keyof typeof testCases): ConversionTestCase[] {
  return testCases[category];
}

/**
 * Helper function to run a test case
 */
export function runTestCase(testCase: ConversionTestCase, converter: any): Promise<any> {
  const options = {
    format: testCase.format || 'asciidoc',
    ...testCase.options
  };
  
  return converter.convert(testCase.input, options);
}