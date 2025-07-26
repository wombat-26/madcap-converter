import { AsciiDocConverter } from '../build/converters/asciidoc-converter.js';

describe('Nested List Snippet Fix', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  test('should maintain consecutive numbering when snippet is inside list item', async () => {
    // This represents the problematic HTML structure from 01-01 CreatActivity.htm
    const testHtml = `
      <div>
        <ol>
          <li>
            <p>In Uptempo, click <i>Activities</i> in the navigation sidebar.</p>
          </li>
          <li>
            <p>In the Activities section, click <i>Create Activity.</i></p>
          </li>
          <li>
            <p>On the <i>Type</i> page:</p>
          </li>
          <ol style="list-style-type: lower-alpha;">
            <li>
              <p>Use the <i>Activity type</i> list to select the type.</p>
            </li>
            <li>
              <p>Use the <i>Parent</i> list to select the activity.</p>
            </li>
            <li>
              <p>Click <i>Next</i>.</p>
              <p>The <i>Details</i> page is displayed.</p>
            </li>
          </ol>
          <li>
            <p>On the <i>Details</i> page:</p>
            <ol style="list-style-type: lower-alpha;">
              <li>
                <p>Enter a name for your new activity.</p>
              </li>
              <li>
                <p>Optional: To set the date range when this activity will be in-market.</p>
              </li>
              <li>
                <p>Depending on the activity type you selected, additional attribute fields may be displayed.</p>
                <!-- This snippet content should stay within the list item context -->
                <div class="note">
                  <p><span class="noteInDiv">Note:</span> If you see the icons next to an attribute name, then these attributes are part of a dependency.</p>
                  <p>The options that you can select in the dependent attribute are controlled by the value of the controlling attribute.</p>
                </div>
              </li>
              <li>
                <p>Click <i>Next</i>.</p>
                <p>The <i>Budget</i> page is displayed.</p>
              </li>
            </ol>
          </li>
          <li>
            <p>On the <i>Budget</i> page:</p>
            <!-- This should be step 5, not step 1 -->
            <ol style="list-style-type: lower-alpha;">
              <li>
                <p>Optional: To enter a cost estimate for this activity.</p>
              </li>
            </ol>
          </li>
        </ol>
      </div>
    `;

    const result = await converter.convert(testHtml, {
      format: 'asciidoc',
      inputPath: '/test/path.htm',
      pathDepth: 0
    });

    console.log('=== CONVERTED OUTPUT ===');
    console.log(result.content);

    // Check for proper numbering continuation
    const lines = result.content.split('\n');
    
    // Should find "[start=5]" for the budget section list
    const hasStart5 = result.content.includes('[start=5]');
    
    // Should NOT find "1. Click _Next_" as a standalone numbered item
    const hasWrongNumbering = lines.some(line => 
      line.trim() === '1. Click _Next_.' || 
      line.trim().startsWith('1. Click _Next_')
    );

    // Should find proper continuation of the main list
    const hasBudgetSection = result.content.includes('. On the _Budget_ page:');

    expect(hasStart5).toBe(true);
    expect(hasWrongNumbering).toBe(false);
    expect(hasBudgetSection).toBe(true);

    // Verify the note block stays properly formatted within list context
    expect(result.content).toContain('[NOTE]');
    expect(result.content).toContain('====');
  });

  test('should handle complex nested list with multiple snippets', async () => {
    const complexHtml = `
      <div>
        <ol>
          <li>
            <p>First step</p>
          </li>
          <li>
            <p>Second step with nested list:</p>
            <ol style="list-style-type: lower-alpha;">
              <li>
                <p>Sub-step A</p>
                <div class="note">
                  <p><span class="noteInDiv">Note:</span> This is a snippet in a nested list.</p>
                </div>
              </li>
              <li>
                <p>Sub-step B</p>
              </li>
            </ol>
          </li>
          <li>
            <p>Third step</p>
            <div class="warning">
              <p><span class="warningInDiv">Warning:</span> Another snippet between steps.</p>
            </div>
          </li>
          <li>
            <p>Fourth step - should be numbered 4, not 1</p>
          </li>
        </ol>
      </div>
    `;

    const result = await converter.convert(complexHtml, {
      format: 'asciidoc',
      inputPath: '/test/complex.htm',
      pathDepth: 0
    });

    // The fourth step should be properly numbered as step 4
    expect(result.content).toContain('. Fourth step - should be numbered 4, not 1');
    expect(result.content).not.toContain('1. Fourth step');

    // Nested lists should have proper alphabetic formatting
    expect(result.content).toContain('[loweralpha]');
    expect(result.content).toContain('.. Sub-step A');
    expect(result.content).toContain('.. Sub-step B');
  });
});