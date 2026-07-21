import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../icons';
import { GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

export function HomeScreen() {
  const store = useSpendOwl();
  const { baseCur } = store;

  const insights = [
    {
      title: "You're pacing well",
      body: `${formatMoney(38, baseCur, 0)} under your usual spend this week. Safe to spend: ${formatMoney(1283, baseCur, 0)}.`,
      cta: 'Ask the coach',
      icon: 'trendUp' as const,
      iconColor: colors.mint,
      onTap: () => store.setNav('chat'),
    },
    {
      title: 'Food is running hot',
      body: '12% above June — mostly weekday lunches. I can set a soft cap.',
      cta: 'Set a cap in chat',
      icon: 'pie' as const,
      iconColor: '#F0A878',
      onTap: () => store.setNav('chat'),
    },
    {
      title: '3 renewals this week',
      body: `Spotify, iCloud+ and Basic Fit renew before Sunday — ${formatMoney(38.97, baseCur, 2)} total.`,
      cta: 'Review subscriptions',
      icon: 'bars' as const,
      iconColor: '#78ADEE',
      onTap: () => {
        store.goDash();
        store.openSubs();
      },
    },
    {
      title: '1 factura needs review',
      body: `IKEA (${formatMoney(89.9, baseCur, 2)}) is missing its VAT number.`,
      cta: 'Open in vault',
      icon: 'warn' as const,
      iconColor: colors.amber,
      onTap: () => {
        store.setNav('vault');
        store.openInvoice('v3');
      },
    },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64, gap: 12 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.3 }}>Welcome back!</Text>

      <Pressable onPress={() => store.setNav('chat')}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 20, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.mintDark, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="spark" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: '#0A0A0B' }}>AI Insights</Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(10,10,11,.6)', marginTop: 1 }}>Evaluate your spending patterns</Text>
          </View>
          <Icon name="arrowNE" size={20} color="rgba(10,10,11,.7)" />
        </LinearGradient>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={store.goDash} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Spent · July</Text>
          <Text style={{ fontSize: 22, fontFamily: moneyFont(baseCur, 'bold'), color: colors.text, marginTop: 4 }}>{formatMoney(1116, baseCur, 0)}</Text>
        </Pressable>
        <Pressable onPress={store.goDash} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Income · July</Text>
          <Text style={{ fontSize: 22, fontFamily: moneyFont(baseCur, 'bold'), color: colors.mint, marginTop: 4 }}>{formatMoney(1850, baseCur, 0)}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: colors.text, marginTop: 4 }}>For you today</Text>
      {insights.map((i, idx) => (
        <Pressable
          key={idx}
          onPress={i.onTap}
          style={{ backgroundColor: colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.iconBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={i.icon} size={18} color={i.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text }}>{i.title}</Text>
            <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, lineHeight: 18 }}>{i.body}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: '#78ADEE', marginTop: 8 }}>{i.cta}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
