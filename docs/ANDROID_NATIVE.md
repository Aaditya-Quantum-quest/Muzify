# Muzify — Android Native Architecture

## 1. Purpose

This document describes Android-specific functionality and the integration between React Native, Expo, and Kotlin.

## 2. Native Technology

- Kotlin.
- Expo Modules API.
- Android native APIs.
- Jaudiotagger integration.
- Expo config plugins.

## 3. Native Module

Location:

`modules/audio-metadata/`

Kotlin implementation:

`modules/audio-metadata/android/src/main/java/com/muzify/audiometadata/AudioMetadataModule.kt`

Module name:

`AudioMetadata`

This module is registered through its Expo module integration.

Verify the current module definition and registration before modifying it.

## 4. Config Plugins

Existing plugin files:

- `config-plugins/withMuzifyPermissions.js`
- `config-plugins/withJaudiotagger.js`
- `modules/audio-metadata/app.plugin.js`

Their responsibilities must be verified by reading the plugin implementations.

## 5. Android Permissions

The project has a custom permission configuration plugin.

Before modifying permissions, investigate:

- Android SDK requirements.
- Manifest declarations.
- Runtime permission requests.
- Android version compatibility.
- Scoped storage behavior.
- MediaStore access.
- Audio file access restrictions.

Never assume permissions are identical across Android versions.

## 6. Native Build Rules

Native code changes may require rebuilding the Android application.

Distinguish between:

- JavaScript-only changes.
- Expo configuration changes.
- Kotlin changes.
- Android manifest changes.
- Gradle dependency changes.

Do not tell the user that a JavaScript reload is sufficient for native changes.

## 7. Native Module Modification Procedure

Before modifying a native module:

1. Inspect its Kotlin implementation.
2. Inspect its JavaScript interface.
3. Inspect all consumers.
4. Inspect its Expo config plugin.
5. Inspect Android permissions.
6. Check build dependencies.
7. Make the smallest compatible change.
8. Verify using an Android build and device testing when possible.

## 8. Important Restrictions

- Preserve the existing native module contract unless intentionally changing it.
- Avoid duplicate native implementations.
- Handle exceptions properly.
- Avoid blocking the main thread with heavy operations.
- Verify Android API compatibility.
- Document changes to native interfaces.