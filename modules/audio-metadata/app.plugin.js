const { withSettingsGradle, withAppBuildGradle, withMainApplication, createRunOncePlugin } = require("@expo/config-plugins");
const pkg = require("./package.json");

const withAudioMetadata = (config) => {
  // Add the module to settings.gradle so it's included in the build
  config = withSettingsGradle(config, (config) => {
    const modResults = config.modResults;
    const includeLine = "include ':muzify-audio-metadata'";
    const projectDirLine = "project(':muzify-audio-metadata').projectDir = new File(rootProject.projectDir, '../modules/audio-metadata/android')";

    if (!modResults.contents.includes("muzify-audio-metadata")) {
      modResults.contents = modResults.contents.replace(
        /include ':app'/,
        `${includeLine}\n${projectDirLine}\ninclude ':app'`
      );
    }

    return config;
  });

  // Add the dependency to app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    const modResults = config.modResults;
    if (!modResults.contents.includes("muzify-audio-metadata")) {
      modResults.contents = modResults.contents.replace(
        /dependencies \{/,
        "dependencies {\n    implementation project(':muzify-audio-metadata')"
      );
    }
    return config;
  });

  // Register the native package in MainApplication
  config = withMainApplication(config, (config) => {
    const modResults = config.modResults;
    if (!modResults.contents.includes("AudioMetadataPackage")) {
      // Add import
      modResults.contents = modResults.contents.replace(
        /package com\.aaditya_aks\.muzify;/,
        "package com.aaditya_aks.muzify;\n\nimport com.muzify.audiometadata.AudioMetadataPackage;"
      );

      // Add to getPackages()
      modResults.contents = modResults.contents.replace(
        /packages\.add\(new\s+\w+Package\(\)/,
        "packages.add(new AudioMetadataPackage())\n        packages.add(new"
      );
    }
    return config;
  });

  return config;
};

module.exports = createRunOncePlugin(withAudioMetadata, pkg.name, pkg.version);