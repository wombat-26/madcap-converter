declare module 'htmltidy2' {
  interface TidyOptions {
    [key: string]: any;
    'fix-bad-uri'?: boolean;
    'fix-uri'?: boolean;
    'merge-divs'?: boolean;
    'merge-spans'?: boolean;
    'drop-empty-elements'?: boolean;
    'indent'?: boolean;
    'wrap'?: number;
    'tidy-mark'?: boolean;
    'doctype'?: string;
    'new-blocklevel-tags'?: string;
    'new-inline-tags'?: string;
    'new-empty-tags'?: string;
    'force-output'?: boolean;
    'quiet'?: boolean;
    'show-warnings'?: boolean;
    'alt-text'?: string;
    'fix-bad-nesting'?: boolean;
    'coerce-endtags'?: boolean;
    'omit-optional-tags'?: boolean;
  }

  export function tidy(
    html: string, 
    options: TidyOptions, 
    callback: (err: Error | null, result: string) => void
  ): void;

  export function createWorker(options?: TidyOptions, binary?: string): any;
}