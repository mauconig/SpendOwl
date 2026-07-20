import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { RobotoMono_400Regular, RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';
import { NotoSans_400Regular, NotoSans_500Medium, NotoSans_700Bold } from '@expo-google-fonts/noto-sans';
import { NotoSansMono_400Regular } from '@expo-google-fonts/noto-sans-mono';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { RootScreen } from './src/RootScreen';
import { SpendOwlProvider } from './src/store/SpendOwlContext';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }} edges={['top', 'left', 'right']} onLayout={onLayout}>
        <SpendOwlProvider>
          <RootScreen />
        </SpendOwlProvider>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
