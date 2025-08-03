/**
 * Mock implementation of madcap-htm-validator
 * Used for testing when the actual validator is not available
 */

export class MadCapHtmValidator {
  constructor(options = {}) {
    this.options = options;
  }

  async validate(htmlContent) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      fixedContent: htmlContent
    };
  }

  async fix(htmlContent) {
    return htmlContent;
  }
}

export default MadCapHtmValidator;