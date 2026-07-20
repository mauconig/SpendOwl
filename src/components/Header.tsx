import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, View } from 'react-native';
import { GRAD, GRAD_LOCATIONS, colors, fonts } from '../theme';

export function Header() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>S</Text>
        </LinearGradient>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>SpendOwl</Text>
      </View>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.iconBg,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,.1)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textDim70, fontFamily: fonts.medium, fontSize: 13 }}>M</Text>
      </View>
    </View>
  );
}
