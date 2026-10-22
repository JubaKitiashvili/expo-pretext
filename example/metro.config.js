const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Watch the parent package source
config.watchFolders = [workspaceRoot]

// Resolve modules only from example/node_modules (avoid hoisted duplicates
// in the workspace root, which may have different RN/React versions from
// devDependencies/test setup).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
]

// Prevent duplicate React — also forces symlink targets (the library
// source in workspaceRoot/src) to resolve peer deps through example/.
config.resolver.disableHierarchicalLookup = true

// Force singleton resolution for peer deps, regardless of which file
// (example app OR the library source via symlink) does the import.
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) =>
      path.join(projectRoot, 'node_modules', name.toString()),
  },
)

// SDK 55 enables package exports by default, but RN 0.83's exports field
// doesn't list deep subpaths (e.g. Libraries/Core/InitializeCore) that
// @expo/metro-runtime needs. Disable exports and map subpaths manually.
config.resolver.unstable_enablePackageExports = false

// Resolve expo-pretext to the library source, so the example runs without
// building the package first (its main/exports point at build/).
const origResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-pretext') {
    return context.resolveRequest(context, path.join(workspaceRoot, 'src', 'index.ts'), platform)
  }
  if (moduleName === 'expo-pretext/animated') {
    return context.resolveRequest(context, path.join(workspaceRoot, 'src', 'animated.ts'), platform)
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
