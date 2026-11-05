// Config plugin: declares the runtime permissions the app requests at
// runtime (PermissionsAndroid.request). Without these in the generated
// AndroidManifest.xml the system denies the request silently and the
// permission dialogs never appear.
const { withPermissions } = require("@expo/config-plugins/build/android/Permissions");

module.exports = (config) =>
  withPermissions(config, [
    "android.permission.READ_MEDIA_AUDIO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.POST_NOTIFICATIONS",
  ]);