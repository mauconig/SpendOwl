import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Toggle } from '../components/Toggle';
import { colors, fonts } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 }}>
      <Text style={{ fontSize: 14, color: colors.text }}>{label}</Text>
      {right}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.cardBorder }} />;
}

function CurPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? 'rgba(77,240,184,.14)' : 'transparent',
        borderWidth: 1,
        borderColor: active ? 'rgba(77,240,184,.5)' : 'rgba(255,255,255,.12)',
      }}
    >
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: active ? colors.mint : colors.textDim45 }}>{label}</Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const store = useSpendOwl();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 24, gap: 14 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Settings</Text>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <LinearGradient
          colors={[colors.violet, colors.mint]}
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 19, fontFamily: fonts.bold, color: '#0B0D11' }}>M</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: colors.text }}>Maya Fernández</Text>
          <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 1 }}>maya@freelance.eu</Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: 'rgba(77,240,184,.35)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.mint }}>FREELANCE</Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, paddingHorizontal: 16 }}>
        <Row
          label="Base currency"
          right={
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <CurPill label="EUR" active={store.baseCur === 'EUR'} onPress={() => store.setBaseCur('EUR')} />
              <CurPill label="USD" active={store.baseCur === 'USD'} onPress={() => store.setBaseCur('USD')} />
              <CurPill label="PYG" active={store.baseCur === 'PYG'} onPress={() => store.setBaseCur('PYG')} />
            </View>
          }
        />
        <Divider />
        <Row label="Budget alerts" right={<Toggle on={store.notif} onToggle={store.toggleNotif} />} />
        <Divider />
        <Row label="Biometric lock" right={<Toggle on={store.bio} onToggle={store.toggleBio} />} />
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, paddingHorizontal: 16 }}>
        <Row label="Coach tone" right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>Friendly</Text>} />
        <Divider />
        <Row label="Voice transcripts" right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>On device</Text>} />
        <Divider />
        <Row label="Training on my data" right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>Off</Text>} />
      </View>

      <Text style={{ textAlign: 'center', fontSize: 11, color: colors.textDim30, fontFamily: fonts.mono, marginTop: 4 }}>SpendOwl 2.4.1</Text>
    </ScrollView>
  );
}
