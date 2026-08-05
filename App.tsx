import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotoSans_400Regular, NotoSans_500Medium, NotoSans_700Bold } from '@expo-google-fonts/noto-sans';
import { NotoSansMono_400Regular } from '@expo-google-fonts/noto-sans-mono';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { RobotoMono_400Regular, RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthScreen } from './src/screens/AuthScreen';
import { LockScreen } from './src/screens/LockScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RootScreen } from './src/RootScreen';
import { SpendOwlProvider, useSpendOwl } from './src/store/SpendOwlContext';
import { ErrorScreen, LoadingScreen } from './src/screens/LoadingScreen';
import { useAppLock } from './src/hooks/useAppLock';
import { useBudgetAlerts } from './src/hooks/useBudgetAlerts';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — add it to .env.local (see .docs/RUNNING.md)');
}

// Sits inside ClerkProvider so it can read the session, and holds the splash
// screen until Clerk has finished restoring a cached session from the device
// keychain — otherwise a signed-in user sees AuthScreen flash on every launch.
function Gate() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [isLoaded]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <AuthScreen />;

  return (
    <SpendOwlProvider>
      <AppLockGate />
    </SpendOwlProvider>
  );
}

// Sits inside SpendOwlProvider (rather than around it, next to Gate's other
// branches) so it can read `store.bio` directly instead of standing up a
// second settings fetch just for this. Locked/signing-out both pre-empt
// DataGate — there's no reason to wait on the data queries behind a lock
// screen nobody can see yet.
function AppLockGate() {
  const store = useSpendOwl();
  const { state, retry } = useAppLock(store.bio);

  if (state === 'locked') return <LockScreen onRetry={retry} />;
  // 'checking' (still reading the stored timestamp, maybe waiting on the
  // biometric prompt) and 'signing-out' (the sign-out call is in flight —
  // Gate() will swap to AuthScreen the moment Clerk's isSignedIn flips) both
  // render nothing rather than real account data or a lock screen that might
  // not even be needed. The SafeAreaView behind this is already a plain dark
  // background, so nothing here reads as a blank flash — just dark, same as
  // a beat before the lock screen or the app itself appears.
  if (state === 'checking' || state === 'signing-out') return null;
  return <DataGate />;
}

// Inside SpendOwlProvider so it can see the query state. The screens below it
// all assume their data exists, so nothing renders until the first load
// resolves — and a failed load says so instead of showing zeroes.
function DataGate() {
  const store = useSpendOwl();
  const { loading, error, retry } = store;
  useBudgetAlerts(store.notif, store.summary, store.monthlyBudgetMinor);
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={retry} />;
  // A brand-new row (or one just reset to empty) starts unonboarded — see
  // server/src/migrations.ts version 12 — and sees the wizard here instead of
  // an empty Dashboard with nothing on it to explain why.
  if (!store.onboarded) return <OnboardingScreen />;
  return <RootScreen />;
}

// Retry once on failure: the common case is the phone briefly losing the dev
// server, not a genuinely bad request.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    RobotoMono_400Regular,
    RobotoMono_500Medium,
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_700Bold,
    NotoSansMono_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top', 'left', 'right']}>
            <Gate />
            <StatusBar style="light" />
          </SafeAreaView>
        </QueryClientProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
