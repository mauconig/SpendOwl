import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { colors, fonts } from '../theme';

/**
 * The app used to render instantly from in-memory fixtures. Now that the first
 * paint waits on the API, both of these states are reachable — and the error
 * one is the state a developer hits when the server isn't running.
 */
export function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <ActivityIndicator size="large" color={colors.textDim55} />
      <Text style={{ fontSize: 13, color: colors.textDim45 }}>Loading your numbers…</Text>
    </View>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Can’t load your data</Text>
      <Text style={{ fontSize: 13, color: colors.textDim55, textAlign: 'center', lineHeight: 19 }}>{message}</Text>
      <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim30, textAlign: 'center' }}>
        {API_BASE_URL}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{ backgroundColor: '#F2F2F4', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginTop: 6 }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: '#0A0A0B' }}>Try again</Text>
      </Pressable>
    </View>
  );
}
