/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^.*madcap-htm-validator.*$': '<rootDir>/tests/__mocks__/madcap-htm-validator.js',
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>/app', '<rootDir>/components'],
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/?(*.)+(spec|test).{ts,tsx}'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022',
        moduleResolution: 'node',
        jsx: 'react-jsx'
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    'app/**/*.ts',
    'components/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!build/**',
    '!**/*.stories.tsx'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'], // Disabled for project-specific setups
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 10000,
  transformIgnorePatterns: [
    'node_modules/(?!(w3c-html-validator|html-validate|chalk|cheerio)/)'
  ],
  projects: [
    {
      displayName: 'API Tests',
      testMatch: ['<rootDir>/tests/api/**/*.test.ts'],
      testEnvironment: 'node',
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@/(.*)$': '<rootDir>/$1',
        '^.*madcap-htm-validator.*$': '<rootDir>/tests/__mocks__/madcap-htm-validator.js',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            module: 'ES2022',
            target: 'ES2022',
            moduleResolution: 'node'
          }
        }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(w3c-html-validator|html-validate|chalk|cheerio)/)'
      ]
    },
    {
      displayName: 'Component Tests',
      testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup-jsdom.ts'],
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@/(.*)$': '<rootDir>/$1',
        '^.*madcap-htm-validator.*$': '<rootDir>/tests/__mocks__/madcap-htm-validator.js',
      },
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            module: 'ES2022',
            target: 'ES2022',
            moduleResolution: 'node',
            jsx: 'react-jsx'
          }
        }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(w3c-html-validator|html-validate|chalk|cheerio|@radix-ui|lucide-react|class-variance-authority|clsx|tailwind-merge)/)'
      ]
    },
    {
      displayName: 'Core Tests',
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/api/**', '!<rootDir>/tests/components/**'],
      testEnvironment: 'node',
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@/(.*)$': '<rootDir>/$1',
        '^.*madcap-htm-validator.*$': '<rootDir>/tests/__mocks__/madcap-htm-validator.js',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            module: 'ES2022',
            target: 'ES2022',
            moduleResolution: 'node'
          }
        }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(w3c-html-validator|html-validate|chalk|cheerio)/)'
      ]
    }
  ]
};