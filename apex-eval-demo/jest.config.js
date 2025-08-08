export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    '**/validation/**/*.js',
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'services/**/*.js',
    'shared/**/*.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000
};