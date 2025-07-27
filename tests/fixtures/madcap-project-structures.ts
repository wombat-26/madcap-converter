/**
 * Test fixtures for MadCap project structures
 * These provide realistic sample projects for testing batch conversion functionality
 */

export interface ProjectFile {
  path: string;
  content: string;
  binary?: boolean;
  size?: number;
}

export interface TestProject {
  name: string;
  description: string;
  files: ProjectFile[];
  expectedOutputFiles?: string[];
  hasImages?: boolean;
  hasVariables?: boolean;
  hasTOC?: boolean;
}

/**
 * Simple MadCap project with basic structure
 */
export const simpleProject: TestProject = {
  name: 'Simple Project',
  description: 'Basic MadCap project with overview and getting started',
  files: [
    {
      path: 'Content/overview.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Project Overview</title></head>
  <body>
    <h1>Project Overview</h1>
    <p>Welcome to our comprehensive documentation project.</p>
    <div class="mc-note">
      <p>Important information about this project setup.</p>
    </div>
    <p>This documentation covers all aspects of the system.</p>
  </body>
</html>`
    },
    {
      path: 'Content/getting-started.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Getting Started</title></head>
  <body>
    <h1>Getting Started Guide</h1>
    <p>Follow these steps to begin:</p>
    <ol>
      <li>First step: Install the software</li>
      <li>Second step: Configure settings</li>
      <li>Third step: Test your setup</li>
    </ol>
    <div class="mc-tip">
      <p>Remember to check system requirements first.</p>
    </div>
  </body>
</html>`
    }
  ],
  expectedOutputFiles: ['Content/overview.adoc', 'Content/getting-started.adoc']
};

/**
 * Complex MadCap project with nested structure, tables, and advanced features
 */
export const complexProject: TestProject = {
  name: 'Complex Enterprise Project',
  description: 'Full-featured MadCap project with all major elements',
  files: [
    {
      path: 'Content/overview.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Enterprise Overview</title></head>
  <body>
    <h1>Enterprise Platform Overview</h1>
    <p>Welcome to the <span data-mc-variable="General.ProductName">Enterprise Platform</span>.</p>
    
    <MadCap:dropDown>
      <MadCap:dropDownHead>
        <MadCap:dropDownHotspot>System Requirements</MadCap:dropDownHotspot>
      </MadCap:dropDownHead>
      <MadCap:dropDownBody>
        <p>Minimum system requirements:</p>
        <ul>
          <li>RAM: 8GB minimum, 16GB recommended</li>
          <li>CPU: Quad-core processor</li>
          <li>Storage: 100GB available space</li>
        </ul>
      </MadCap:dropDownBody>
    </MadCap:dropDown>

    <div class="mc-warning">
      <p>Ensure all prerequisites are met before installation.</p>
    </div>
  </body>
</html>`
    },
    {
      path: 'Content/Admin/user-management.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>User Management</title></head>
  <body>
    <h1>User Management System</h1>
    <p>Manage system users and their permissions effectively.</p>
    
    <table class="TableStyle-BasicTable" style="mc-table-style: url('../Resources/TableStyles/BasicTable.css');">
      <colgroup>
        <col style="width: 30%;">
        <col style="width: 25%;">
        <col style="width: 45%;">
      </colgroup>
      <thead>
        <tr class="TableStyle-BasicTable-Head-Header1">
          <th class="TableStyle-BasicTable-HeadE-Column1-Header1">User Name</th>
          <th class="TableStyle-BasicTable-HeadE-Column2-Header1">Role</th>
          <th class="TableStyle-BasicTable-HeadD-Column3-Header1">Permissions</th>
        </tr>
      </thead>
      <tbody>
        <tr class="TableStyle-BasicTable-Body-Body1">
          <td class="TableStyle-BasicTable-BodyE-Column1-Body1">Administrator</td>
          <td class="TableStyle-BasicTable-BodyE-Column2-Body1">Admin</td>
          <td class="TableStyle-BasicTable-BodyD-Column3-Body1">Full system access, user management</td>
        </tr>
        <tr class="TableStyle-BasicTable-Body-Body2">
          <td class="TableStyle-BasicTable-BodyE-Column1-Body2">Standard User</td>
          <td class="TableStyle-BasicTable-BodyE-Column2-Body2">User</td>
          <td class="TableStyle-BasicTable-BodyD-Column3-Body2">Read/write access to assigned areas</td>
        </tr>
        <tr class="TableStyle-BasicTable-Body-Body1">
          <td class="TableStyle-BasicTable-BodyB-Column1-Body1">Guest</td>
          <td class="TableStyle-BasicTable-BodyB-Column2-Body1">Viewer</td>
          <td class="TableStyle-BasicTable-BodyA-Column3-Body1">Read-only access</td>
        </tr>
      </tbody>
    </table>

    <div class="mc-note">
      <p>User permissions can be customized based on organizational needs.</p>
    </div>
  </body>
</html>`
    },
    {
      path: 'Content/Admin/system-config.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>System Configuration</title></head>
  <body>
    <h1>System Configuration</h1>
    <p>Configure <span data-mc-variable="General.ProductName">Enterprise Platform</span> settings.</p>
    
    <h2>Database Settings</h2>
    <ol>
      <li>Configure database connection:
        <ol style="list-style-type: lower-alpha;">
          <li>Set connection string</li>
          <li>Configure authentication</li>
          <li>Test connection</li>
        </ol>
      </li>
      <li>Optimize performance settings</li>
      <li>Set backup schedules</li>
    </ol>

    <h2>Security Configuration</h2>
    <p>The system uses <span class="Keyboard">Ctrl+Alt+S</span> to access security settings.</p>
    
    <div class="mc-tip">
      <p>Regular security audits are recommended every 90 days.</p>
    </div>
  </body>
</html>`
    },
    {
      path: 'Content/Guides/installation.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Installation Guide</title></head>
  <body>
    <h1>Installation Guide</h1>
    <p>Complete installation instructions for <span data-mc-variable="General.ProductName">Enterprise Platform</span>.</p>
    
    <h2>Pre-installation Checklist</h2>
    <ol>
      <li>Verify system requirements</li>
      <li>Download installation package from <span data-mc-variable="General.WebsiteURL">www.example.com</span></li>
      <li>Backup existing data</li>
    </ol>

    <h2>Installation Steps</h2>
    <ol>
      <li>Run installer as administrator</li>
      <li>Accept license agreement</li>
      <li>Choose installation directory:
        <ol style="list-style-type: lower-alpha;">
          <li>Default: C:\\Program Files\\Enterprise Platform</li>
          <li>Custom: Choose your preferred location</li>
          <li>Ensure sufficient disk space</li>
        </ol>
      </li>
      <li>Configure initial settings</li>
      <li>Complete installation</li>
    </ol>

    <p><img src="../Images/installation-wizard.png" alt="Installation Wizard Screenshot" /></p>
    
    <div class="mc-warning">
      <p>Do not interrupt the installation process once started.</p>
    </div>
  </body>
</html>`
    },
    {
      path: 'Content/Guides/troubleshooting.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Troubleshooting Guide</title></head>
  <body>
    <h1>Troubleshooting Common Issues</h1>
    
    <h2>Connection Issues</h2>
    <p>If you experience connection problems:</p>
    <ol>
      <li>Check network connectivity</li>
      <li>Verify firewall settings</li>
      <li>Test with <span class="Keyboard">ping</span> command</li>
    </ol>

    <h2>Performance Issues</h2>
    <MadCap:dropDown>
      <MadCap:dropDownHead>
        <MadCap:dropDownHotspot>Memory Optimization</MadCap:dropDownHotspot>
      </MadCap:dropDownHead>
      <MadCap:dropDownBody>
        <p>To optimize memory usage:</p>
        <ul>
          <li>Close unnecessary applications</li>
          <li>Increase virtual memory</li>
          <li>Monitor resource usage</li>
        </ul>
        <p>Use <span class="Keyboard">Ctrl+Shift+Esc</span> to open Task Manager.</p>
      </MadCap:dropDownBody>
    </MadCap:dropDown>

    <p>For technical support, contact <span data-mc-variable="General.SupportEmail">support@example.com</span>.</p>
  </body>
</html>`
    },
    // Variable files
    {
      path: 'Project/VariableSets/General.flvar',
      content: `<?xml version="1.0" encoding="utf-8"?>
<CatapultVariableSet Version="1">
  <Variable
    Name="ProductName"
    Comment="Main product name used throughout documentation">Enterprise Platform</Variable>
  <Variable
    Name="Version"
    Comment="Current product version">2.1.0</Variable>
  <Variable
    Name="CompanyName"
    Comment="Company name">Example Corporation</Variable>
  <Variable
    Name="WebsiteURL"
    Comment="Main website URL">www.example.com</Variable>
  <Variable
    Name="SupportEmail"
    Comment="Support contact email">support@example.com</Variable>
  <Variable
    Name="ReleaseDate"
    Comment="Current release date">December 2024</Variable>
</CatapultVariableSet>`
    },
    // Images (fake binary content)
    {
      path: 'Content/Images/installation-wizard.png',
      content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      binary: true,
      size: 95
    },
    {
      path: 'Content/Images/icon-warning.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 20h20L12 2zm0 3.5L19.5 19h-15L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>',
      binary: false,
      size: 150
    }
  ],
  expectedOutputFiles: [
    'Content/overview.adoc',
    'Content/Admin/user-management.adoc', 
    'Content/Admin/system-config.adoc',
    'Content/Guides/installation.adoc',
    'Content/Guides/troubleshooting.adoc',
    'variables.adoc'
  ],
  hasImages: true,
  hasVariables: true
};

/**
 * Project with problematic content for error handling tests
 */
export const problematicProject: TestProject = {
  name: 'Problematic Project',
  description: 'Project with various issues to test error handling',
  files: [
    {
      path: 'Content/valid-document.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Valid Document</title></head>
  <body>
    <h1>This is a Valid Document</h1>
    <p>This document should convert successfully.</p>
    <ul>
      <li>Point one</li>
      <li>Point two</li>
    </ul>
  </body>
</html>`
    },
    {
      path: 'Content/empty-file.htm',
      content: ''
    },
    {
      path: 'Content/malformed-html.htm',
      content: '<h1>Broken HTML <p>No closing tags for h1 <div>Unclosed div'
    },
    {
      path: 'Content/deprecated-content.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd" data-mc-conditions="deprecated">
  <head><title>Deprecated Content</title></head>
  <body>
    <h1>This Should Be Skipped</h1>
    <p>This content is marked as deprecated and should be excluded.</p>
  </body>
</html>`
    },
    {
      path: 'Content/large-file.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Large Document</title></head>
  <body>
    <h1>Large Document</h1>
    ${Array.from({ length: 1000 }, (_, i) => `<p>This is paragraph ${i + 1} with substantial content to test large file handling. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join('\n    ')}
  </body>
</html>`,
      size: 150000 // Approximately 150KB
    },
    {
      path: 'Content/unsupported-file.xyz',
      content: 'This is an unsupported file type that should be skipped.'
    },
    {
      path: 'Content/complex-madcap.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Complex MadCap Elements</title></head>
  <body>
    <h1>Complex MadCap Features</h1>
    
    <MadCap:conditionalText data-mc-conditions="invalid-condition">
      This content has an invalid condition reference.
    </MadCap:conditionalText>
    
    <span data-mc-variable="NonExistent.Variable">Missing Variable</span>
    
    <p><img src="missing-image.png" alt="Missing image reference" /></p>
  </body>
</html>`
    }
  ],
  expectedOutputFiles: ['Content/valid-document.adoc', 'Content/large-file.adoc']
};

/**
 * Performance testing project with many files
 */
export const performanceProject: TestProject = {
  name: 'Performance Test Project',
  description: 'Large project for performance and concurrency testing',
  files: [
    // Generate 25 similar documents
    ...Array.from({ length: 25 }, (_, i) => ({
      path: `Content/document-${i + 1}.htm`,
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Document ${i + 1}</title></head>
  <body>
    <h1>Document ${i + 1} Title</h1>
    <p>This is document ${i + 1} in the performance test suite.</p>
    
    <h2>Section A</h2>
    <ol>
      <li>First task in section A</li>
      <li>Second task in section A</li>
      <li>Third task in section A</li>
    </ol>
    
    <h2>Section B</h2>
    <table>
      <thead>
        <tr><th>Item</th><th>Value</th></tr>
      </thead>
      <tbody>
        <tr><td>Item ${i + 1}-1</td><td>Value ${i + 1}-1</td></tr>
        <tr><td>Item ${i + 1}-2</td><td>Value ${i + 1}-2</td></tr>
      </tbody>
    </table>
    
    <div class="mc-note">
      <p>This is note ${i + 1} with important information.</p>
    </div>
    
    <p>Document content continues with more paragraphs...</p>
    ${Array.from({ length: 5 }, (_, j) => `<p>Additional paragraph ${j + 1} for document ${i + 1}.</p>`).join('\n    ')}
  </body>
</html>`
    }))
  ],
  expectedOutputFiles: Array.from({ length: 25 }, (_, i) => `Content/document-${i + 1}.adoc`)
};

/**
 * Cross-reference testing project
 */
export const crossRefProject: TestProject = {
  name: 'Cross-Reference Project',
  description: 'Project with internal links and cross-references',
  files: [
    {
      path: 'Content/main-document.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Main Document</title></head>
  <body>
    <h1>Main Documentation Hub</h1>
    <p>This is the central hub for all documentation.</p>
    
    <h2>Quick Links</h2>
    <ul>
      <li>See the <a href="user-guide.htm">User Guide</a> for detailed instructions</li>
      <li>Check the <a href="api-reference.htm#authentication">Authentication section</a> for API details</li>
      <li>Review <a href="Admin/permissions.htm">permission settings</a> for security</li>
      <li>Visit the <a href="troubleshooting.htm#common-issues">troubleshooting page</a> for help</li>
    </ul>
    
    <p>All sections are interconnected for easy navigation.</p>
  </body>
</html>`
    },
    {
      path: 'Content/user-guide.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>User Guide</title></head>
  <body>
    <h1>Comprehensive User Guide</h1>
    <p>Welcome to the user guide section.</p>
    
    <h2>Getting Started</h2>
    <p>Before you begin, read the <a href="main-document.htm">main documentation</a>.</p>
    
    <h2>Basic Operations</h2>
    <p>For advanced features, see the <a href="api-reference.htm">API Reference</a>.</p>
    
    <p>If you encounter issues, check the <a href="troubleshooting.htm">troubleshooting guide</a>.</p>
  </body>
</html>`
    },
    {
      path: 'Content/api-reference.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>API Reference</title></head>
  <body>
    <h1>API Reference Documentation</h1>
    
    <h2 id="authentication">Authentication</h2>
    <p>All API calls require proper authentication.</p>
    
    <h2 id="endpoints">Available Endpoints</h2>
    <p>The system provides RESTful API endpoints.</p>
    
    <p>Return to the <a href="main-document.htm">main documentation</a> for overview.</p>
    <p>See <a href="user-guide.htm">user guide</a> for practical examples.</p>
  </body>
</html>`
    },
    {
      path: 'Content/Admin/permissions.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Permission Management</title></head>
  <body>
    <h1>Permission Management</h1>
    <p>Configure user permissions and access controls.</p>
    
    <h2>Role-Based Access</h2>
    <p>The system uses role-based access control.</p>
    
    <p>Back to <a href="../main-document.htm">main documentation</a>.</p>
    <p>For API permissions, see <a href="../api-reference.htm#authentication">API authentication</a>.</p>
  </body>
</html>`
    },
    {
      path: 'Content/troubleshooting.htm',
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>Troubleshooting</title></head>
  <body>
    <h1>Troubleshooting Guide</h1>
    
    <h2 id="common-issues">Common Issues</h2>
    <p>Solutions to frequently encountered problems.</p>
    
    <h2 id="advanced-diagnostics">Advanced Diagnostics</h2>
    <p>For complex issues, refer to advanced diagnostics.</p>
    
    <p>Return to <a href="main-document.htm">main documentation</a> when resolved.</p>
    <p>Check the <a href="user-guide.htm">user guide</a> for prevention tips.</p>
  </body>
</html>`
    }
  ],
  expectedOutputFiles: [
    'Content/main-document.adoc',
    'Content/user-guide.adoc',
    'Content/api-reference.adoc',
    'Content/Admin/permissions.adoc',
    'Content/troubleshooting.adoc'
  ]
};

/**
 * All available test projects
 */
export const testProjects = {
  simple: simpleProject,
  complex: complexProject,
  problematic: problematicProject,
  performance: performanceProject,
  crossRef: crossRefProject
};

/**
 * Helper function to get project by name
 */
export function getTestProject(name: keyof typeof testProjects): TestProject {
  return testProjects[name];
}

/**
 * Helper function to create files in filesystem for testing
 */
export async function createProjectFiles(
  project: TestProject, 
  baseDir: string,
  fs: any
): Promise<void> {
  for (const file of project.files) {
    const fullPath = `${baseDir}/${file.path}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    
    // Create directory structure
    await fs.mkdir(dir, { recursive: true });
    
    // Write file content
    if (file.binary) {
      await fs.writeFile(fullPath, Buffer.from(file.content, 'base64'));
    } else {
      await fs.writeFile(fullPath, file.content, 'utf-8');
    }
  }
}