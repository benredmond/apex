export default {
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowJs: true,
          target: 'ES2022'
        }
      }
    ]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.test.ts',
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.ts',
    '!src/cli/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};