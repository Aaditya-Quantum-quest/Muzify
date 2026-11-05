# Muzify — File Map

## 1. Root Files

| File | Responsibility |
|---|---|
| `App.js` | Root application component; inspect current implementation |
| `index.js` | Expo Router entry |
| `app.json` | Expo application configuration |
| `eas.json` | EAS build profiles |
| `package.json` | Dependencies and scripts |
| `babel.config.js` | Babel configuration |
| `metro.config.js` | Metro bundler configuration |
| `tailwind.config.js` | NativeWind/Tailwind configuration |
| `global.css` | Global styling |
| `tsconfig.json` | TypeScript configuration |
| `MERMAID.md` | Existing project structure diagram |
| `AGENTS.md` | Existing agent instructions |

## 2. Application Routes

Location: `src/app/`

Known route structure:

- `home.jsx`
- `settings.jsx`
- `library.jsx`
- `statistics.jsx`
- `(tabs)/_layout.jsx`
- `(public)/_layout.jsx`
- `(public)/index.jsx`

Inspect the actual directory before assuming these routes are unchanged.

## 3. Screens

Location: `src/screens/`

Known screens:

- `WelcomeScreen.jsx`
- `PermissionScreen.jsx`

## 4. Player Screens

Location: `src/players/`

Known player implementations:

- `PlayerScreen1/[id].jsx`
- `PlayerScreen2/[id].jsx`
- `PlayerScreen3/[id].jsx`

Inspect the route configuration and actual implementations before changing player navigation.

## 5. Playlist Screens

Location: `src/playlists/`

Known files:

- `playlists.jsx`
- `[playlistId].jsx`

The playlist listing was previously identified as a stub. Verify its current status before implementation.

## 6. Artist Screens

Location: `src/artists/`

Known files:

- `artists.jsx`
- `[artistsId].jsx`

## 7. Components

Location: `src/components/`

Known UI component:

`src/components/ui/MiniPlayer.jsx`

The tab layout imports MiniPlayer:

`src/app/(tabs)/_layout.jsx`

## 8. Context

Location: `src/context/`

Known file:

`player-context.jsx`

This file contains shared player and onboarding state.

It includes:

- Player theme.
- Track selection.
- Playback state.
- Playback position.
- Shuffle.
- Repeat.
- Queue.
- Onboarding state.
- Music folder selection.

Inspect the actual current implementation before modifying it.

## 9. Native Modules

Location: `modules/`

Known module:

`modules/audio-metadata/`

Known Kotlin implementation:

`modules/audio-metadata/android/src/main/java/com/muzify/audiometadata/AudioMetadataModule.kt`

This is an Expo native module named `AudioMetadata`.

Its interface and methods must be verified before changes.

## 10. Config Plugins

Location: `config-plugins/`

Known plugins:

- `withMuzifyPermissions.js`
- `withJaudiotagger.js`

Additional plugin:

`modules/audio-metadata/app.plugin.js`

## 11. File Discovery Rules

When implementing a feature:

1. Search this document.
2. Locate the primary implementation file.
3. Inspect its direct imports.
4. Inspect relevant consumers.
5. Expand only when necessary.

Update this map when files are added, removed, renamed, or responsibilities change.

Do not assume this map is exhaustive.