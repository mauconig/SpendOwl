import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ModalShell } from '../components/ModalShell';
import { TransactionDetail } from './TransactionDetail';
import { minorToEur, type ApiTransaction } from '../api/types';
import { CATS, colors, fonts, formatMoney, moneyFont, type Currency } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { longDate, monthKeyOf, monthYearLong } from '../utils/date';
import { catName, t, tf } from '../i18n';

type Section = { monthKey: string; title: string; spentMinor: number; data: ApiTransaction[] };

const PAD = 18;

/**
 * The full transaction history behind the Dashboard's "See all" — one month per
 * horizontal page, scrolling vertically within a month.
 *
 * The sheet takes an explicit pixel height rather than a percentage: a `%`
 * height only resolves against a parent that has a bounded height of its own,
 * and without that the sheet grows to fit its content, leaving the inner lists
 * with no constrained height to scroll inside.
 */
export function TransactionsSheet() {
  const store = useSpendOwl();
  const { baseCur, selCat, txOpen } = store;
  const { width, height } = useWindowDimensions();
  const sheetHeight = Math.round(height * 0.82);

  const pagerRef = useRef<ScrollView>(null);
  const stripRef = useRef<ScrollView>(null);
  const chipX = useRef<number[]>([]);
  const [activeIx, setActiveIx] = useState(0);

  const sections = useMemo<Section[]>(() => {
    const filtered = store.transactions.filter(t => !selCat || t.category === selCat);

    // The API returns rows newest-first (ORDER BY occurred_at DESC), so
    // insertion order into this Map already yields months newest-first and the
    // rows within each month stay in order. No re-sorting needed.
    const byMonth = new Map<string, ApiTransaction[]>();
    for (const t of filtered) {
      const key = monthKeyOf(t.occurredAt);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(t);
      else byMonth.set(key, [t]);
    }

    return [...byMonth].map(([monthKey, data]) => ({
      monthKey,
      title: monthYearLong(monthKey),
      // Accumulated in integer cents and converted once at render, never summed
      // as floats — the reason the whole app stores minor units.
      spentMinor: data.reduce((total, t) => (t.amountMinor < 0 ? total - t.amountMinor : total), 0),
      data,
    }));
  }, [store.transactions, selCat]);

  // Open (or change the filter) and you land on the most recent month.
  useEffect(() => {
    setActiveIx(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
    stripRef.current?.scrollTo({ x: 0, animated: false });
  }, [txOpen, selCat]);

  const goToMonth = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), Math.max(sections.length - 1, 0));
    setActiveIx(clamped);
    pagerRef.current?.scrollTo({ x: clamped * width, animated: true });
    stripRef.current?.scrollTo({ x: Math.max((chipX.current[clamped] ?? 0) - PAD, 0), animated: true });
  };

  const onPagerEnd = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(ev.nativeEvent.contentOffset.x / width);
    if (index === activeIx) return;
    setActiveIx(index);
    stripRef.current?.scrollTo({ x: Math.max((chipX.current[index] ?? 0) - PAD, 0), animated: true });
  };

  const active = sections[activeIx];

  return (
    <ModalShell
      visible={txOpen}
      onClose={store.closeTx}
      contentStyle={{
        height: sheetHeight,
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 10,
        paddingBottom: 18,
      }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center', marginBottom: 14 }} />

      <View style={{ paddingHorizontal: PAD, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>{t('All transactions')}</Text>
        {selCat && (
          <Pressable
            onPress={() => store.setSelCat(null)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F2F2F4', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 }}
          >
            <Text style={{ fontSize: 11.5, fontFamily: fonts.medium, color: '#0A0A0B' }}>{catName(CATS[selCat].name)} ✕</Text>
          </Pressable>
        )}
      </View>

      {sections.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, color: colors.textDim45 }}>
            {selCat ? tf('Nothing in {category} yet.', { category: catName(CATS[selCat].name) }) : t('No transactions yet.')}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginTop: 12 }}
            contentContainerStyle={{ paddingHorizontal: PAD, gap: 7 }}
          >
            {sections.map((section, i) => {
              const isActive = i === activeIx;
              return (
                <Pressable
                  key={section.monthKey}
                  onLayout={e => {
                    chipX.current[i] = e.nativeEvent.layout.x;
                  }}
                  onPress={() => goToMonth(i)}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 13,
                    backgroundColor: isActive ? '#F2F2F4' : colors.cardAlt,
                    borderWidth: 1,
                    borderColor: isActive ? '#F2F2F4' : colors.cardBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontFamily: isActive ? fonts.bold : fonts.medium,
                      color: isActive ? '#0A0A0B' : colors.textDim60,
                    }}
                  >
                    {section.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {active && (
            <View style={{ paddingHorizontal: PAD, marginTop: 11, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.5, color: colors.textDim50 }}>
                {active.data.length} TRANSACTION{active.data.length === 1 ? '' : 'S'}
              </Text>
              <Text style={{ fontSize: 11.5, fontFamily: moneyFont(baseCur, 'medium'), color: colors.textDim60 }}>
                {formatMoney(minorToEur(active.spentMinor), baseCur, 2)} spent
              </Text>
            </View>
          )}

          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagerEnd}
            style={{ flex: 1, marginTop: 4 }}
          >
            {sections.map(section => (
              <View key={section.monthKey} style={{ width }}>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 6, paddingBottom: 24 }}
                  showsVerticalScrollIndicator={false}
                >
                  {section.data.map((tx, i) => (
                    <View key={tx.id}>
                      {i > 0 && <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: 46 }} />}
                      <Pressable onPress={() => store.openEditTx(tx.id, 'sheet')}>
                        <TxRow tx={tx} baseCur={baseCur} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* Rendered inside this sheet rather than alongside it at the root:
          stacking a native Modal on another only works reliably when the
          second one lives in the first's tree. `source` keeps this instance
          and the Dashboard's from both claiming the same edit. */}
      <TransactionDetail source="sheet" />
    </ModalShell>
  );
}

function TxRow({ tx, baseCur }: { tx: ApiTransaction; baseCur: Currency }) {
  const store = useSpendOwl();
  const cat = CATS[tx.category];
  const inc = tx.amountMinor > 0;
  const card = tx.cardId ? store.creditCards.find(c => c.id === tx.cardId) : undefined;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 }}>
      <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.iconBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: cat.color, fontSize: 14, fontFamily: fonts.bold }}>{tx.merchant[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: fonts.medium, color: colors.text }} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textDim45, marginTop: 1 }}>
          {longDate(tx.occurredAt)} · {catName(cat.name)}
        </Text>
        {tx.note ? (
          <Text style={{ fontSize: 11, color: colors.textDim38, marginTop: 2, lineHeight: 15 }} numberOfLines={2}>
            {tx.note}
          </Text>
        ) : null}
        {(tx.taxDeductible || card) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
            {card ? (
              <View style={{ borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: card.color + '1F', borderWidth: 1, borderColor: card.color + '4D' }}>
                <Text style={{ fontSize: 10, fontFamily: fonts.medium, color: card.color }}>{card.name}</Text>
              </View>
            ) : null}
            {tx.taxDeductible ? (
              <View style={{ borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: 'rgba(74,222,128,.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,.3)' }}>
                <Text style={{ fontSize: 10, fontFamily: fonts.medium, color: colors.mint }}>{t('Tax deductible')}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
      <Text style={{ fontSize: 13.5, fontFamily: moneyFont(baseCur, 'bold'), color: inc ? colors.mint : colors.text }}>
        {(inc ? '+' : '−') + formatMoney(Math.abs(minorToEur(tx.amountMinor)), baseCur, 2)}
      </Text>
    </View>
  );
}
