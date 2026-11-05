# Muzify — Navigation Architecture

## 1. Navigation Technology

Muzify uses Expo Router.

Entry point:

`index.js`

It imports:

`expo-router/entry`

## 2. Route Organization

Known route locations:

- `src/app/`
- `src/app/(tabs)/`
- `src/app/(public)/`

## 3. Known Application Routes

Previously identified routes include:

- Home.
- Settings.
- Library.
- Statistics.
- Public onboarding entry.
- Player screens.
- Playlist screens.
- Artist screens.

Verify the actual route tree before modifying navigation.

## 4. Layouts

Known layouts:

- `src/app/(tabs)/_layout.jsx`
- `src/app/(public)/_layout.jsx`

The tab layout previously included the MiniPlayer component.

## 5. Dynamic Routes

Known dynamic route patterns include:

- `[id].jsx`
- `[playlistId].jsx`
- `[artistsId].jsx`

Inspect the actual route parameters and consumers before changing them.

## 6. Navigation Rules

- Preserve existing route names.
- Avoid duplicate route definitions.
- Understand layout nesting before adding screens.
- Preserve dynamic route parameters.
- Check back navigation behavior.
- Avoid breaking deep links.
- Keep navigation logic consistent with Expo Router.

## 7. Navigation Changes

After modifying routes:

1. Inspect the route tree.
2. Verify imports.
3. Verify dynamic parameters.
4. Check nested layouts.
5. Test navigation between affected screens.
6. Update this document if the route architecture changes.