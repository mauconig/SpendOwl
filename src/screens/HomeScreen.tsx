import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../icons';
import { CATS, GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { minorToEur, type ApiInsightIcon } from '../api/types';
import { useSpendOwl } from '../store/SpendOwlContext';
import { monthLong } from '../utils/date';

type Insight = {
  title: string;
  body: string;
  cta: string;
  icon: ApiInsightIcon;
  iconColor: string;
  ai?: boolean;
  onTap: () => void;
};

/**
 * The colour is derived from the icon rather than sent by the model. Letting a
 * model choose hex values buys nothing and drifts off-palette; it should pick
 * what a card *means*, and the app decides what that looks like.
 */
const ICON_COLORS: Record<ApiInsightIcon, string> = {
  trendUp: colors.mint,
  trendDown: colors.rose,
  warn: colors.amber,
  pie: '#78ADEE',
  bars: '#78ADEE',
  card: '#78ADEE',
  spark: colors.mint,
};

export function HomeScreen() {
  const store = useSpendOwl();
  const { baseCur, summary } = store;

  const spent = minorToEur(summary?.spentMinor ?? 0);
  const income = minorToEur(summary?.incomeMinor ?? 0);
  const monthName = monthLong(summary?.month ?? '');

  /**
   * Model-written cards, once a day (server/src/insights.ts). Their text is
   * already rendered prose in the right currency, so nothing here reformats an
   * amount — that is the whole difference between these and the fallback below.
   */
  const aiInsights: Insight[] = store.insights.map(card => ({
    title: card.title,
    body: card.body,
    cta: card.cta,
    icon: card.icon,
    iconColor: ICON_COLORS[card.icon] ?? '#78ADEE',
    ai: true,
    onTap: () => {
      switch (card.action) {
        case 'chat':
          return store.setNav('chat');
        case 'subscriptions':
          store.goDash();
          return store.openSubs();
        case 'vault':
          store.setNav('vault');
          // targetId is server-validated against the facturas actually handed
          // to the model, so it either deep-links correctly or is null.
          if (card.targetId) store.openInvoice(card.targetId);
          return;
        default:
          return store.goDash();
      }
    },
  }));

  const insights = aiInsights.length > 0 ? aiInsights : buildFallbackInsights(store);

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text, flexShrink: 1 }}>{i.title}</Text>
              {i.ai ? <Icon name="spark" size={11} color={colors.textDim50} /> : null}
            </View>
            <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, lineHeight: 18 }}>{i.body}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: '#78ADEE', marginTop: 8 }}>{i.cta}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * The original four rules, unchanged. They are no longer what Home normally
 * shows — they are the floor it stands on when the model has produced nothing:
 * no API key, a failed call, or the day's first generation still in flight.
 *
 * Keeping them is what lets the AI path fail silently. Every figure here is
 * computed locally from data already loaded, so this cannot be wrong and cannot
 * be slow.
 */
function buildFallbackInsights(store: ReturnType<typeof useSpendOwl>): Insight[] {
  const { baseCur, summary } = store;
  const insights: Insight[] = [];

  const spent = minorToEur(summary?.spentMinor ?? 0);
  const safeToSpend = minorToEur(summary?.safeToSpendMinor ?? 0);
  const paceDelta = minorToEur(summary?.paceDeltaMinor ?? 0);
  const monthName = monthLong(summary?.month ?? '');

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

  return insights;
}
