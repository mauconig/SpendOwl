# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

**Stay on SDK 54.** It is the only version Expo Go supports, and this app has to
run in Expo Go — the custom Clerk auth flow in `src/screens/AuthScreen.tsx`
exists precisely to avoid the prebuilt components that would require a native
dev build. Do not upgrade the `expo` dependency to chase newer docs.
