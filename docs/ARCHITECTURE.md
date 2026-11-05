# Muzify — Application Architecture

## 1. Architecture Overview

Muzify uses a React Native and Expo architecture with additional custom Android native functionality.

The application is divided into several major layers.

### Presentation Layer

Responsible for:

- Screens.
- Components.
- Navigation layouts.
- User interactions.
- Visual presentation.

Location: `src/app/`, `src/components/`, `src/screens/`.

### Application State Layer

Responsible for:

- Shared player state.
- Current track.
- Playback controls.
- Queue state.
- Onboarding state.
- Other shared application state.

Location: `src/context/`.

### Data Layer

Responsible for:

- Music library records.
- Song metadata.
- Database operations.
- Persistence.
- Data retrieval.

Inspect the actual implementation before documenting individual services and database tables.

### Native Android Layer

Responsible for Android-specific functionality.

Location:

- `modules/`
- `config-plugins/`

Existing native functionality includes audio metadata integration and Android configuration.

## 2. Application Entry

The project uses Expo Router.

`index.js` imports:

`expo-router/entry`

The Expo application configuration is defined in `app.json`.

## 3. Major Project Directories

| Directory | Responsibility |
|---|---|
| `src/app/` | File-based routes and layouts |
| `src/screens/` | Application screens |
| `src/components/` | Reusable UI components |
| `src/context/` | Shared React state |
| `src/constants/` | Shared constants |
| `src/players/` | Player screen implementations |
| `src/playlists/` | Playlist-related screens |
| `src/artists/` | Artist-related screens |
| `modules/` | Custom native modules |
| `config-plugins/` | Expo native configuration plugins |
| `assets/` | Images and static assets |

## 4. Native Communication

JavaScript communicates with native Android functionality through the existing Expo native module interfaces.

The audio metadata module is located at:

`modules/audio-metadata/`

Native integration must be understood from both sides:

1. JavaScript interface.
2. Kotlin implementation.

The configuration plugin and Android build configuration must also be considered.

## 5. Architectural Boundaries

Do not place Android-specific operations directly inside presentation components.

Do not duplicate database logic inside multiple screens.

Do not place unrelated UI state inside global contexts.

Keep responsibilities separated.

## 6. Architecture Change Policy

Before introducing a new architectural pattern:

1. Inspect the existing implementation.
2. Identify the limitation.
3. Explain why the current approach is insufficient.
4. Consider the smallest compatible solution.
5. Update the relevant documentation after implementation.

## 7. Verification

This document is a high-level architectural guide.

Detailed implementation relationships must be verified against the source code.