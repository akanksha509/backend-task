// jest.config.js

// increase rate limit during tests to avoid accidental throttling
process.env.RATE_LIMIT_MAX = "1000";

const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

module.exports = {
  testEnvironment: "node",               // run tests in a Node.js context
  transform: {
    ...tsJestTransformCfg,               // use ts-jest for TypeScript files
  },
};

