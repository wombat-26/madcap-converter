import { join, dirname, basename, extname } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { errorHandler } from './error-handler.js';

export interface WritersideProjectConfig {
  projectName: string;
  projectPath: string;
  instances: WritersideInstanceConfig[];
  globalVariables?: WritersideVariable[];
  buildConfig?: WritersideBuildConfig;
}

export interface WritersideInstanceConfig {
  id: string;
  name: string;
  treeFile: string;
  webPath?: string;
  version?: string;
  startPage?: string;
  variables?: WritersideVariable[];
  filters?: WritersideFilter[];
}

export interface WritersideVariable {
  name: string;
  value: string;
  instance?: string;
  description?: string;
}

export interface WritersideFilter {
  name: string;
  values: string[];
  description?: string;
}

export interface WritersideBuildConfig {
  primaryColor?: string;
  headerLogo?: string;
  favicon?: string;
  webRoot?: string;
  enableSearch?: boolean;
  enableSitemap?: boolean;
  socialMetadata?: {
    title?: string;
    description?: string;
    image?: string;
  };
}

export interface WritersideTocElement {
  id?: string;
  title?: string;
  topicFile?: string;
  href?: string;
  hidden?: boolean;
  startPage?: boolean;
  children?: WritersideTocElement[];
  instance?: string;
  acceptTopics?: boolean;
}

export interface WritersideProjectStructure {
  configFile: string;
  topicsDir: string;
  imagesDir: string;
  snippetsDir?: string;
  resourcesDir?: string;
  cfgDir?: string;
}

/**
 * Generates complete Writerside project structure and configuration files
 */
export class WritersideProjectGenerator {
  private config: WritersideProjectConfig;
  private structure: WritersideProjectStructure;

  constructor(config: WritersideProjectConfig) {
    this.config = config;
    this.structure = this.generateProjectStructure();
  }

  private generateProjectStructure(): WritersideProjectStructure {
    const basePath = this.config.projectPath;
    return {
      configFile: join(basePath, 'writerside.cfg'),
      topicsDir: join(basePath, 'topics'),
      imagesDir: join(basePath, 'images'),
      snippetsDir: join(basePath, 'snippets'),
      resourcesDir: join(basePath, 'resources'),
      cfgDir: join(basePath, 'cfg')
    };
  }

  /**
   * Creates the complete Writerside project structure
   */
  async generateProject(): Promise<void> {
    // Create directories
    await this.createDirectories();
    
    // Generate main configuration file
    await this.generateWritersideConfig();
    
    // Generate build profiles if specified
    if (this.config.buildConfig) {
      await this.generateBuildProfiles();
    }
    
    // Generate variable files
    await this.generateVariableFiles();
    
    // Generate tree files for each instance
    for (const instance of this.config.instances) {
      await this.generateTreeFile(instance);
    }
  }

  private async createDirectories(): Promise<void> {
    const dirs = [
      this.structure.topicsDir,
      this.structure.imagesDir,
      this.structure.snippetsDir!,
      this.structure.resourcesDir!,
      this.structure.cfgDir!
    ];

    for (const dir of dirs) {
      await errorHandler.safeCreateDirectory(dir);
    }
  }

  private async generateWritersideConfig(): Promise<void> {
    const config = this.buildWritersideConfigXml();
    await errorHandler.safeWriteFile(this.structure.configFile, config, 'utf8');
  }

  private buildWritersideConfigXml(): string {
    const instances = this.config.instances.map(instance => {
      const attrs = [`src="${instance.treeFile}"`];
      if (instance.webPath) attrs.push(`web-path="${instance.webPath}"`);
      if (instance.version) attrs.push(`version="${instance.version}"`);
      return `    <instance ${attrs.join(' ')}/>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ihp SYSTEM "https://resources.jetbrains.com/writerside/1.0/ihp.dtd">
<ihp version="1.0">
    <topics dir="topics"/>
    <images dir="images"/>
    <snippets dir="snippets"/>
${instances}
</ihp>`;
  }

  private async generateBuildProfiles(): Promise<void> {
    const buildConfig = this.buildBuildProfilesXml();
    const buildProfilesPath = join(this.structure.cfgDir!, 'buildprofiles.xml');
    await errorHandler.safeWriteFile(buildProfilesPath, buildConfig, 'utf8');
  }

  private buildBuildProfilesXml(): string {
    const config = this.config.buildConfig!;
    
    const variables = [];
    if (config.webRoot) variables.push(`        <web-root>${config.webRoot}</web-root>`);
    if (config.primaryColor) variables.push(`        <primary-color>${config.primaryColor}</primary-color>`);
    if (config.headerLogo) variables.push(`        <header-logo>${config.headerLogo}</header-logo>`);
    if (config.favicon) variables.push(`        <favicon>${config.favicon}</favicon>`);
    if (config.enableSearch !== undefined) variables.push(`        <enable-search>${config.enableSearch}</enable-search>`);
    if (config.enableSitemap !== undefined) variables.push(`        <enable-sitemap>${config.enableSitemap}</enable-sitemap>`);

    const variablesSection = variables.length > 0 ? `
    <variables>
${variables.join('\n')}
    </variables>` : '';

    const socialSection = config.socialMetadata ? `
    <build-config>
        <meta>
            <title>${config.socialMetadata.title || this.config.projectName}</title>
            <description>${config.socialMetadata.description || ''}</description>
            ${config.socialMetadata.image ? `<image>${config.socialMetadata.image}</image>` : ''}
        </meta>
    </build-config>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE buildprofiles SYSTEM "https://resources.jetbrains.com/writerside/1.0/build-profiles.dtd">
<buildprofiles>
${variablesSection}${socialSection}
</buildprofiles>`;
  }

  private async generateVariableFiles(): Promise<void> {
    // Always generate global variables file (even if empty)
    // This ensures consistency with what batch service reports as created
    const globalVars = this.config.globalVariables && this.config.globalVariables.length > 0
      ? this.buildVariableFileContent(this.config.globalVariables)
      : this.buildEmptyVariableFileContent();
    const globalVarPath = join(this.config.projectPath, 'v.list');
    await errorHandler.safeWriteFile(globalVarPath, globalVars, 'utf8');

    // Generate instance-specific variable files
    for (const instance of this.config.instances) {
      if (instance.variables && instance.variables.length > 0) {
        const instanceVars = this.buildVariableFileContent(instance.variables);
        const instanceVarPath = join(this.config.projectPath, `${instance.id}.list`);
        await errorHandler.safeWriteFile(instanceVarPath, instanceVars, 'utf8');
      }
    }
  }

  private buildVariableFileContent(variables: WritersideVariable[]): string {
    const varElements = variables.map(variable => {
      const attrs = [`name="${variable.name}"`, `value="${this.escapeXml(variable.value)}"`];
      if (variable.instance) attrs.push(`instance="${variable.instance}"`);
      return `    <var ${attrs.join(' ')}/>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE vars SYSTEM "https://resources.jetbrains.com/writerside/1.0/vars.dtd">
<vars>
${varElements}
</vars>`;
  }

  private buildEmptyVariableFileContent(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE vars SYSTEM "https://resources.jetbrains.com/writerside/1.0/vars.dtd">
<vars>
    <!-- No variables found during conversion -->
</vars>`;
  }

  private async generateTreeFile(instance: WritersideInstanceConfig): Promise<void> {
    const treeContent = this.buildTreeFileContent(instance);
    const treePath = join(this.config.projectPath, instance.treeFile);
    await errorHandler.safeWriteFile(treePath, treeContent, 'utf8');
  }

  private buildTreeFileContent(instance: WritersideInstanceConfig): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE instance-profile SYSTEM "https://resources.jetbrains.com/writerside/1.0/product-profile.dtd">
<instance-profile id="${instance.id}" name="${instance.name}" start-page="${instance.startPage || 'overview.topic'}">
    <toc-element topic="overview.topic"/>
</instance-profile>`;
  }

  /**
   * Generates a TOC tree structure from provided elements
   */
  generateTocElements(elements: WritersideTocElement[]): string {
    return elements.map(element => this.generateTocElement(element, 1)).join('\n');
  }

  private generateTocElement(element: WritersideTocElement, depth: number): string {
    const indent = '    '.repeat(depth);
    const attrs = [];
    
    if (element.topicFile) {
      attrs.push(`topic="${element.topicFile}"`);
    } else if (element.href) {
      attrs.push(`href="${element.href}"`);
    }
    
    if (element.id) attrs.push(`id="${element.id}"`);
    if (element.hidden) attrs.push(`hidden="true"`);
    if (element.startPage) attrs.push(`start-page="true"`);
    if (element.instance) attrs.push(`instance="${element.instance}"`);
    if (element.acceptTopics) attrs.push(`accepts-web-file-names="true"`);

    const openTag = `<toc-element${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>`;
    
    if (element.children && element.children.length > 0) {
      const childElements = element.children.map(child => 
        this.generateTocElement(child, depth + 1)
      ).join('\n');
      return `${indent}${openTag}\n${childElements}\n${indent}</toc-element>`;
    } else {
      return `${indent}${openTag.replace('>', '/>')}`;
    }
  }

  /**
   * Updates an existing tree file with new TOC structure
   */
  async updateTreeFile(instance: WritersideInstanceConfig, tocElements: WritersideTocElement[]): Promise<void> {
    const tocContent = this.generateTocElements(tocElements);
    const treeContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE instance-profile SYSTEM "https://resources.jetbrains.com/writerside/1.0/product-profile.dtd">
<instance-profile id="${instance.id}" name="${instance.name}" start-page="${instance.startPage || 'overview.topic'}">
${tocContent}
</instance-profile>`;

    const treePath = join(this.config.projectPath, instance.treeFile);
    await errorHandler.safeWriteFile(treePath, treeContent, 'utf8');
  }

  /**
   * Creates a starter topic file
   */
  async createStarterTopic(filename: string, title: string, content: string): Promise<void> {
    const topicPath = join(this.structure.topicsDir, filename);
    const topicContent = `# ${title}

${content}
`;
    await errorHandler.safeWriteFile(topicPath, topicContent, 'utf8');
  }

  /**
   * Escapes XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Gets the project structure information
   */
  getProjectStructure(): WritersideProjectStructure {
    return this.structure;
  }

  /**
   * Updates the variables in the project configuration and regenerates the v.list file
   */
  async updateVariables(variables: WritersideVariable[]): Promise<void> {
    // Update the config
    this.config.globalVariables = variables;
    
    // Regenerate the v.list file with updated variables
    await this.generateVariableFiles();
  }
}