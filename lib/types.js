/**
 * @typedef {Object} MonorepoPackage
 * @property {string} name
 * @property {string} path
 * @property {boolean=} private
 * @property {boolean=} release
 * @property {string[]=} dependsOn
 * @property {string=} tagFormat
 * @property {unknown[]=} plugins
 * @property {string|Object=} baseConfig
 */

/**
 * @typedef {Object} PlannedPackageRelease
 * @property {string} name
 * @property {string} path
 * @property {boolean} changed
 * @property {string=} skipped
 * @property {Array<{hash: string, message: string}>} commits
 * @property {Object=} lastRelease
 * @property {Object=} nextRelease
 * @property {string=} notes
 */

/**
 * @typedef {Object} ReleasePlan
 * @property {PlannedPackageRelease[]} packages
 * @property {string[]} order
 */

export {};
