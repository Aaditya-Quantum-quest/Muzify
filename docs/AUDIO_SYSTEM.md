# Muzify — Audio System

## 1. Purpose

The audio system handles information associated with music files stored on the Android device.

Its responsibilities include:

- Discovering audio files.
- Reading audio metadata.
- Extracting song information.
- Managing metadata records.
- Updating metadata where supported.
- Making audio information available to the application.

## 2. Metadata Fields

Potential metadata fields include:

- Title.
- Artist.
- Album.
- Album artist.
- Genre.
- Duration.
- Track number.
- Year.
- Composer.
- Artwork.
- File path.
- File size.
- MIME type.

Verify which fields are actually supported by the current implementation.

## 3. Native Metadata Module

Location:

`modules/audio-metadata/`

Android implementation:

`modules/audio-metadata/android/src/main/java/com/muzify/audiometadata/AudioMetadataModule.kt`

Module name:

`AudioMetadata`

The existing module is implemented as a Kotlin Expo native module.

Its previously inspected implementation exposed three React methods. Always inspect the current interface to identify their exact names, parameters, and behavior.

## 4. Jaudiotagger Integration

Jaudiotagger integration is associated with:

`config-plugins/withJaudiotagger.js`

Inspect the actual plugin and native Gradle configuration to understand:

- Dependency configuration.
- Android integration.
- Supported audio formats.
- Library version.
- Build compatibility.

Do not assume every format supports identical metadata operations.

## 5. JavaScript and Native Responsibilities

JavaScript should handle application-level requests and presentation.

Kotlin should handle Android-specific native operations.

Avoid duplicating metadata parsing in JavaScript if the native implementation already provides the required information.

## 6. Metadata Writing

Before implementing metadata writing:

1. Inspect the existing native module.
2. Inspect the Jaudiotagger integration.
3. Check supported file formats.
4. Check Android storage permissions.
5. Check Android scoped storage restrictions.
6. Preserve existing metadata when modifying individual fields.
7. Handle write failures safely.
8. Verify that changes persist after reopening the file.

Do not assume that reading metadata and writing metadata require identical permissions.

## 7. Important Rules

- Never modify original audio files unnecessarily.
- Never overwrite unrelated metadata fields.
- Handle unsupported formats gracefully.
- Handle missing tags.
- Handle corrupted files.
- Avoid blocking the UI during large scans.
- Avoid unnecessary repeated metadata extraction.
- Verify native behavior on a real Android device.

## 8. Implementation References

For every audio-related task, inspect only the relevant files and their direct consumers.

Update this document whenever metadata capabilities or native interfaces change.