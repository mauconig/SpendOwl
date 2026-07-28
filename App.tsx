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
import { RootScreen } from './src/RootScreen';
import { SpendOwlProvider, useSpendOwl } from './src/store/SpendOwlContext';
import { ErrorScreen, LoadingScreen } from './src/screens/LoadingScreen';
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
      <DataGate />
    </SpendOwlProvider>
  );
}

// Inside SpendOwlProvider so it can see the query state. The screens below it
// all assume their data exists, so nothing renders until the first load
// resolves — and a failed load says so instead of showing zeroes.
function DataGate() {
  const { loading, error, retry } = useSpendOwl();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={retry} />;
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
