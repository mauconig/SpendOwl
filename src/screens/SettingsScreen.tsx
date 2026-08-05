import { useClerk, useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Toggle } from '../components/Toggle';
import { t } from '../i18n';
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
        backgroundColor: active ? '#F2F2F4' : 'transparent',
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, color: active ? '#0A0A0B' : colors.textDim45 }}>{label}</Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const store = useSpendOwl();
  const { user } = useUser();
  const { signOut } = useClerk();

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  // Clerk accounts created with email+password carry no name, so fall back to
  // the email local-part rather than rendering an empty row.
  const displayName = user?.fullName?.trim() || email.split('@')[0] || t('Your account');
  const initial = displayName.charAt(0).toUpperCase();

  const confirmSignOut = () => {
    Alert.alert(t('Sign out'), t('You will need to sign in again to reach your data.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Sign out'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64, gap: 14 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>{t('Settings')}</Text>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <LinearGradient
          colors={['#F0A878', '#78ADEE']}
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 19, fontFamily: fonts.bold, color: '#0A0A0B' }}>{initial}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: colors.text }} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 1 }} numberOfLines={1}>
            {email}
          </Text>
        </View>
        <View style={{ backgroundColor: '#F2F2F4', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: '#0A0A0B' }}>{t('Freelance')}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, paddingHorizontal: 16 }}>
        <Row
          label={t('Base currency')}
          right={
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.iconBg, borderRadius: 999, padding: 3 }}>
              <CurPill label="EUR" active={store.baseCur === 'EUR'} onPress={() => store.setBaseCur('EUR')} />
              <CurPill label="USD" active={store.baseCur === 'USD'} onPress={() => store.setBaseCur('USD')} />
              <CurPill label="PYG" active={store.baseCur === 'PYG'} onPress={() => store.setBaseCur('PYG')} />
            </View>
          }
        />
        <Divider />
        <Pressable onPress={store.openBalancesSheet}>
          <Row
            label={t('Configure balances')}
            right={<Text style={{ fontSize: 15, color: colors.textDim40 }}>›</Text>}
          />
        </Pressable>
        <Divider />
        <Row
          label={t('Language')}
          right={
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.iconBg, borderRadius: 999, padding: 3 }}>
              {/* Each option is written in its own language, never translated:
                  someone stuck in a language they cannot read needs to
                  recognise the way out, and "Spanish" is no help to them. */}
              <CurPill label="ES" active={store.lang === 'es'} onPress={() => store.setLang('es')} />
              <CurPill label="EN" active={store.lang === 'en'} onPress={() => store.setLang('en')} />
            </View>
          }
        />
        <Divider />
        <Row label={t('Budget alerts')} right={<Toggle on={store.notif} onToggle={store.toggleNotif} />} />
        <Divider />
        <Row label={t('Biometric lock')} right={<Toggle on={store.bio} onToggle={store.toggleBio} />} />
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, paddingHorizontal: 16 }}>
        <Row label={t('Coach tone')} right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>{t('Friendly')}</Text>} />
        <Divider />
        <Row label={t('Voice transcripts')} right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>{t('On device')}</Text>} />
        <Divider />
        <Row label={t('Training on my data')} right={<Text style={{ fontSize: 13, color: colors.textDim50 }}>{t('Off')}</Text>} />
      </View>

      <Pressable
        onPress={confirmSignOut}
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: 20,
          paddingVertical: 15,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: colors.rose }}>{t('Sign out')}</Text>
      </Pressable>

      <Text style={{ textAlign: 'center', fontSize: 11, color: colors.textDim30, fontFamily: fonts.mono, marginTop: 4 }}>Nummus AI 2.4.1</Text>
    </ScrollView>
  );
}
