/**
 * Improved Path Resolver - Advanced path resolution for images and variables
 * 
 * Provides sophisticated path resolution capabilities with cross-platform support,
 * intelligent project structure detection, and robust error handling.
 */

import { dirname, basename, resolve, join, relative, normalize, sep } from 'path';
import { existsSync, statSync } from 'fs';

export interface PathResolutionOptions {
  /** Base directory for resolving relative paths */
  baseDir?: string;
  /** Target output directory */
  outputDir?: string;
  /** Enable cross-platform path normalization */
  crossPlatform: boolean;
  /** Enable file existence validation */
  validateExists: boolean;
  /** Custom search paths for assets */
  assetPaths: string[];
  /** Path transformation rules */
  transformRules: PathTransformRule[];
  /** Enable intelligent project structure detection */
  smartProjectDetection: boolean;
}

export interface PathTransformRule {
  /** Pattern to match (regex or string) */
  pattern: string | RegExp;
  /** Replacement string or function */
  replacement: string | ((match: string, ...groups: string[]) => string);
  /** Description of what this rule does */
  description: string;
}

export interface PathResolutionResult {
  /** The resolved path */
  resolvedPath: string;
  /** Whether the path exists on filesystem */
  exists: boolean;
  /** Type of path (absolute, relative, etc.) */
  pathType: 'absolute' | 'relative' | 'url' | 'unknown';
  /** Any warnings encountered during resolution */
  warnings: string[];
  /** Original path before resolution */
  originalPath: string;
  /** Applied transformations */
  appliedTransforms: string[];
}

export interface ProjectStructure {
  /** Root directory of the project */
  projectRoot: string;
  /** Content directory (typically 'Content') */
  contentDir?: string;
  /** Images directory */
  imagesDir?: string;
  /** Variables directory */
  variablesDir?: string;
  /** Project type detected */
  projectType: 'madcap' | 'asciidoc' | 'generic';
}

export class ImprovedPathResolver {
  private options: PathResolutionOptions;
  private projectStructure?: ProjectStructure;

  constructor(options: Partial<PathResolutionOptions> = {}) {
    this.options = {
      crossPlatform: true,
      validateExists: false,
      assetPaths: [],
      transformRules: this.getDefaultTransformRules(),
      smartProjectDetection: true,
      ...options
    };
  }

  /**
   * Resolve image path with intelligent detection and transformation
   */
  resolveImagePath(imagePath: string, contextPath?: string): PathResolutionResult {
    const result = this.createEmptyResult(imagePath);
    
    try {
      // Apply basic path cleaning
      let cleanPath = this.cleanPath(imagePath);
      
      // Apply transformation rules
      cleanPath = this.applyTransformRules(cleanPath, result);
      
      // Resolve relative to context or base directory
      const resolvedPath = this.resolveRelativePath(cleanPath, contextPath);
      result.resolvedPath = resolvedPath;
      
      // Determine path type
      result.pathType = this.determinePathType(resolvedPath);
      
      // Validate existence if requested
      if (this.options.validateExists) {
        result.exists = this.pathExists(resolvedPath);
        if (!result.exists) {
          // Try alternative locations
          const alternatives = this.findAlternativeImagePaths(cleanPath);
          for (const alt of alternatives) {
            if (this.pathExists(alt)) {
              result.resolvedPath = alt;
              result.exists = true;
              result.appliedTransforms.push('found-alternative-location');
              break;
            }
          }
        }
      }
      
    } catch (error) {
      result.warnings.push(`Path resolution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return result;
  }

  /**
   * Resolve variable file path with project structure awareness
   */
  resolveVariablePath(variablePath: string, contextPath?: string): PathResolutionResult {
    const result = this.createEmptyResult(variablePath);
    
    try {
      // Apply basic path cleaning
      let cleanPath = this.cleanPath(variablePath);
      
      // Apply transformation rules specific to variables
      cleanPath = this.applyVariableTransformRules(cleanPath, result);
      
      // Resolve relative to context or base directory
      const resolvedPath = this.resolveRelativePath(cleanPath, contextPath);
      result.resolvedPath = resolvedPath;
      
      // Determine path type
      result.pathType = this.determinePathType(resolvedPath);
      
      // Validate existence if requested
      if (this.options.validateExists) {
        result.exists = this.pathExists(resolvedPath);
        if (!result.exists) {
          // Try alternative locations for variable files
          const alternatives = this.findAlternativeVariablePaths(cleanPath);
          for (const alt of alternatives) {
            if (this.pathExists(alt)) {
              result.resolvedPath = alt;
              result.exists = true;
              result.appliedTransforms.push('found-alternative-location');
              break;
            }
          }
        }
      }
      
    } catch (error) {
      result.warnings.push(`Variable path resolution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return result;
  }

  /**
   * Detect and analyze project structure
   */
  detectProjectStructure(startPath: string): ProjectStructure {
    if (this.projectStructure) {
      return this.projectStructure;
    }

    const structure: ProjectStructure = {
      projectRoot: startPath,
      projectType: 'generic'
    };

    // Look for MadCap Flare project indicators
    const madcapIndicators = [
      'Content',
      'Project',
      'Skins',
      'Targets'
    ];

    let currentPath = startPath;
    const maxLevelsUp = 5;
    
    for (let i = 0; i < maxLevelsUp; i++) {
      const foundIndicators = madcapIndicators.filter(indicator => 
        this.pathExists(join(currentPath, indicator))
      );
      
      if (foundIndicators.length >= 2) {
        structure.projectRoot = currentPath;
        structure.projectType = 'madcap';
        structure.contentDir = join(currentPath, 'Content');
        
        // Look for Images directory
        const possibleImageDirs = [
          join(currentPath, 'Content', 'Images'),
          join(currentPath, 'Content', 'Resources', 'Images'),
          join(currentPath, 'Images')
        ];
        
        for (const imgDir of possibleImageDirs) {
          if (this.pathExists(imgDir)) {
            structure.imagesDir = imgDir;
            break;
          }
        }
        
        // Look for Variables directory
        const possibleVarDirs = [
          join(currentPath, 'Content', 'Variables'),
          join(currentPath, 'Content', 'Resources', 'Variables'),
          join(currentPath, 'Variables'),
          join(currentPath, 'Project', 'VariableSets')
        ];
        
        for (const varDir of possibleVarDirs) {
          if (this.pathExists(varDir)) {
            structure.variablesDir = varDir;
            break;
          }
        }
        
        break;
      }
      
      // Check for AsciiDoc project
      const asciidocIndicators = [
        'includes',
        'images',
        'variables.adoc',
        'attributes.adoc'
      ];
      
      const foundAsciidocIndicators = asciidocIndicators.filter(indicator => 
        this.pathExists(join(currentPath, indicator))
      );
      
      if (foundAsciidocIndicators.length >= 2) {
        structure.projectRoot = currentPath;
        structure.projectType = 'asciidoc';
        structure.imagesDir = join(currentPath, 'images');
        structure.variablesDir = join(currentPath, 'includes');
        break;
      }
      
      // Move up one directory
      const parentPath = dirname(currentPath);
      if (parentPath === currentPath) break; // Reached filesystem root
      currentPath = parentPath;
    }

    this.projectStructure = structure;
    return structure;
  }

  /**
   * Find alternative paths for images
   */
  private findAlternativeImagePaths(imagePath: string): string[] {
    const alternatives: string[] = [];
    const filename = basename(imagePath);
    
    // Use project structure if available
    if (this.options.smartProjectDetection && this.projectStructure) {
      const structure = this.projectStructure;
      
      if (structure.imagesDir) {
        alternatives.push(join(structure.imagesDir, filename));
        // Check subdirectories
        const commonSubdirs = ['Screens', 'Icons', 'GUI', 'Screenshots'];
        for (const subdir of commonSubdirs) {
          alternatives.push(join(structure.imagesDir, subdir, filename));
        }
      }
    }
    
    // Add custom asset paths
    for (const assetPath of this.options.assetPaths) {
      alternatives.push(join(assetPath, filename));
    }
    
    // Add common relative paths
    const commonPaths = [
      `../Images/${filename}`,
      `../../Images/${filename}`,
      `./images/${filename}`,
      `../images/${filename}`
    ];
    
    if (this.options.baseDir) {
      commonPaths.forEach(path => {
        alternatives.push(resolve(this.options.baseDir!, path));
      });
    }
    
    return alternatives;
  }

  /**
   * Find alternative paths for variable files
   */
  private findAlternativeVariablePaths(variablePath: string): string[] {
    const alternatives: string[] = [];
    const filename = basename(variablePath);
    
    // Use project structure if available
    if (this.options.smartProjectDetection && this.projectStructure) {
      const structure = this.projectStructure;
      
      if (structure.variablesDir) {
        alternatives.push(join(structure.variablesDir, filename));
      }
    }
    
    // Add common relative paths for variable files
    const commonPaths = [
      `includes/${filename}`,
      `../includes/${filename}`,
      `variables/${filename}`,
      `../variables/${filename}`,
      `Variables/${filename}`,
      `../Variables/${filename}`
    ];
    
    if (this.options.baseDir) {
      commonPaths.forEach(path => {
        alternatives.push(resolve(this.options.baseDir!, path));
      });
    }
    
    return alternatives;
  }

  /**
   * Apply general transformation rules
   */
  private applyTransformRules(path: string, result: PathResolutionResult): string {
    let transformedPath = path;
    
    for (const rule of this.options.transformRules) {
      const originalPath = transformedPath;
      
      if (typeof rule.pattern === 'string') {
        if (transformedPath.includes(rule.pattern)) {
          if (typeof rule.replacement === 'string') {
            transformedPath = transformedPath.replace(
              new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              rule.replacement
            );
          } else {
            transformedPath = transformedPath.replace(
              new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              rule.replacement
            );
          }
        }
      } else {
        if (typeof rule.replacement === 'string') {
          transformedPath = transformedPath.replace(rule.pattern, rule.replacement);
        } else {
          transformedPath = transformedPath.replace(rule.pattern, rule.replacement);
        }
      }
      
      if (transformedPath !== originalPath) {
        result.appliedTransforms.push(rule.description);
      }
    }
    
    return transformedPath;
  }

  /**
   * Apply variable-specific transformation rules
   */
  private applyVariableTransformRules(path: string, result: PathResolutionResult): string {
    let transformedPath = path;
    
    // Ensure .adoc extension for variable files
    if (!transformedPath.endsWith('.adoc') && !transformedPath.endsWith('.asciidoc')) {
      transformedPath += '.adoc';
      result.appliedTransforms.push('added-adoc-extension');
    }
    
    return this.applyTransformRules(transformedPath, result);
  }

  /**
   * Get default transformation rules
   */
  private getDefaultTransformRules(): PathTransformRule[] {
    return [
      {
        pattern: /\\/g,
        replacement: '/',
        description: 'normalize-path-separators'
      },
      {
        pattern: /\/+/g,
        replacement: '/',
        description: 'remove-duplicate-slashes'
      },
      {
        pattern: /^\.\/+/,
        replacement: '',
        description: 'remove-current-dir-prefix'
      },
      {
        pattern: /^\/Images\//,
        replacement: '../Images/',
        description: 'normalize-absolute-images-path'
      },
      {
        pattern: /^\.\.\/\.\.\/Images\//,
        replacement: '../Images/',
        description: 'normalize-deeply-nested-images-path'
      }
    ];
  }

  /**
   * Clean and normalize path
   */
  private cleanPath(path: string): string {
    if (!path) return '';
    
    let cleaned = path.trim();
    
    // Handle cross-platform paths
    if (this.options.crossPlatform) {
      cleaned = cleaned.replace(/\\/g, '/');
    }
    
    // Remove URL encoding
    cleaned = decodeURIComponent(cleaned);
    
    return cleaned;
  }

  /**
   * Resolve path relative to context or base directory
   */
  private resolveRelativePath(path: string, contextPath?: string): string {
    if (this.isAbsolutePath(path)) {
      return normalize(path);
    }
    
    // For relative paths, keep them relative unless we need absolute resolution
    if (path.startsWith('../') || path.startsWith('./')) {
      // Only resolve to absolute if validation is needed
      if (this.options.validateExists) {
        const basePath = contextPath || this.options.baseDir || process.cwd();
        return resolve(basePath, path);
      } else {
        // Keep relative path, just normalize it
        return normalize(path);
      }
    }
    
    // For paths without relative indicators, resolve normally
    const basePath = contextPath || this.options.baseDir || process.cwd();
    return resolve(basePath, path);
  }

  /**
   * Check if path is absolute
   */
  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[a-zA-Z]:/.test(path);
  }

  /**
   * Determine path type
   */
  private determinePathType(path: string): 'absolute' | 'relative' | 'url' | 'unknown' {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return 'url';
    }
    
    if (this.isAbsolutePath(path)) {
      return 'absolute';
    }
    
    if (path.startsWith('./') || path.startsWith('../') || !path.includes('/')) {
      return 'relative';
    }
    
    return 'unknown';
  }

  /**
   * Check if path exists on filesystem
   */
  private pathExists(path: string): boolean {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  }

  /**
   * Create empty result object
   */
  private createEmptyResult(originalPath: string): PathResolutionResult {
    return {
      resolvedPath: originalPath,
      exists: false,
      pathType: 'unknown',
      warnings: [],
      originalPath,
      appliedTransforms: []
    };
  }

  /**
   * Update path resolution options
   */
  updateOptions(newOptions: Partial<PathResolutionOptions>): void {
    this.options = { ...this.options, ...newOptions };
    // Clear cached project structure if base directory changed
    if (newOptions.baseDir) {
      this.projectStructure = undefined;
    }
  }

  /**
   * Get current path resolution options
   */
  getOptions(): PathResolutionOptions {
    return { ...this.options };
  }

  /**
   * Get detected project structure
   */
  getProjectStructure(): ProjectStructure | undefined {
    return this.projectStructure;
  }
}

/**
 * Convenience function for quick image path resolution
 */
export function resolveImagePath(
  imagePath: string, 
  options?: Partial<PathResolutionOptions>,
  contextPath?: string
): PathResolutionResult {
  const resolver = new ImprovedPathResolver(options);
  return resolver.resolveImagePath(imagePath, contextPath);
}

/**
 * Convenience function for quick variable path resolution
 */
export function resolveVariablePath(
  variablePath: string, 
  options?: Partial<PathResolutionOptions>,
  contextPath?: string
): PathResolutionResult {
  const resolver = new ImprovedPathResolver(options);
  return resolver.resolveVariablePath(variablePath, contextPath);
}