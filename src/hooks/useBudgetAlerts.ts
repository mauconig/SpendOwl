import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import type { ApiSummary } from '../api/types';
import { t, tf } from '../i18n';

// Local (in-app) notifications only — there is no push backend, and Expo Go
// on Android has dropped remote push since SDK 53 anyway. Local notifications
// are unaffected by that and need no dev build.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const THRESHOLDS = [80, 100] as const;

function alertKey(month: string, threshold: number): string {
  return `spendowl.budgetAlert.${month}.${threshold}`;
}

/**
 * Fires a local notification the first time this month's spend crosses 80%
 * and 100% of the monthly budget. Re-derived from `summary` on every render
 * rather than polled on its own timer — the SecureStore key per
 * month+threshold is what stops that from re-firing on every refetch.
 */
export function useBudgetAlerts(notifEnabled: boolean, summary: ApiSummary | null, monthlyBudgetMinor: number) {
  useEffect(() => {
    if (!notifEnabled || !summary || monthlyBudgetMinor <= 0) return;

    const pct = (summary.spentMinor / monthlyBudgetMinor) * 100;
    const crossed = THRESHOLDS.filter(threshold => pct >= threshold);
    if (crossed.length === 0) return;

    void (async () => {
      const current = await Notifications.getPermissionsAsync();
      let granted = current.status === 'granted';
      if (!granted) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.status === 'granted';
      }
      if (!granted) return;

      for (const threshold of crossed) {
        const key = alertKey(summary.month, threshold);
        if (await SecureStore.getItemAsync(key)) continue;
        await SecureStore.setItemAsync(key, '1');
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t('Budget alert'),
            body:
              threshold >= 100
                ? t('You’ve gone over this month’s budget.')
                : tf('You’ve used {pct}% of this month’s budget.', { pct: threshold }),
          },
          trigger: null,
        });
      }
    })();
  }, [notifEnabled, summary, monthlyBudgetMinor]);
}
