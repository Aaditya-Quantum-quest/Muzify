# Muzify — Project Overview

## 1. Project Identity

**Project Name:** Muzify  
**Application Type:** Local Music Player  
**Platform Priority:** Android  
**Framework:** React Native + Expo  
**Navigation:** Expo Router  
**Language:** JavaScript / JSX  
**Styling:** NativeWind  
**Database:** Expo SQLite  
**Native Language:** Kotlin

## 2. Project Purpose

Muzify is a music player application designed to play and manage locally stored music files on Android devices.

The application focuses on providing a modern music listening experience with a functional local music library.

## 3. Main Functional Areas

The project contains the following functional areas:

- Onboarding.
- Android permission management.
- Local music library.
- Song information and metadata.
- Music playback.
- Mini player.
- Full-screen player interfaces.
- Playlist management.
- Artist browsing.
- Settings.
- Listening statistics.
- Audio metadata reading and writing.

Feature status must be verified against the actual implementation.

A visible UI does not automatically mean that its underlying functionality is complete.

## 4. Technology Stack

| Technology | Responsibility |
|---|---|
| React Native | Mobile application UI |
| Expo | Application framework |
| Expo Router | Navigation |
| NativeWind | Styling |
| React Context | Shared application state |
| Expo SQLite | Local database |
| Kotlin | Android native functionality |
| Jaudiotagger | Audio metadata operations |
| Expo Config Plugins | Native project configuration |
| EAS Build | Android application builds |

Verify exact installed versions using package.json and package-lock.json.

## 5. Important Architectural Principles

- Keep UI and business logic separated.
- Keep native Android operations inside native modules.
- Avoid duplicating metadata extraction logic.
- Keep playback state centralized where appropriate.
- Preserve existing database relationships.
- Avoid unnecessary filesystem operations.
- Keep Android-specific functionality isolated.

## 6. Project Development Philosophy

Muzify should be developed incrementally.

Prefer small, testable changes over large architectural rewrites.

Every feature should be evaluated for:

- Functionality.
- Reliability.
- Performance.
- Android compatibility.
- Maintainability.
- User experience.

## 7. Documentation Policy

This document describes the project at a high level.

For implementation details, consult the relevant documentation in the docs directory.