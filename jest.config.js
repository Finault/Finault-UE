export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['**/tests/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: [
    'platform/**/*.js',
    'apps/gateway/**/*.js',
    '!**/node_modules/**'
  ]
};
