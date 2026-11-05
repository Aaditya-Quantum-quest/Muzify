// Config plugin: injects the Jaudiotagger dependency into app/build.gradle.
const { withAppBuildGradle } = require("@expo/config-plugins");

const JAUDIOTAGGER_COORD = "net.jthink:jaudiotagger:3.0.1";

const withJaudiotagger = (config) =>
  withAppBuildGradle(config, (config) => {
    const modResults = config.modResults;

    if (!modResults.contents.includes(JAUDIOTAGGER_COORD)) {
      modResults.contents = modResults.contents.replace(
        /dependencies \{/,
        `dependencies {\n    implementation '${JAUDIOTAGGER_COORD}'`
      );
    }

    return config;
  });

module.exports = withJaudiotagger;