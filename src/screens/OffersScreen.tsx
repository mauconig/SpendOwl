import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FadeIn } from '../components/FadeIn';
import { useDiscounts } from '../api/hooks';
import { Icon } from '../icons';
import { colors, fonts, formatPYG } from '../theme';

const ALL = 'all';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: active ? '#F2F2F4' : colors.cardAlt,
        borderWidth: 1,
        borderColor: active ? '#F2F2F4' : colors.cardBorder,
      }}
    >
      <Text style={{ fontSize: 12, fontFamily: active ? fonts.bold : fonts.medium, color: active ? '#0A0A0B' : colors.textDim60 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Card discounts/"reintegros" scraped from banks' public promo pages (see
 * server/src/scraper/) — global, not user-scoped, so this is a plain read
 * with no per-user filtering. Replaces the factura vault, which stayed
 * "coming soon" (FACTURAS_ENABLED in ../store/constants) and never shipped.
 *
 * Only GNB is scraped today, but bank/category chips are derived from
 * whatever's actually in the data — not a hardcoded list — so Sudameris and
 * Cooperativa Universitaria show up here for free once they're scraped too.
 */
export function OffersScreen() {
  const { data, isLoading } = useDiscounts();
  const discounts = data?.discounts ?? [];

  const [selBank, setSelBank] = useState<string>(ALL);
  const [selCategory, setSelCategory] = useState<string>(ALL);

  const banks = useMemo(() => [...new Set(discounts.map(d => d.bank))].sort(), [discounts]);

  // Scoped to the selected bank, so switching banks never leaves a category
  // chip visible that has no offers under the newly-selected bank.
  const categories = useMemo(() => {
    const scoped = selBank === ALL ? discounts : discounts.filter(d => d.bank === selBank);
    return [...new Set(scoped.map(d => d.category).filter((c): c is string => !!c))].sort();
  }, [discounts, selBank]);

  useEffect(() => {
    if (selCategory !== ALL && !categories.includes(selCategory)) setSelCategory(ALL);
  }, [categories, selCategory]);

  const filtered = discounts.filter(
    d => (selBank === ALL || d.bank === selBank) && (selCategory === ALL || d.category === selCategory)
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Offers</Text>
      <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, marginBottom: 14, fontFamily: fonts.mono }}>
        {isLoading ? 'LOADING…' : `${filtered.length} ACTIVE`}
      </Text>

      {banks.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <Chip label="All banks" active={selBank === ALL} onPress={() => setSelBank(ALL)} />
          {banks.map(bank => (
            <Chip key={bank} label={bank} active={selBank === bank} onPress={() => setSelBank(bank)} />
          ))}
        </View>
      )}

      {categories.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Chip label="All categories" active={selCategory === ALL} onPress={() => setSelCategory(ALL)} />
          {categories.map(cat => (
            <Chip key={cat} label={cat} active={selCategory === cat} onPress={() => setSelCategory(cat)} />
          ))}
        </View>
      )}

      {!isLoading && filtered.length === 0 ? (
        <View style={{ marginTop: 44, alignItems: 'center', gap: 14, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,.08)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="card" size={34} color={colors.textDim45} />
          </View>
          <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>
            {discounts.length === 0 ? 'No offers right now' : 'No offers match this filter'}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textDim55, textAlign: 'center' }}>
            {discounts.length === 0
              ? "Card discounts from your banks will show up here once they're synced."
              : 'Try a different bank or category.'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {filtered.map((d, idx) => (
            <FadeIn key={`${d.bank}-${d.merchant}-${idx}`}>
              <View
                style={{
                  backgroundColor: colors.cardAlt,
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  borderRadius: 16,
                  padding: 14,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.text, flex: 1 }} numberOfLines={2}>
                    {d.merchant}
                  </Text>
                  {d.percent != null ? (
                    <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.mint }}>{d.percent}%</Text>
                  ) : d.installments != null ? (
                    <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.mint }}>{d.installments}x</Text>
                  ) : null}
                </View>

                <Text style={{ fontSize: 12, lineHeight: 17, color: colors.textDim60 }}>{d.description}</Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>{d.bank}</Text>
                  {d.category && (
                    <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>{d.category}</Text>
                  )}
                  {d.eligibleDays && (
                    <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>{d.eligibleDays}</Text>
                  )}
                  {d.monthlyCapMinor != null && (
                    <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>
                      cap {formatPYG(d.monthlyCapMinor)}
                    </Text>
                  )}
                  {d.validUntil && (
                    <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>until {d.validUntil}</Text>
                  )}
                </View>
              </View>
            </FadeIn>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
