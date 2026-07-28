// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// server/ is a separate Node package that is never imported by the app. Without
// this, Metro crawls server/node_modules and can hit haste collisions on
// packages installed on both sides (typescript, @clerk/*).
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  new RegExp(`^${path.resolve(__dirname, 'server').replace(/[\\/]/g, '[\\\\/]')}[\\\\/].*$`),
];

module.exports = config;
