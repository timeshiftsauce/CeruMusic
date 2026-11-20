module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          isolatedModules: true,
          esModuleInterop: true,
          allowJs: true,
          paths: {
            '@common/*': ['./src/common/*']
          }
        }
      }
    ]
  },
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@/main/(.*)$': '<rootDir>/src/main/$1',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  roots: ['<rootDir>/src'],
  transformIgnorePatterns: ['/node_modules/(?!@shiqianjiang/ceru-plugin-sdk/)'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/']
}
