import type { Config } from 'jest';

const config: Config = {
  rootDir: './',
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    "src/**/*.ts",
    "!**/node_modules/**"
  ]
};

export default config;
