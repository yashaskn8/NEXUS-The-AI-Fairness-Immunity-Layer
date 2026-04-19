import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  forceExit: true,
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: { lines: 50, branches: 40, functions: 50, statements: 50 },
  },
};

export default config;

