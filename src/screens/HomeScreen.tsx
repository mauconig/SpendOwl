import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../icons';
import { CATS, GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { minorToEur } from '../api/types';
import { useSpendOwl } from '../store/SpendOwlContext';
import { monthLong } from '../utils/date';

type Insight = {
  title: string;
  body: string;
  cta: string;
  icon: 'trendUp' | 'trendDown' | 'pie' | 'bars' | 'warn';
  iconColor: string;
  onTap: () => void;
};

export function HomeScreen() {
  const store = useSpendOwl();
  const { baseCur, summary } = store;

  const spent = minorToEur(summary?.spentMinor ?? 0);
  const income = minorToEur(summary?.incomeMinor ?? 0);
  const safeToSpend = minorToEur(summary?.safeToSpendMinor ?? 0);
  const paceDelta = minorToEur(summary?.paceDeltaMinor ?? 0);
  const monthName = monthLong(summary?.month ?? '');

  // Every card below is derived from live data. The old versions were fixed
  // strings, including one that deep-linked to a hardcoded fixture id.
  const insights: Insight[] = [];

  if (summary) {
    const underPace = paceDelta >= 0;
    insights.push({
      title: underPace ? "You're pacing well" : 'Spending above pace',
      body: `${formatMoney(Math.abs(paceDelta), baseCur, 0)} ${underPace ? 'under' : 'over'} your budget pace this month. Safe to spend: ${formatMoney(safeToSpend, baseCur, 0)}.`,
      cta: 'Ask the coach',
      icon: underPace ? 'trendUp' : 'trendDown',
      iconColor: underPace ? colors.mint : colors.rose,
      onTap: () => store.setNav('chat'),
    });

    const top = summary.categories.filter(c => c.key !== 'income')[0];
    if (top && spent > 0) {
      const share = Math.round((minorToEur(top.spentMinor) / spent) * 100);
      insights.push({
        title: `${CATS[top.key].name} leads your spend`,
        body: `${formatMoney(minorToEur(top.spentMinor), baseCur, 0)} so far — ${share}% of everything you've spent in ${monthName}.`,
        cta: 'Set a cap in chat',
        icon: 'pie',
        iconColor: CATS[top.key].color,
        onTap: () => store.setNav('chat'),
      });
    }
  }

  const upcoming = store.subs.filter(s => !s.off && s.dayOfMonth >= new Date().getDate()).slice(0, 3);
  if (upcoming.length > 0) {
    insights.push({
      title: `${upcoming.length} renewal${upcoming.length === 1 ? '' : 's'} still to come`,
      body: `${upcoming.map(s => s.name).join(', ')} renew${upcoming.length === 1 ? 's' : ''} later this month — ${formatMoney(
        upcoming.reduce((sum, s) => sum + s.price, 0),
        baseCur,
        2
      )} total.`,
      cta: 'Review subscriptions',
      icon: 'bars',
      iconColor: '#78ADEE',
      onTap: () => {
        store.goDash();
        store.openSubs();
      },
    });
  }

  const needsReview = store.vaultItems.filter(v => v.status === 'warn');
  const firstReview = needsReview[0];
  if (firstReview) {
    insights.push({
      title: `${needsReview.length} factura${needsReview.length === 1 ? '' : 's'} need${needsReview.length === 1 ? 's' : ''} review`,
      body: `${firstReview.merchant} (${formatMoney(firstReview.amountEur, baseCur, 2)}) is missing its VAT number.`,
      cta: 'Open in vault',
      icon: 'warn',
      iconColor: colors.amber,
      onTap: () => {
        store.setNav('vault');
        store.openInvoice(firstReview.id);
      },
    });
  }

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
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Spent · {monthName}</Text>
          <Text style={{ fontSize: 22, fontFamily: moneyFont(baseCur, 'bold'), color: colors.text, marginTop: 4 }}>{formatMoney(spent, baseCur, 0)}</Text>
        </Pressable>
        <Pressable onPress={store.goDash} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Income · {monthName}</Text>
          <Text style={{ fontSize: 22, fontFamily: moneyFont(baseCur, 'bold'), color: colors.mint, marginTop: 4 }}>{formatMoney(income, baseCur, 0)}</Text>
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
