import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock File System Access API
Object.defineProperty(window, 'showDirectoryPicker', {
  writable: true,
  value: jest.fn(),
});

// Mock fetch
global.fetch = jest.fn();

// Mock URL.createObjectURL and revokeObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(() => 'mocked-object-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: jest.fn(),
});

// Mock FileReader
global.FileReader = class MockFileReader {
  result: string | ArrayBuffer | null = null;
  error: any = null;
  readyState: number = 0;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

  readAsText() {
    this.result = 'mocked file content';
    this.readyState = 2;
    if (this.onload) {
      this.onload({} as ProgressEvent<FileReader>);
    }
  }

  readAsArrayBuffer() {
    this.result = new ArrayBuffer(8);
    this.readyState = 2;
    if (this.onload) {
      this.onload({} as ProgressEvent<FileReader>);
    }
  }

  readAsDataURL() {
    this.result = 'data:text/plain;base64,bW9ja2VkIGZpbGU=';
    this.readyState = 2;
    if (this.onload) {
      this.onload({} as ProgressEvent<FileReader>);
    }
  }

  abort() {
    this.readyState = 2;
    if (this.onabort) {
      this.onabort({} as ProgressEvent<FileReader>);
    }
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
};