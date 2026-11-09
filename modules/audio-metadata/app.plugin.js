const {
  withSettingsGradle,
  withAppBuildGradle,
  withMainApplication,
  createRunOncePlugin,
} = require("@expo/config-plugins");
const pkg = require("./package.json");

const PROJECT_NAME = "muzify-audio-metadata";
const RELATIVE_ANDROID_DIR = "../modules/audio-metadata/android";

function ensureSettingsInclude(contents, isKts) {
  if (
    contents.includes(`':${PROJECT_NAME}'`) ||
    contents.includes(`":${PROJECT_NAME}"`)
  ) {
    if (!contents.includes("modules/audio-metadata/android")) {
      const dirLine = isKts
        ? `project(":${PROJECT_NAME}").projectDir = File(rootProject.projectDir, "${RELATIVE_ANDROID_DIR}")\n`
        : `project(':${PROJECT_NAME}').projectDir = new File(rootProject.projectDir, '${RELATIVE_ANDROID_DIR}')\n`;
      return `${contents.trimEnd()}\n${dirLine}`;
    }
    return contents;
  }

  const snippet = isKts
    ? `
include(":${PROJECT_NAME}")
project(":${PROJECT_NAME}").projectDir = File(rootProject.projectDir, "${RELATIVE_ANDROID_DIR}")
`
    : `
include ':${PROJECT_NAME}'
project(':${PROJECT_NAME}').projectDir = new File(rootProject.projectDir, '${RELATIVE_ANDROID_DIR}')
`;

  return `${contents.trimEnd()}\n${snippet}`;
}

function ensureAppDependency(contents, isKts) {
  if (
    contents.includes(`':${PROJECT_NAME}'`) ||
    contents.includes(`":${PROJECT_NAME}"`)
  ) {
    return contents;
  }

  const dep = isKts
    ? `    implementation(project(":${PROJECT_NAME}"))\n`
    : `    implementation project(':${PROJECT_NAME}')\n`;

  return contents.replace(/dependencies\s*\{/, `dependencies {\n${dep}`);
}

const withAudioMetadata = (config) => {
  config = withSettingsGradle(config, (config) => {
    const isKts = config.modResults.language === "kts";
    config.modResults.contents = ensureSettingsInclude(
      config.modResults.contents,
      isKts,
    );
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    const isKts = config.modResults.language === "kts";
    config.modResults.contents = ensureAppDependency(
      config.modResults.contents,
      isKts,
    );
    return config;
  });

  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes("AudioMetadataPackage")) {
      return config;
    }

    if (contents.includes("package com.aaditya_aks.muzify")) {
      contents = contents.replace(
        /package com\.aaditya_aks\.muzify;?/,
        "package com.aaditya_aks.muzify\n\nimport com.muzify.audiometadata.AudioMetadataPackage",
      );
    }

    if (contents.includes("PackageList(this).packages.apply {")) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        "PackageList(this).packages.apply {\n          add(AudioMetadataPackage())",
      );
    } else if (/packages\.add\(new\s+\w+Package\(\)/.test(contents)) {
      contents = contents.replace(
        /packages\.add\(new\s+\w+Package\(\)/,
        "packages.add(new AudioMetadataPackage())\n        packages.add(new",
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

module.exports = createRunOncePlugin(withAudioMetadata, pkg.name, pkg.version);
