import { useClerk } from '@clerk/expo';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { t } from '../i18n';

const LAST_ACTIVE_KEY = 'spendowl.lastActiveAt';
const LOCK_AFTER_MS = 5 * 60 * 1000;
const SIGN_OUT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type AppLockState = 'unlocked' | 'locked' | 'signing-out';

/**
 * Gates the app behind Face ID/fingerprint after ~5 minutes backgrounded, and
 * forces a full Clerk sign-out after ~7 days — independent checks, since a
 * quick app-switch shouldn't need a password but a phone left untouched for a
 * week shouldn't stay silently logged in either.
 *
 * The timestamp lives in SecureStore rather than component state because
 * `AppState` itself doesn't survive the process being killed between
 * launches, which is exactly the case the long-inactivity check exists for.
 */
export function useAppLock(bioEnabled: boolean) {
  const { signOut } = useClerk();
  const [state, setState] = useState<AppLockState>('unlocked');
  const appState = useRef(AppState.currentState);
  const checking = useRef(false);

  const promptBiometric = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
    if (!hasHardware || !isEnrolled) {
      // Nothing to gate on — don't strand someone with no biometrics set up.
      setState('unlocked');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('Unlock Nummus AI'),
      disableDeviceFallback: false,
    });
    if (result.success) {
      setState('unlocked');
      return;
    }
    // Biometrics that are fundamentally unusable right now (e.g. Face ID
    // inside Expo Go on iOS, which Expo Go cannot get entitled for) shouldn't
    // leave the user stuck behind a lock screen with no way to clear it.
    if (result.error === 'not_available' || result.error === 'no_space') {
      setState('unlocked');
      return;
    }
    setState('locked');
  }, []);

  const checkInactivity = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const raw = await SecureStore.getItemAsync(LAST_ACTIVE_KEY);
      const lastActive = raw ? Number(raw) : null;
      if (lastActive == null) {
        setState('unlocked');
        return;
      }

      const delta = Date.now() - lastActive;
      if (delta >= SIGN_OUT_AFTER_MS) {
        setState('signing-out');
        await SecureStore.deleteItemAsync(LAST_ACTIVE_KEY);
        await signOut();
        return;
      }
      if (delta >= LOCK_AFTER_MS && bioEnabled) {
        await promptBiometric();
        return;
      }
      setState('unlocked');
    } finally {
      checking.current = false;
    }
  }, [bioEnabled, promptBiometric, signOut]);

  useEffect(() => {
    void checkInactivity();

    const sub = AppState.addEventListener('change', next => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'background') {
        void SecureStore.setItemAsync(LAST_ACTIVE_KEY, String(Date.now()));
      } else if (prev !== 'active' && next === 'active') {
        void checkInactivity();
      }
    });

    return () => sub.remove();
  }, [checkInactivity]);

  return { state, retry: promptBiometric };
}
