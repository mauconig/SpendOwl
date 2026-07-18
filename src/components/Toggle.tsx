import React from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../theme';

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 14,
        backgroundColor: on ? colors.mint : 'rgba(255,255,255,.12)',
        borderWidth: 1,
        borderColor: on ? colors.mint : 'rgba(255,255,255,.16)',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 21 : 1,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: on ? colors.mintDark : '#AEB6C2',
        }}
      />
    </Pressable>
  );
}
