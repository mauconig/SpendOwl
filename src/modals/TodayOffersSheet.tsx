import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDiscounts } from '../api/hooks';
import { ModalShell } from '../components/ModalShell';
import { useSpendOwl } from '../store/SpendOwlContext';
import { colors, fonts, formatPYG } from '../theme';
import { BANK_COLORS, CATEGORY_COLORS, CATEGORY_LABELS, offerBadge, todaysOfferGroups } from '../utils/discounts';

/**
 * The detail behind one of Home's "today" cards. Home shows the headline —
 * how many offers and the best rate — and this is where the actual merchants,
 * their terms and their caps live, so the card itself can stay one line.
 *
 * It re-derives the group from useDiscounts() rather than being handed one:
 * that query is cached, and passing a snapshot through the store would freeze
 * the list at whatever it was when the card was tapped.
 */
export function TodayOffersSheet() {
  const store = useSpendOwl();
  const { data } = useDiscounts();
  const category = store.todayOffersCat;

  const offers = useMemo(() => {
    if (!category) return [];
    return todaysOfferGroups(data?.discounts ?? []).find(g => g.category === category)?.offers ?? [];
  }, [data?.discounts, category]);

  return (
    <ModalShell
      visible={category != null}
      onClose={store.closeTodayOffers}
      contentStyle={{
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 22,
        maxHeight: '78%',
      }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center', marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text, flex: 1 }} numberOfLines={1}>
          {category ? CATEGORY_LABELS[category] : ''}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: category ? CATEGORY_COLORS[category] : colors.textDim50 }}>
          {offers.length} TODAY
        </Text>
      </View>

      {/* flexShrink so the list is bounded by the sheet's maxHeight rather
          than growing past it — see SubscriptionsSheet for the full story. */}
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }}>
        {offers.map((d, idx) => {
          const badge = offerBadge(d);
          return (
            <View
              key={`${d.bank}-${d.merchant}-${idx}`}
              style={{
                backgroundColor: colors.cardAlt,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: 16,
                padding: 12,
                paddingHorizontal: 14,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text, flex: 1 }} numberOfLines={2}>
                  {d.merchant}
                </Text>
                {badge && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.mint }}>{badge.value}</Text>
                    {badge.note && <Text style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim45 }}>{badge.note}</Text>}
                  </View>
                )}
              </View>

              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.textDim60 }}>{d.description}</Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Text style={{ fontSize: 10.5, fontFamily: fonts.mono, color: BANK_COLORS[d.bank] ?? colors.textDim45 }}>
                  {d.bank}
                </Text>
                {d.eligibleDays && (
                  <Text style={{ fontSize: 10.5, fontFamily: fonts.mono, color: colors.textDim45 }}>{d.eligibleDays}</Text>
                )}
                {d.monthlyCapMinor != null && (
                  <Text style={{ fontSize: 10.5, fontFamily: fonts.mono, color: colors.textDim45 }}>cap {formatPYG(d.monthlyCapMinor)}</Text>
                )}
                {d.validUntil && (
                  <Text style={{ fontSize: 10.5, fontFamily: fonts.mono, color: colors.textDim45 }}>until {d.validUntil}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ModalShell>
  );
}
