import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FadeIn } from '../components/FadeIn';
import { useDiscounts } from '../api/hooks';
import { Icon } from '../icons';
import { colors, fonts, formatPYG } from '../theme';

/**
 * Card discounts/"reintegros" scraped from banks' public promo pages (see
 * server/src/scraper/) — global, not user-scoped, so this is a plain read
 * with no per-user filtering. Replaces the factura vault, which stayed
 * "coming soon" (FACTURAS_ENABLED in ../store/constants) and never shipped.
 */
export function OffersScreen() {
  const { data, isLoading } = useDiscounts();
  const discounts = data?.discounts ?? [];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Offers</Text>
      <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, marginBottom: 16, fontFamily: fonts.mono }}>
        {isLoading ? 'LOADING…' : `${discounts.length} ACTIVE`}
      </Text>

      {!isLoading && discounts.length === 0 ? (
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
          <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>No offers right now</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textDim55, textAlign: 'center' }}>
            Card discounts from your banks will show up here once they're synced.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {discounts.map((d, idx) => (
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
