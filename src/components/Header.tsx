import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, View } from 'react-native';
import { colors, fonts } from '../theme';

export function Header() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <LinearGradient
          colors={[colors.mint, colors.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#0B0D11', fontFamily: fonts.bold, fontSize: 14 }}>S</Text>
        </LinearGradient>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 17 }}>SpendOwl</Text>
      </View>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.iconBg,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,.1)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.violetLight, fontFamily: fonts.medium, fontSize: 13 }}>M</Text>
      </View>
    </View>
  );
}
