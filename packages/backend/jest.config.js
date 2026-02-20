/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        resolveJsonModule: true,
        types: ['jest', 'node'],
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/server.ts',
  ],
};
