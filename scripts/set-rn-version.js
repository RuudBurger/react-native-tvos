/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

/**
 * This script updates relevant React Native files with supplied version:
 *   * Prepares a package.json suitable for package consumption
 *   * Updates package.json for template project
 *   * Updates the version in gradle files and makes sure they are consistent between each other
 *   * Creates a gemfile
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {cat, echo, exec, exit, sed} = require('shelljs');
const yargs = require('yargs');
const {parseVersion, validateBuildType} = require('./version-utils');
const {saveFiles} = require('./scm-utils');

let argv = yargs
  .option('c', {
    alias: 'commit',
    type: 'boolean',
    default: false,
  })
  .option('v', {
    alias: 'to-version',
    type: 'string',
    required: true,
  })
  .option('b', {
    alias: 'build-type',
    type: 'string',
    required: true,
  }).argv;

const buildType = argv.buildType;
const version = argv.toVersion;
const commit = argv.commit || false;

try {
  validateBuildType(buildType);
} catch (e) {
  throw e;
}

let major,
  minor,
  patch,
  prerelease = -1;
try {
  ({major, minor, patch, prerelease} = parseVersion(version, buildType));
} catch (e) {
  throw e;
}

const tmpVersioningFolder = fs.mkdtempSync(
  path.join(os.tmpdir(), 'rn-set-version'),
);
echo(`The temp versioning folder is ${tmpVersioningFolder}`);

saveFiles(
  [
    'packages/react-native/package.json',
    'packages/react-native/template/package.json',
  ],
  tmpVersioningFolder,
);

fs.writeFileSync(
  'packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/systeminfo/ReactNativeVersion.java',
  cat('scripts/versiontemplates/ReactNativeVersion.java.template')
    .replace('${major}', major)
    .replace('${minor}', minor)
    .replace('${patch}', patch)
    .replace(
      '${prerelease}',
      prerelease !== undefined ? `"${prerelease}"` : 'null',
    ),
  'utf-8',
);

fs.writeFileSync(
  'packages/react-native/React/Base/RCTVersion.m',
  cat('scripts/versiontemplates/RCTVersion.m.template')
    .replace('${major}', `@(${major})`)
    .replace('${minor}', `@(${minor})`)
    .replace('${patch}', `@(${patch})`)
    .replace(
      '${prerelease}',
      prerelease !== undefined ? `@"${prerelease}"` : '[NSNull null]',
    ),
  'utf-8',
);

fs.writeFileSync(
  'packages/react-native/ReactCommon/cxxreact/ReactNativeVersion.h',
  cat('scripts/versiontemplates/ReactNativeVersion.h.template')
    .replace('${major}', major)
    .replace('${minor}', minor)
    .replace('${patch}', patch)
    .replace(
      '${prerelease}',
      prerelease !== undefined ? `"${prerelease}"` : '""',
    ),
  'utf-8',
);

fs.writeFileSync(
  'packages/react-native/Libraries/Core/ReactNativeVersion.js',
  cat('scripts/versiontemplates/ReactNativeVersion.js.template')
    .replace('${major}', major)
    .replace('${minor}', minor)
    .replace('${patch}', patch)
    .replace(
      '${prerelease}',
      prerelease !== undefined ? `'${prerelease}'` : 'null',
    ),
  'utf-8',
);

{
  const packageJson = JSON.parse(cat('package.json'));
  packageJson.version = version;
  // Add react-native-core dependency
  const coreVersion = version.split('-')[0];
  packageJson.devDependencies[
    'react-native-core'
  ] = `npm:react-native@${coreVersion}`;
  
  fs.writeFileSync(
    'package.json',
    JSON.stringify(packageJson, null, 2),
    'utf-8',
  );
}

{
  const packageJson = JSON.parse(cat('packages/react-native/package.json'));
  packageJson.version = version;
  
  fs.writeFileSync(
    'packages/react-native/package.json',
    JSON.stringify(packageJson, null, 2),
    'utf-8',
  );
}

// Change ReactAndroid/gradle.properties
saveFiles(
  ['packages/react-native/ReactAndroid/gradle.properties'],
  tmpVersioningFolder,
);
if (
  sed(
    '-i',
    /^VERSION_NAME=.*/,
    `VERSION_NAME=${version}`,
    'packages/react-native/ReactAndroid/gradle.properties',
  ).code
) {
  echo("Couldn't update version for Gradle");
  exit(1);
}

// Change react-native version in the template's package.json
//exec(`node scripts/set-rn-template-version.js ${version}`);
exec(`node scripts/set-rn-template-version.js ${version}`);

// Make sure to update ruby version
if (exec('scripts/update-ruby.sh').code) {
  echo('Failed to update Ruby version');
  exit(1);
}

// Verify that files changed, we just do a git diff and check how many times version is added across files
const filesToValidate = [
  'packages/react-native/package.json',
  'packages/react-native/ReactAndroid/gradle.properties',
  'packages/react-native/template/package.json',
];

const numberOfChangedLinesWithNewVersion = exec(
  `diff -r ${tmpVersioningFolder} . | grep '^[>]' | grep -c ${version} `,
  {silent: true},
).stdout.trim();

if (+numberOfChangedLinesWithNewVersion !== filesToValidate.length) {
  // TODO: the logic that checks whether all the changes have been applied
  // is missing several files. For example, it is not checking Ruby version nor that
  // the Objecive-C files, the codegen and other files are properly updated.
  // We are going to work on this in another PR.
  echo('WARNING:');
  echo(
    `Failed to update all the files: [${filesToValidate.join(
      ', ',
    )}] must have versions in them`,
  );
  echo(`These files already had version ${version} set.`);
}

if (buildType === 'release') {
  echo('Updating RNTester Podfile.lock...');
  if (exec('source scripts/update_podfile_lock.sh && update_pods').code) {
    echo('Failed to update RNTester Podfile.lock.');
    echo('Fix the issue, revert and try again.');
    exit(1);
  }
  echo('Executing yarn to update yarn.lock...');
  if (exec('yarn').code) {
    echo('Failed to update yarn.lock.');
    echo('Fix the issue, revert and try again.');
    exit(1);
  }
}

if (commit) {
  const filesToCommit = [
    'packages/react-native/Libraries/Core/ReactNativeVersion.js',
    'packages/react-native/React/Base/RCTVersion.m',
    'packages/react-native/ReactAndroid/gradle.properties',
    'packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/systeminfo/ReactNativeVersion.java',
    'packages/react-native/ReactCommon/cxxreact/ReactNativeVersion.h',
    'packages/react-native/package.json',
    'packages/react-native/template/package.json',
    'packages/rn-tester/Podfile.lock',
    'package.json',
    'yarn.lock',
  ];
  exec('yarn');
  exec(`git add ${filesToCommit.join(' ')}`);
  exec(`git commit -m "Bump version number (${version})"`);
}

exit(0);
