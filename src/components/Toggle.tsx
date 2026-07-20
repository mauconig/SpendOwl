import React from 'react';
import { Pressable, View } from 'react-native';

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 14,
        backgroundColor: on ? '#F2F2F4' : 'rgba(255,255,255,.12)',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: on ? '#0A0A0B' : '#8E8E93',
        }}
      />
    </Pressable>
  );
}
