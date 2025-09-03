// Shim for import.meta.url in CommonJS bundles
export const importMetaUrl = typeof __filename !== 'undefined' ? 'file://' + __filename : undefined;