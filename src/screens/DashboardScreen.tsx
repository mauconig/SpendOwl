import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CreditCardsSection } from '../components/CreditCardsSection';
import { Donut } from '../components/Donut';
import { TrendChart } from '../components/TrendChart';
import { Icon } from '../icons';
import { CATS, CatKey, Currency, GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, formatPYG, moneyFont } from '../theme';
import { minorToEur } from '../api/types';
import { catName, t, tf } from '../i18n';
import { useSpendOwl } from '../store/SpendOwlContext';
import { monthLong, monthShort, relativeDayLabel } from '../utils/date';
import { cardInterestMonthly } from '../utils/payoff';

const CAT_KEYS: CatKey[] = ['food', 'bills', 'shopping', 'transport'];

// The dashboard card is a preview, not the ledger. The full history — grouped
// by month — lives behind "See all" in TransactionsSheet.
const VISIBLE_TX = 8;

function donutValueFontSize(text: string): number {
  if (text.length <= 7) return 24;
  if (text.length <= 9) return 19;
  if (text.length <= 11) return 16;
  return 13;
}

// The hero number renders its decimals at a smaller size, so it formats itself
// rather than going through formatMoney. Same no-conversion rule: symbol and
// precision only, and PYG undoes the minor-unit division (see theme.ts).
function heroSplit(amount: number, cur: Currency): { main: string; frac: string | null } {
  if (cur === 'PYG') return { main: formatPYG(amount * 100), frac: null };
  const symbol = cur === 'EUR' ? '€' : '$';
  const [intPart, fracPart] = amount.toFixed(2).split('.');
  return { main: symbol + Number(intPart).toLocaleString('en-US'), frac: '.' + fracPart };
}

export function DashboardScreen() {
  const store = useSpendOwl();
  const { selCat, setSelCat, overdrawn, baseCur } = store;

  const summary = store.summary;

  // Card interest stays a client-side derivation from the live card balances —
  // it isn't a transaction, so the server's category totals don't include it.
  // Card payments are transactions, though, and land in the same slice, so the
  // two are added rather than one replacing the other: showing only interest
  // here while spend counted the payment would leave the donut short of the
  // month's total by exactly the amount paid.
  //
  // store.creditCards is minorToDisplay-scaled (the real guaraní figure on a
  // PYG account), but spentByCat below and everything else on this screen is
  // still minorToEur-scaled (always ÷100, which formatMoney/heroSplit undo
  // again for PYG) — that wider conversion hasn't been done yet. Dividing
  // back down here is what keeps this one figure from being added and shown
  // a hundred times too big next to it.
  const cardInterest = baseCur === 'PYG' ? cardInterestMonthly(store.creditCards) / 100 : cardInterestMonthly(store.creditCards);
  const spentByCat = new Map<CatKey, number>(
    (summary?.categories ?? []).map(c => [c.key, minorToEur(c.spentMinor)])
  );
  const debtAmount = cardInterest + (spentByCat.get('debt') ?? 0);
  const hasDebt = debtAmount > 0;
  const legendKeys: CatKey[] = hasDebt ? [...CAT_KEYS, 'debt'] : CAT_KEYS;

  const amountFor = (k: CatKey) => (k === 'debt' ? debtAmount : (spentByCat.get(k) ?? 0));
  const donutSlices = legendKeys.map(key => ({ key, amount: amountFor(key) }));
  const donutTotal = donutSlices.reduce((sum, s) => sum + s.amount, 0);

  const txList = store.transactions
    .filter(t => !selCat || t.category === selCat)
    .map(t => {
      const cat = CATS[t.category];
      const inc = t.amountMinor > 0;
      const card = t.cardId ? store.creditCards.find(c => c.id === t.cardId) : undefined;
      return {
        id: t.id,
        merchant: t.merchant,
        letter: t.merchant[0],
        meta: `${relativeDayLabel(t.occurredAt)} · ${catName(cat.name)}`,
        amt: (inc ? '+' : '−') + formatMoney(Math.abs(minorToEur(t.amountMinor)), baseCur, 2),
        inc,
        color: cat.color,
        cardName: card?.name ?? null,
        cardColor: card?.color ?? null,
      };
    });

  const visibleTx = txList.slice(0, VISIBLE_TX);
  const hiddenTxCount = txList.length - visibleTx.length;

  const subsActive = store.subs.filter(s => !s.off);
  // `price` is the converted figure and is null when no rate was available;
  // a subscription that cannot be converted is left out rather than counted
  // as free. Never sum `nativePrice` — those are in different currencies.
  const subsTotal = subsActive.reduce((a, s) => a + (s.price ?? 0), 0);

  // The balance carries across months and is the only figure the hero shows.
  // It reads accountOut-style movement, not `spent`: money sitting on a card
  // has not left the account and must not be subtracted from it twice.
  const balance = minorToEur(summary?.balanceMinor ?? 0);
  // These two describe the calendar month the donut below covers, nothing more.
  const monthIn = minorToEur(summary?.incomeMinor ?? 0);
  const monthOut = minorToEur(summary?.accountOutMinor ?? 0);
  const daysLeft = summary?.daysLeft ?? 0;
  const hero = heroSplit(Math.abs(balance), baseCur);
  const monthKey = summary?.month ?? '';
  const monthName = monthLong(monthKey);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64, gap: 14 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 20, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* No month appended: the balance carries across months, and
              labelling it "· July" is what made the reset look intentional. */}
          <Text style={{ fontSize: 13, color: colors.textDim50 }}>{t('Safe to Spend')}</Text>
          <Icon name="arrowNE" size={18} color={colors.textDim40} />
        </View>
        {!overdrawn ? (
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

        {/* This month's movement, which is the span the donut below covers.
            It replaces the old progress bar and pace line: both divided by
            "this month's income treated as a budget", the very figure that
            reset on the 1st, so on that date they read 100% used and
            infinitely over pace. In and out are stated plainly instead — no
            denominator, nothing to reset. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="trendUp" size={14} color={colors.mint} />
            <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.mint }}>
              {formatMoney(monthIn, baseCur, 0)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="trendDown" size={14} color={colors.textDim55} />
            <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.textDim55 }}>
              {formatMoney(monthOut, baseCur, 0)}
            </Text>
          </View>
          <Text style={{ fontSize: 11.5, color: colors.textDim45 }}>{monthName}</Text>
        </View>

        <Text style={{ marginTop: 8, fontSize: 11.5, color: colors.textDim45 }}>
          {tf(daysLeft === 1 ? '{n} day left in {month}' : '{n} days left in {month}', {
            n: daysLeft,
            month: monthName,
          })}
        </Text>
      </View>

      {overdrawn && (
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
            <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.amber }}>{t('Account overdrawn')}</Text>
            <Text style={{ fontSize: 12, color: colors.textDim55, marginTop: 2, lineHeight: 17 }}>
              {tf('You’re {amount} below zero. Log any income you have not recorded, or ask me for a plan.', {
                amount: formatMoney(Math.abs(balance), baseCur, 2),
              })}
            </Text>
          </View>
        </View>
      )}

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>{t('Where it’s going')}</Text>
          <Text style={{ fontSize: 11, color: colors.textDim40 }}>{t('tap a slice')}</Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Donut slices={donutSlices} selCat={selCat} onSelect={setSelCat} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.5, color: colors.textDim50 }}>
              {selCat ? catName(CATS[selCat].name).toUpperCase() : `${t('SPENT')} · ${monthName.toUpperCase()}`}
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
          <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>{t('Transactions')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selCat && (
              <Pressable
                onPress={() => setSelCat(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F2F2F4', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 }}
              >
                <Text style={{ fontSize: 11.5, fontFamily: fonts.medium, color: '#0A0A0B' }}>{catName(CATS[selCat].name)} ✕</Text>
              </Pressable>
            )}
            <Pressable onPress={store.openTx} hitSlop={8}>
              <Text style={{ fontSize: 12, color: colors.textDim40 }}>{t('See all')}</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          {visibleTx.map(t => (
            <Pressable
              key={t.id}
              onPress={() => store.openEditTx(t.id, 'dash')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}
            >
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
                {t.cardName ? (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 4,
                      borderRadius: 999,
                      paddingVertical: 1.5,
                      paddingHorizontal: 7,
                      backgroundColor: t.cardColor + '1F',
                      borderWidth: 1,
                      borderColor: t.cardColor + '4D',
                    }}
                  >
                    <Text style={{ fontSize: 9.5, fontFamily: fonts.medium, color: t.cardColor! }}>{t.cardName}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 13.5, fontFamily: moneyFont(baseCur, 'bold'), color: t.inc ? colors.mint : colors.text }}>{t.amt}</Text>
            </Pressable>
          ))}
        </View>
        {hiddenTxCount > 0 && (
          <Pressable
            onPress={store.openTx}
            style={{ marginTop: 8, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.hairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <Text style={{ fontSize: 12.5, fontFamily: fonts.medium, color: colors.textDim60 }}>
              {hiddenTxCount} more
            </Text>
            <Icon name="chev" size={16} color={colors.textDim40} />
          </Pressable>
        )}
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>{t('Spending trajectory')}</Text>
        <View style={{ marginTop: 12 }}>
          <TrendChart
            series={(summary?.trend ?? []).map(point => minorToEur(point.cumulativeMinor))}
            daysInMonth={summary?.daysInMonth ?? 30}
            reference={monthIn}
            monthLabel={monthShort(monthKey)}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: '#78ADEE' }} />
            <Text style={{ fontSize: 11, color: colors.textDim60 }}>{t('This month')}</Text>
          </View>
          {/* Only when the line is actually drawn — TrendChart skips it with no
              income this month, and a legend for an absent line is a puzzle. */}
          {monthIn > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: 'rgba(245,245,247,.35)' }} />
              <Text style={{ fontSize: 11, color: colors.textDim60 }}>{t('Income this month')}</Text>
            </View>
          )}
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
            <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: '#0A0A0B' }}>{t('Can I afford this?')}</Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(10,10,11,.6)', marginTop: 1 }}>{t('Simulate a purchase against your savings')}</Text>
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
          <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text }}>{t('Subscriptions')}</Text>
          <Text style={{ fontSize: 11.5, color: colors.textDim50, marginTop: 1, fontFamily: moneyFont(baseCur, 'regular') }}>
            {tf('{n} active · {total}/mo', {
              n: subsActive.length,
              total: formatMoney(subsTotal, baseCur, 2),
            })}
          </Text>
        </View>
        <Icon name="chev" size={20} color={colors.textDim40} />
      </Pressable>
    </ScrollView>
  );
}
