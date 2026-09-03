module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true
      }
    ]
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  setupFiles: ["<rootDir>/test/setup-env.cjs"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts"]
};
