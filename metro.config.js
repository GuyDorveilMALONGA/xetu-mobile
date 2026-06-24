const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'wasm' to the list of asset extensions to support expo-sqlite web build
config.resolver.assetExts.push('wasm');

module.exports = config;
