import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { Icon } from '../icons';

export function Badge({ kind }: { kind: 'ok' | 'warn' }) {
  const ok = kind === 'ok';
  return (
    <View
      style={{
        width: 19,
        height: 19,
        borderRadius: 10,
        backgroundColor: ok ? colors.mint : colors.amber,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={ok ? 'check' : 'warn'} size={11} color="#0A0A0B" />
    </View>
  );
}
