/**
 * HTML List Structure Test Fixtures
 * 
 * These fixtures represent various HTML list structures that need to be tested
 * for proper conversion to AsciiDoc format.
 */

export const htmlListFixtures = {
  
  // Simple ordered list - should convert to . . . format
  simpleOrderedList: `
    <ol>
      <li><p>Step 1</p></li>
      <li><p>Step 2</p></li>
      <li><p>Step 3</p></li>
    </ol>
  `,

  // Properly nested alphabetic list
  properlyNestedAlphabeticList: `
    <ol>
      <li>
        <p>Step 1</p>
        <ol style="list-style-type: lower-alpha;">
          <li><p>Sub-step a</p></li>
          <li><p>Sub-step b</p></li>
          <li><p>Sub-step c</p></li>
        </ol>
      </li>
      <li><p>Step 2</p></li>
    </ol>
  `,

  // PROBLEMATIC: Nested list as sibling (the actual issue from MadCap)
  nestedListAsSibling: `
    <ol>
      <li><p>Step 1</p></li>
      <li><p>Step 2</p></li>
      <li><p>Step 3</p></li>
      <ol style="list-style-type: lower-alpha;">
        <li><p>Sub-step a</p></li>
        <li><p>Sub-step b</p></li>
        <li><p>Sub-step c</p></li>
      </ol>
      <li><p>Step 4</p></li>
      <ol style="list-style-type: lower-alpha;">
        <li><p>Sub-step a</p></li>
        <li><p>Sub-step b</p></li>
      </ol>
      <li><p>Step 5</p></li>
    </ol>
  `,

  // PROBLEMATIC: Orphaned paragraphs between list items
  orphanedParagraphs: `
    <ol>
      <li><p>Step 1</p></li>
      <li><p>Step 2</p></li>
      <p>This paragraph should be associated with the previous step</p>
      <li><p>Step 3</p></li>
      <p>Another orphaned paragraph</p>
      <p>Multiple orphaned paragraphs</p>
      <li><p>Step 4</p></li>
    </ol>
  `,

  // COMPLEX: Real MadCap structure (simplified version of the actual problematic structure)
  realMadCapStructure: `
    <ol>
      <li>
        <p>In Uptempo, click <i>Activities</i> in the navigation sidebar.</p>
      </li>
      <li>
        <p>In the Activities section, click <i>Create Activity.</i> The button is available on both the <i>Timeline</i> and <i>Summary</i> views:</p>
        <p>The <i>Create Activity</i> setup assistant opens with the <i>Type</i> page displayed.</p>
      </li>
      <li>
        <p>On the <i>Type</i> page:</p>
      </li>
      <ol style="list-style-type: lower-alpha;">
        <li>
          <p>Use the <i>Activity type</i> list to select the type of activity you want to create from the available options.</p>
        </li>
        <li>
          <p>Use the <i>Parent</i> list to select the activity under which you want to create this new activity in the hierarchy.</p>
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
            <p>Enter a name for your new activity into the <i>Name</i> field.</p>
          </li>
          <li>
            <p>Optional: To set the date range when this activity will be in-market, use the <i>In-market Dates</i> fields.</p>
          </li>
          <li>
            <p>Click <i>Next</i>.</p>
            <p>The <i>Budget</i> page is displayed.</p>
          </li>
        </ol>
      </li>
      <li>
        <p>On the <i>Budget</i> page:</p>
      </li>
    </ol>
  `,

  // Mixed content with notes and images
  mixedContentList: `
    <ol>
      <li>
        <p>Step 1 with content</p>
        <div class="note">
          <p><span class="noteInDiv">Note:</span></p>
          <p>This is a note within a list item.</p>
        </div>
      </li>
      <li>
        <p>Step 2 with image</p>
        <p><img src="../Images/test.png" alt="Test Image" /></p>
      </li>
    </ol>
  `,

  // Multiple levels of nesting
  deeplyNestedLists: `
    <ol>
      <li>
        <p>Level 1 - Step 1</p>
        <ol style="list-style-type: lower-alpha;">
          <li>
            <p>Level 2 - Sub a</p>
            <ol style="list-style-type: lower-roman;">
              <li><p>Level 3 - Roman i</p></li>
              <li><p>Level 3 - Roman ii</p></li>
            </ol>
          </li>
          <li><p>Level 2 - Sub b</p></li>
        </ol>
      </li>
      <li><p>Level 1 - Step 2</p></li>
    </ol>
  `
};

export const expectedAsciiDocOutputs = {
  
  simpleOrderedList: `
. Step 1
. Step 2
. Step 3
  `.trim(),

  properlyNestedAlphabeticList: `
. Step 1
.. Sub-step a
.. Sub-step b
.. Sub-step c
. Step 2
  `.trim(),

  nestedListAsSibling: `
. Step 1
. Step 2
. Step 3
.. Sub-step a
.. Sub-step b
.. Sub-step c
. Step 4
.. Sub-step a
.. Sub-step b
. Step 5
  `.trim(),

  orphanedParagraphs: `
. Step 1
. Step 2
+
This paragraph should be associated with the previous step
. Step 3
+
Another orphaned paragraph
+
Multiple orphaned paragraphs
. Step 4
  `.trim(),

  realMadCapStructure: `
. In Uptempo, click _Activities_ in the navigation sidebar.
. In the Activities section, click _Create Activity._ The button is available on both the _Timeline_ and _Summary_ views:
+
The _Create Activity_ setup assistant opens with the _Type_ page displayed.
. On the _Type_ page:
.. Use the _Activity type_ list to select the type of activity you want to create from the available options.
.. Use the _Parent_ list to select the activity under which you want to create this new activity in the hierarchy.
.. Click _Next_.
+
The _Details_ page is displayed.
. On the _Details_ page:
.. Enter a name for your new activity into the _Name_ field.
.. Optional: To set the date range when this activity will be in-market, use the _In-market Dates_ fields.
.. Click _Next_.
+
The _Budget_ page is displayed.
. On the _Budget_ page:
  `.trim(),

  mixedContentList: `
. Step 1 with content
+
[NOTE]
====
This is a note within a list item.
====
. Step 2 with image
+
image::../Images/test.png[Test Image]
  `.trim(),

  deeplyNestedLists: `
. Level 1 - Step 1
.. Level 2 - Sub a
... Level 3 - Roman i
... Level 3 - Roman ii
.. Level 2 - Sub b
. Level 1 - Step 2
  `.trim()
};