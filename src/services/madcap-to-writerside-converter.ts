import { FLVARParser, VariableSet } from './flvar-parser.js';
import { WritersideVariable, WritersideFilter, WritersideInstanceConfig } from './writerside-project-generator.js';

export interface MadCapCondition {
  name: string;
  type: 'include' | 'exclude';
  description?: string;
}

export interface ConversionOptions {
  excludeConditions?: string[];
  includeConditions?: string[];
  variablePrefix?: string;
  instanceMapping?: { [madcapCondition: string]: string };
  defaultInstance?: string;
}

export interface ConversionResult {
  variables: WritersideVariable[];
  filters: WritersideFilter[];
  conditionMapping: { [madcapCondition: string]: string };
  excludedVariables: string[];
  warnings: string[];
}

/**
 * Converts MadCap Flare project elements to Writerside equivalents
 */
export class MadCapToWritersideConverter {
  private flvarParser: FLVARParser;
  private options: ConversionOptions;

  constructor(options: ConversionOptions = {}) {
    this.flvarParser = new FLVARParser();
    this.options = {
      excludeConditions: [
        'deprecated', 'obsolete', 'legacy', 'old',
        'hidden', 'internal', 'private', 'draft',
        'print-only', 'printonly', 'print only',
        'cancelled', 'canceled', 'abandoned', 'shelved',
        'Black', 'Red', 'Gray', 'Grey'
      ],
      includeConditions: [],
      variablePrefix: '',
      instanceMapping: {},
      defaultInstance: 'main',
      ...options
    };
  }

  /**
   * Converts MadCap FLVAR files to Writerside variables
   */
  async convertFLVARToVariables(flvarFiles: string[]): Promise<ConversionResult> {
    const warnings: string[] = [];
    const excludedVariables: string[] = [];
    const variables: WritersideVariable[] = [];

    try {
      // Parse all FLVAR files
      const variableSets = await this.flvarParser.parseMultipleFiles(flvarFiles);
      const mergedVariables = this.flvarParser.mergeVariableSets(variableSets);

      for (const variable of mergedVariables) {
        // Check if variable should be excluded based on conditions
        if (this.shouldExcludeVariable(variable.name, variable.value)) {
          excludedVariables.push(variable.name);
          continue;
        }

        // Convert to Writerside variable format
        const writersideVar = this.convertVariable(variable);
        variables.push(writersideVar);
      }

      // Generate condition-based filters
      const filters = this.generateFiltersFromConditions();
      const conditionMapping = this.generateConditionMapping();

      return {
        variables,
        filters,
        conditionMapping,
        excludedVariables,
        warnings
      };

    } catch (error) {
      warnings.push(`Error converting FLVAR files: ${error instanceof Error ? error.message : String(error)}`);
      return {
        variables: [],
        filters: [],
        conditionMapping: {},
        excludedVariables,
        warnings
      };
    }
  }

  private shouldExcludeVariable(name: string, value: string): boolean {
    const excludeConditions = this.options.excludeConditions || [];
    
    // Check if variable name contains excluded conditions
    const nameCheck = excludeConditions.some(condition => 
      name.toLowerCase().includes(condition.toLowerCase())
    );
    
    // Check if variable value contains excluded conditions
    const valueCheck = excludeConditions.some(condition => 
      value.toLowerCase().includes(condition.toLowerCase())
    );
    
    return nameCheck || valueCheck;
  }

  private convertVariable(madcapVar: any): WritersideVariable {
    const name = this.sanitizeVariableName(madcapVar.name);
    const prefixedName = this.options.variablePrefix ? 
      `${this.options.variablePrefix}_${name}` : name;

    return {
      name: prefixedName,
      value: madcapVar.value || '',
      description: `Converted from MadCap variable: ${madcapVar.namespace}.${madcapVar.key}`
    };
  }

  private sanitizeVariableName(name: string): string {
    // Convert MadCap variable names to Writerside-compatible format
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_') // Replace special chars with underscore
      .replace(/^[0-9]/, '_$&')       // Prefix numbers with underscore
      .toLowerCase();                 // Use lowercase for consistency
  }

  /**
   * Generates Writerside filters from MadCap conditions
   */
  private generateFiltersFromConditions(): WritersideFilter[] {
    const filters: WritersideFilter[] = [];
    
    // Create platform filter
    filters.push({
      name: 'platform',
      values: ['web', 'mobile', 'desktop', 'api'],
      description: 'Platform-specific content filtering'
    });

    // Create status filter for development stages
    filters.push({
      name: 'status',
      values: ['release', 'beta', 'alpha', 'deprecated'],
      description: 'Content status filtering'
    });

    // Create audience filter
    filters.push({
      name: 'audience',
      values: ['admin', 'user', 'developer', 'public'],
      description: 'Target audience filtering'
    });

    return filters;
  }

  /**
   * Maps MadCap conditions to Writerside instance/filter combinations
   */
  private generateConditionMapping(): { [madcapCondition: string]: string } {
    const mapping: { [madcapCondition: string]: string } = {};
    
    // Common MadCap condition mappings
    const commonMappings = {
      'web': 'platform="web"',
      'mobile': 'platform="mobile"',
      'desktop': 'platform="desktop"',
      'api': 'platform="api"',
      'admin': 'audience="admin"',
      'user': 'audience="user"',
      'developer': 'audience="developer"',
      'public': 'audience="public"',
      'release': 'status="release"',
      'beta': 'status="beta"',
      'alpha': 'status="alpha"',
      'deprecated': 'status="deprecated"'
    };

    // Add user-defined mappings
    Object.assign(mapping, commonMappings, this.options.instanceMapping);

    return mapping;
  }

  /**
   * Converts MadCap conditional content to Writerside format
   */
  convertConditionalContent(
    content: string, 
    madcapConditions: string[]
  ): { content: string; instance?: string; filter?: string } {
    
    // Handle excluded conditions by returning empty content
    const hasExcludedCondition = madcapConditions.some(condition =>
      this.options.excludeConditions?.includes(condition.toLowerCase())
    );
    
    if (hasExcludedCondition) {
      return { content: '' };
    }

    // Map conditions to Writerside filters/instances
    const conditionMapping = this.generateConditionMapping();
    const mappedConditions = madcapConditions
      .map(condition => conditionMapping[condition.toLowerCase()])
      .filter(Boolean);

    if (mappedConditions.length === 0) {
      return { content };
    }

    // Generate appropriate Writerside conditional markup
    if (mappedConditions.length === 1) {
      const condition = mappedConditions[0];
      if (condition.includes('=')) {
        return { content, filter: condition };
      } else {
        return { content, instance: condition };
      }
    }

    // Multiple conditions - use filter syntax
    const filterString = mappedConditions.join(',');
    return { content, filter: filterString };
  }

  /**
   * Converts MadCap TOC structure to Writerside tree elements
   */
  convertTocStructure(madcapToc: any[]): any[] {
    return madcapToc.map(item => this.convertTocItem(item));
  }

  private convertTocItem(item: any): any {
    const tocElement: any = {};

    // Convert basic properties
    if (item.title) tocElement.title = item.title;
    if (item.href) {
      // Convert .htm to .md for topic files
      tocElement.topicFile = item.href.replace(/\.htm?$/i, '.md');
    }
    if (item.id) tocElement.id = this.sanitizeId(item.id);

    // Handle conditions
    if (item.conditions && item.conditions.length > 0) {
      const conditionMapping = this.generateConditionMapping();
      const mappedConditions = item.conditions
        .map((condition: string) => conditionMapping[condition.toLowerCase()])
        .filter(Boolean);
      
      if (mappedConditions.length > 0) {
        // Use first mapped condition as instance filter
        tocElement.instance = mappedConditions[0].split('=')[1]?.replace(/"/g, '') || mappedConditions[0];
      }
    }

    // Handle nested items
    if (item.children && item.children.length > 0) {
      tocElement.children = item.children.map((child: any) => this.convertTocItem(child));
    }

    return tocElement;
  }

  private sanitizeId(id: string): string {
    return id
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/^[0-9]/, 'id-$&')
      .toLowerCase();
  }

  /**
   * Generates instance configurations based on detected conditions
   */
  generateInstanceConfigurations(
    madcapConditions: string[],
    baseName: string
  ): WritersideInstanceConfig[] {
    const instances: WritersideInstanceConfig[] = [];
    
    // Create default instance
    instances.push({
      id: 'default',
      name: `${baseName} Documentation`,
      treeFile: 'default.tree',
      startPage: 'overview.md'
    });

    // Create instances for major platforms/audiences
    const majorConditions = ['web', 'mobile', 'desktop', 'admin', 'user'];
    const detectedConditions = madcapConditions.filter(condition =>
      majorConditions.includes(condition.toLowerCase())
    );

    for (const condition of detectedConditions) {
      const conditionLower = condition.toLowerCase();
      instances.push({
        id: conditionLower,
        name: `${baseName} - ${condition}`,
        treeFile: `${conditionLower}.tree`,
        webPath: `/${conditionLower}`,
        startPage: 'overview.md'
      });
    }

    return instances;
  }

  /**
   * Converts MadCap snippet includes to Writerside format
   */
  convertSnippetInclude(snippetPath: string, conditions?: string[]): string {
    const convertedPath = snippetPath.replace(/\.flsnp$/i, '.md');
    
    if (conditions && conditions.length > 0) {
      const conditionResult = this.convertConditionalContent('', conditions);
      if (conditionResult.instance) {
        return `<include from="${convertedPath}" instance="${conditionResult.instance}"/>`;
      } else if (conditionResult.filter) {
        return `<include from="${convertedPath}" filter="${conditionResult.filter}"/>`;
      }
    }
    
    return `<include from="${convertedPath}"/>`;
  }

  /**
   * Converts MadCap cross-references to Writerside format
   */
  convertCrossReference(href: string, linkText?: string): string {
    const convertedHref = href.replace(/\.htm?$/i, '.md');
    
    if (linkText) {
      return `[${linkText}](${convertedHref})`;
    } else {
      return `<a href="${convertedHref}"/>`;
    }
  }
}