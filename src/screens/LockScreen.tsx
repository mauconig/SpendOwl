import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, GRAD, GRAD_LOCATIONS } from '../theme';
import { t } from '../i18n';

export function LockScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 }}>
      <LinearGradient
        colors={GRAD}
        locations={GRAD_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 24 }}>🦉</Text>
      </LinearGradient>
      <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: colors.text }}>SpendOwl</Text>
      <Text style={{ fontSize: 13.5, color: colors.textDim50, textAlign: 'center' }}>{t('App locked. Unlock to continue.')}</Text>

      <Pressable onPress={onRetry} style={{ marginTop: 8 }}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 999, paddingVertical: 13, paddingHorizontal: 32, alignItems: 'center' }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>{t('Unlock')}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
