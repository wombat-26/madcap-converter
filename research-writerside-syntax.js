// Research Writerside syntax specifications for implementation
// Based on JetBrains Writerside documentation

const writersideSyntax = {
  semanticMarkup: {
    description: "Writerside semantic elements for enhanced content structure",
    examples: {
      procedures: {
        syntax: `<procedure title="Installation Steps" id="install">
    <step>Download the installer</step>
    <step>Run the setup wizard</step>
    <step>Complete configuration</step>
</procedure>`,
        markdown: "Uses XML-like semantic tags in markdown"
      },
      
      tabs: {
        syntax: `<tabs>
    <tab title="Windows">
        Windows-specific instructions
    </tab>
    <tab title="macOS">
        macOS-specific instructions
    </tab>
</tabs>`,
        markdown: "XML-like tab structure"
      },
      
      collapsible: {
        syntax: `<collapsible title="Advanced Settings">
    <p>Content that can be expanded/collapsed</p>
</collapsible>`,
        markdown: "XML-like collapsible blocks"
      },
      
      admonitions: {
        syntax: `<note>
    <p>This is a note admonition</p>
</note>

<warning>
    <p>This is a warning admonition</p>
</warning>

<tip>
    <p>This is a tip admonition</p>
</tip>`,
        markdown: "XML-like admonition blocks"
      },
      
      includes: {
        syntax: `<include from="reusable-content.md" element-id="common-warning"/>`,
        markdown: "Include directive for reusable content"
      }
    }
  },
  
  procedureBlocks: {
    description: "Convert step-by-step content to Writerside procedure blocks",
    detection: [
      "div.mc-procedure",
      "ol with mc-procedure class",
      "div containing ol with sequential steps"
    ],
    syntax: `<procedure title="Task Name" id="unique-id">
    <step>First step description</step>
    <step>Second step description</step>
    <step>Final step description</step>
</procedure>`,
    fallback: "Regular ordered list when option disabled"
  },
  
  collapsibleBlocks: {
    description: "Convert expandable content to Writerside collapsible blocks",
    detection: [
      "div.mc-dropdown",
      "details/summary elements",
      "div with expandable content pattern"
    ],
    syntax: `<collapsible title="Click to expand">
    <p>Hidden content that can be expanded</p>
    <p>More collapsible content</p>
</collapsible>`,
    fallback: "Regular div content when option disabled"
  },
  
  tabGroups: {
    description: "Convert tabbed content to Writerside tab groups",
    detection: [
      "div.mc-tabs",
      "div.mc-tab-head + div.mc-tab-body",
      "tabbed interface patterns"
    ],
    syntax: `<tabs>
    <tab title="Tab 1">
        Content for first tab
    </tab>
    <tab title="Tab 2">
        Content for second tab
    </tab>
</tabs>`,
    fallback: "Sequential content when option disabled"
  },
  
  mergeSnippets: {
    description: "Convert MadCap snippets to Writerside includes vs inline content",
    detection: [
      "div[data-mc-snippet]",
      "MadCap:snippetBlock elements",
      "snippet references in content"
    ],
    whenEnabled: {
      syntax: `<include from="snippets.md" element-id="common-warning"/>`,
      behavior: "Convert to include directives"
    },
    whenDisabled: {
      syntax: "Inline content directly",
      behavior: "Merge snippet content inline"
    }
  }
};

console.log('=== WRITERSIDE SYNTAX SPECIFICATIONS ===\n');

for (const [feature, spec] of Object.entries(writersideSyntax)) {
  console.log(`## ${feature.toUpperCase()}`);
  console.log(`Description: ${spec.description}\n`);
  
  if (spec.examples) {
    console.log('Examples:');
    for (const [example, details] of Object.entries(spec.examples)) {
      console.log(`\n### ${example}:`);
      console.log(details.syntax);
    }
  } else {
    console.log('Detection patterns:', spec.detection?.join(', '));
    console.log('\nSyntax:');
    console.log(spec.syntax);
    if (spec.fallback) {
      console.log('\nFallback:', spec.fallback);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Export for use in implementation
const implementationPlan = {
  step1: "Create Writerside syntax generators for each feature",
  step2: "Add CSS class and attribute detection logic", 
  step3: "Implement option checking in convertElementToMarkdown",
  step4: "Add fallback behavior for disabled options",
  step5: "Create comprehensive test suites"
};

console.log('IMPLEMENTATION PLAN:');
Object.entries(implementationPlan).forEach(([step, description]) => {
  console.log(`${step}: ${description}`);
});

export { writersideSyntax, implementationPlan };