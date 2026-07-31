import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDiscounts } from '../api/hooks';
import type { ApiDiscount, ApiDiscountCategory } from '../api/types';
import { Icon } from '../icons';
import { colors, fonts, formatPYG } from '../theme';

const ALL = 'all';

// Mirrors server/src/scraper/extract.ts's DISCOUNT_CATEGORIES labels.
const CATEGORY_LABELS: Record<ApiDiscountCategory, string> = {
  groceries: 'Supermarkets & Groceries',
  restaurants: 'Restaurants & Food',
  fashion: 'Fashion & Accessories',
  beauty_health: 'Beauty & Health',
  home: 'Home & Furniture',
  electronics: 'Electronics & Media',
  auto_fuel: 'Automotive & Fuel',
  entertainment_travel: 'Entertainment & Travel',
  other: 'Other / Services',
};

// Each bank's own brand accent — GNB's confirmed from beneficios.css
// (`.beneficios { background-color: #7AB83F; }`), not a guess.
const BANK_COLORS: Record<string, string> = {
  GNB: '#7AB83F',
};

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

// memo'd so scrolling the list doesn't re-render every mounted row on each
// keystroke in the search box. No FadeIn here on purpose: with a virtualized
// list rows mount as they scroll into view, so a per-row entrance animation
// would fire continuously while scrolling instead of once on open.
const DiscountCard = React.memo(function DiscountCard({ d }: { d: ApiDiscount }) {
  return (
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
        <Text style={{ fontSize: 10.5, fontFamily: fonts.mono, color: BANK_COLORS[d.bank] ?? colors.textDim45 }}>{d.bank}</Text>
        {d.category && (
          <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>{CATEGORY_LABELS[d.category]}</Text>
        )}
        {d.eligibleDays && (
          <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>{d.eligibleDays}</Text>
        )}
        {d.monthlyCapMinor != null && (
          <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>cap {formatPYG(d.monthlyCapMinor)}</Text>
        )}
        {d.validUntil && (
          <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>until {d.validUntil}</Text>
        )}
      </View>
    </View>
  );
});

/**
 * Card discounts/"reintegros" scraped from banks' public promo pages (see
 * server/src/scraper/) — global, not user-scoped, so this is a plain read
 * with no per-user filtering. Replaces the factura vault, which stayed
 * "coming soon" (FACTURAS_ENABLED in ../store/constants) and never shipped.
 *
 * Only GNB is scraped today. Category chips are derived from whatever's
 * actually present — not a hardcoded list — so Sudameris and Cooperativa
 * Universitaria show up here for free once they're scraped too. No bank
 * filter: with one bank live it was speculative, and category is the
 * filter worth keeping.
 *
 * This is a FlatList, not a ScrollView: a single GNB scrape yields ~1200 rows,
 * and mounting all of them at once stalled the whole app — RootScreen keeps
 * every screen mounted, so the cost was paid on page switches too.
 */
export function OffersScreen() {
  const { data, isLoading } = useDiscounts();
  const discounts = data?.discounts ?? [];

  const [selCategory, setSelCategory] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  const categories = useMemo(
    () => [...new Set(discounts.map(d => d.category).filter((c): c is ApiDiscountCategory => !!c))],
    [discounts]
  );

  useEffect(() => {
    if (selCategory !== ALL && !categories.includes(selCategory as ApiDiscountCategory)) setSelCategory(ALL);
  }, [categories, selCategory]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      discounts.filter(
        d => (selCategory === ALL || d.category === selCategory) && (!query || d.merchant.toLowerCase().includes(query))
      ),
    [discounts, selCategory, query]
  );

  // An element, not a component function — an inline `() => <View/>` would be a
  // new component type on every render, remounting the TextInput and dropping
  // the keyboard on each keystroke.
  const header = (
    <View>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Offers</Text>
      <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, marginBottom: 14, fontFamily: fonts.mono }}>
        {isLoading ? 'LOADING…' : `${filtered.length} ACTIVE`}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.input,
          borderRadius: 14,
          paddingHorizontal: 14,
          marginBottom: 14,
        }}
      >
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search a shop or restaurant"
          placeholderTextColor="rgba(245,245,247,.3)"
          style={{ flex: 1, paddingVertical: 12, color: colors.text, fontSize: 14.5 }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Icon name="close" size={14} color={colors.textDim45} />
          </Pressable>
        )}
      </View>

      {categories.length > 0 && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, marginBottom: 16 }}
        >
          <Chip label="All categories" active={selCategory === ALL} onPress={() => setSelCategory(ALL)} />
          {categories.map(cat => (
            <Chip key={cat} label={CATEGORY_LABELS[cat]} active={selCategory === cat} onPress={() => setSelCategory(cat)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  const empty = isLoading ? null : (
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
          : query
            ? `No match for "${search.trim()}". Try a different spelling or category.`
            : 'Try a different category.'}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      data={filtered}
      keyExtractor={(d, idx) => `${d.bank}-${d.merchant}-${idx}`}
      renderItem={({ item }) => <DiscountCard d={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
    />
  );
}
