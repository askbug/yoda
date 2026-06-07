/* global require, module, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const reactNativeNodeModules = path.resolve(
  workspaceRoot,
  'node_modules/react-native/node_modules'
);
const canonicalReact = path.resolve(reactNativeNodeModules, 'react');

function escapePath(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.blockList = exclusionList([
  new RegExp(`${escapePath(path.resolve(projectRoot, 'node_modules/react'))}/.*`),
  new RegExp(`${escapePath(path.resolve(workspaceRoot, 'node_modules/react'))}/.*`),
  new RegExp(
    `${escapePath(path.resolve(workspaceRoot, 'node_modules'))}/(?!react-native/node_modules/react/).*?/node_modules/react/.*`
  ),
]);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: canonicalReact,
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(
      {
        ...context,
        nodeModulesPaths: [reactNativeNodeModules],
      },
      moduleName,
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
