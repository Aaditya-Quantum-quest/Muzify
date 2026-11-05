const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Ensure Metro resolves react-native-gesture-handler to its compiled module
// instead of its TypeScript source (which has web-only imports that break native builds)
config.resolver.alias = {
  ...config.resolver.alias,
  "react-native-gesture-handler": require.resolve("react-native-gesture-handler"),
};

module.exports = withNativeWind(config, {
  input: "./global.css",
});