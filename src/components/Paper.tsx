import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';

const SETS = [
  [68, 44, 58, 36, 52],
  [52, 64, 40, 60, 34],
  [60, 38, 66, 46, 30],
];

export function Paper({ seed }: { seed: number }) {
  const ws = SETS[seed % 3];
  return (
    <LinearGradient colors={['#F5F2E9', '#E7E3D5']} style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
      <View style={{ gap: 6 }}>
        <View style={{ height: 8, width: '55%', backgroundColor: 'rgba(26,30,38,.55)', borderRadius: 2 }} />
        {ws.map((w, i) => (
          <View key={i} style={{ height: 5, width: `${w}%`, backgroundColor: 'rgba(26,30,38,.26)', borderRadius: 2 }} />
        ))}
      </View>
      <View style={{ height: 8, width: '46%', backgroundColor: 'rgba(26,30,38,.5)', borderRadius: 2, alignSelf: 'flex-end' }} />
    </LinearGradient>
  );
}
