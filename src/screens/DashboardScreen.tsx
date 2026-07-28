import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CreditCardsSection } from '../components/CreditCardsSection';
import { Donut } from '../components/Donut';
import { TrendChart } from '../components/TrendChart';
import { Icon } from '../icons';
import { CATS, CatKey, Currency, GRAD, GRAD_LOCATIONS, colors, convertFromEUR, fonts, formatMoney, formatPYG, moneyFont } from '../theme';
import { minorToEur } from '../api/types';
import { useSpendOwl } from '../store/SpendOwlContext';
import { monthLong, monthShort, relativeDayLabel } from '../utils/date';
import { cardInterestMonthly } from '../utils/payoff';

const CAT_KEYS: CatKey[] = ['food', 'bills', 'shopping', 'transport'];

function donutValueFontSize(text: string): number {
  if (text.length <= 7) return 24;
  if (text.length <= 9) return 19;
  if (text.length <= 11) return 16;
  return 13;
}

function heroSplit(eur: number, cur: Currency): { main: string; frac: string | null } {
  if (cur === 'PYG') return { main: formatPYG(convertFromEUR(eur, cur)), frac: null };
  const symbol = cur === 'EUR' ? '€' : '$';
  const [intPart, fracPart] = convertFromEUR(eur, cur).toFixed(2).split('.');
  return { main: symbol + Number(intPart).toLocaleString('en-US'), frac: '.' + fracPart };
}

export function DashboardScreen() {
  const store = useSpendOwl();
  const { selCat, setSelCat, overBudget, baseCur } = store;

  const summary = store.summary;

  // Card interest stays a client-side derivation from the live card balances —
  // it isn't a transaction, so the server's category totals don't include it.
  const debtAmount = cardInterestMonthly(store.creditCards);
  const hasDebt = debtAmount > 0;
  const legendKeys: CatKey[] = hasDebt ? [...CAT_KEYS, 'debt'] : CAT_KEYS;

  const spentByCat = new Map<CatKey, number>(
    (summary?.categories ?? []).map(c => [c.key, minorToEur(c.spentMinor)])
  );
  const amountFor = (k: CatKey) => (k === 'debt' ? debtAmount : (spentByCat.get(k) ?? 0));
  const donutSlices = legendKeys.map(key => ({ key, amount: amountFor(key) }));
  const donutTotal = donutSlices.reduce((sum, s) => sum + s.amount, 0);

  const txList = store.transactions
    .filter(t => !selCat || t.category === selCat)
    .map(t => {
      const cat = CATS[t.category];
      const inc = t.amountMinor > 0;
      return {
        id: t.id,
        merchant: t.merchant,
        letter: t.merchant[0],
        meta: `${relativeDayLabel(t.occurredAt)} · ${cat.name}`,
        amt: (inc ? '+' : '−') + formatMoney(Math.abs(minorToEur(t.amountMinor)), baseCur, 2),
        inc,
        color: cat.color,
      };
    });

  const subsActive = store.subs.filter(s => !s.off);
  const subsTotal = subsActive.reduce((a, s) => a + s.price, 0);

  const budget = minorToEur(summary?.budgetMinor ?? 0);
  const spent = minorToEur(summary?.spentMinor ?? 0);
  const safeToSpend = minorToEur(summary?.safeToSpendMinor ?? 0);
  const paceDelta = minorToEur(summary?.paceDeltaMinor ?? 0);
  const percentOfBudget = summary?.percentOfBudget ?? 0;
  const daysLeft = summary?.daysLeft ?? 0;
  const hero = heroSplit(overBudget ? spent - budget : safeToSpend, baseCur);
  const monthKey = summary?.month ?? '';
  const monthName = monthLong(monthKey);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64, gap: 14 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 20, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: colors.textDim50 }}>Safe to Spend · July</Text>
          <Icon name="arrowNE" size={18} color={colors.textDim40} />
        </View>
        {!overBudget ? (
          <Text style={{ fontSize: 44, fontFamily: moneyFont(baseCur, 'bold'), marginTop: 6, letterSpacing: -1.5, color: '#FFFFFF' }}>
            {hero.main}
            {hero.frac && <Text style={{ fontSize: 26, fontFamily: moneyFont(baseCur, 'medium'), color: colors.textDim40 }}>{hero.frac}</Text>}
          </Text>
        ) : (
          <Text style={{ fontSize: 44, fontFamily: moneyFont(baseCur, 'bold'), marginTop: 6, letterSpacing: -1.5, color: colors.rose }}>
            −{hero.main}
            {hero.frac && <Text style={{ fontSize: 26, fontFamily: moneyFont(baseCur, 'medium'), color: 'rgba(248,113,113,.6)' }}>{hero.frac}</Text>}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Icon name={overBudget ? 'trendDown' : 'trendUp'} size={16} color={overBudget ? colors.rose : colors.mint} />
          <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: overBudget ? colors.rose : colors.mint }}>
            {overBudget
              ? `${formatMoney(spent - budget, baseCur, 2)} over budget (${(percentOfBudget - 100).toFixed(0)}%)`
              : `${formatMoney(Math.abs(paceDelta), baseCur, 0)} ${paceDelta >= 0 ? 'under' : 'over'} pace (${Math.abs(summary?.pacePercent ?? 0).toFixed(1)}%)`}
          </Text>
        </View>
        <View style={{ marginTop: 14, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(Math.max(percentOfBudget, 0), 100)}%`,
              borderRadius: 999,
              backgroundColor: overBudget ? colors.rose : undefined,
            }}
          >
            {!overBudget && (
              <LinearGradient colors={GRAD} locations={GRAD_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            )}
          </View>
        </View>
        <Text style={{ marginTop: 8, fontSize: 11.5, color: colors.textDim45 }}>
          {percentOfBudget.toFixed(0)}% of {formatMoney(budget, baseCur, 0)} · {daysLeft} day
          {daysLeft === 1 ? '' : 's'} left
        </Text>
      </View>

      {overBudget && (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: 'rgba(250,204,21,.35)',
            borderRadius: 20,
            padding: 14,
            paddingHorizontal: 16,
          }}
        >
          <Icon name="warn" size={20} color={colors.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.amber }}>Budget exceeded</Text>
            <Text style={{ fontSize: 12, color: colors.textDim55, marginTop: 2, lineHeight: 17 }}>
              You’re {formatMoney(spent - budget, baseCur, 2)} past {monthName}’s budget. I can draft a catch-up plan for
              the last two weeks.
            </Text>
          </View>
        </View>
      )}

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>Where it’s going</Text>
          <Text style={{ fontSize: 11, color: colors.textDim40 }}>tap a slice</Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Donut slices={donutSlices} selCat={selCat} onSelect={setSelCat} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.5, color: colors.textDim50 }}>
              {selCat ? CATS[selCat].name.toUpperCase() : `SPENT · ${monthName.toUpperCase()}`}
            </Text>
            {(() => {
              const donutValue = formatMoney(selCat ? amountFor(selCat) : donutTotal, baseCur, 0);
              return (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: donutValueFontSize(donutValue), fontFamily: moneyFont(baseCur, 'bold'), color: colors.text, marginTop: 3, maxWidth: 128, textAlign: 'center' }}
                >
                  {donutValue}
                </Text>
              );
            })()}
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {legendKeys.map(k => {
            const c = CATS[k];
            const isSel = selCat === k;
            return (
              <Pressable
                key={k}
                onPress={() => setSelCat(isSel ? null : k)}
                style={{
                  width: '48%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingVertical: 6,
                  paddingHorizontal: 9,
                  borderRadius: 10,
                  backgroundColor: isSel ? 'rgba(255,255,255,.06)' : 'transparent',
                  borderWidth: 1,
                  borderColor: isSel ? 'rgba(255,255,255,.14)' : 'transparent',
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.text }} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: moneyFont(baseCur, 'medium'), color: colors.textDim70 }}>{formatMoney(amountFor(k), baseCur, 0)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>Transactions</Text>
          {selCat ? (
            <Pressable
              onPress={() => setSelCat(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F2F2F4', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 }}
            >
              <Text style={{ fontSize: 11.5, fontFamily: fonts.medium, color: '#0A0A0B' }}>{CATS[selCat].name} ✕</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textDim40 }}>See all</Text>
          )}
        </View>
        <View style={{ gap: 4 }}>
          {txList.map(t => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  backgroundColor: colors.iconBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: t.color, fontSize: 14, fontFamily: fonts.bold }}>{t.letter}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontFamily: fonts.medium, color: colors.text }} numberOfLines={1}>
                  {t.merchant}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textDim45, marginTop: 1 }}>{t.meta}</Text>
              </View>
              <Text style={{ fontSize: 13.5, fontFamily: moneyFont(baseCur, 'bold'), color: t.inc ? colors.mint : colors.text }}>{t.amt}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>Spending trajectory</Text>
        <View style={{ marginTop: 12 }}>
          <TrendChart
            series={(summary?.trend ?? []).map(point => minorToEur(point.cumulativeMinor))}
            daysInMonth={summary?.daysInMonth ?? 30}
            budget={budget}
            monthLabel={monthShort(monthKey)}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: '#78ADEE' }} />
            <Text style={{ fontSize: 11, color: colors.textDim60 }}>This month</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: 'rgba(245,245,247,.35)' }} />
            <Text style={{ fontSize: 11, color: colors.textDim60 }}>Budget pace</Text>
          </View>
        </View>
      </View>

      <CreditCardsSection />

      <Pressable onPress={store.openAfford}>
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
            <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: '#0A0A0B' }}>Can I afford this?</Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(10,10,11,.6)', marginTop: 1 }}>Simulate a purchase against your savings</Text>
          </View>
          <Icon name="arrowNE" size={20} color="rgba(10,10,11,.7)" />
        </LinearGradient>
      </Pressable>

      <Pressable
        onPress={store.openSubs}
        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flexDirection: 'row' }}>
          {store.subs.slice(0, 4).map((s, i) => (
            <View
              key={s.id}
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                backgroundColor: colors.iconBg,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,.1)',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: i ? -8 : 0,
              }}
            >
              <Text style={{ color: s.color, fontSize: 12, fontFamily: fonts.bold }}>{s.name[0]}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text }}>Subscriptions</Text>
          <Text style={{ fontSize: 11.5, color: colors.textDim50, marginTop: 1, fontFamily: moneyFont(baseCur, 'regular') }}>
            {subsActive.length} active · {formatMoney(subsTotal, baseCur, 2)}/mo
          </Text>
        </View>
        <Icon name="chev" size={20} color={colors.textDim40} />
      </Pressable>
    </ScrollView>
  );
}
