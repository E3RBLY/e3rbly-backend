module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  verbose: true,
  // Coverage on demand: `npm test -- --coverage`
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  // server.js calls app.listen() on import; this closes that handle after the run.
  forceExit: true,
};
