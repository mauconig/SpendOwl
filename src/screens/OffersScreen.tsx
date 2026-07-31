import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDiscounts } from '../api/hooks';
import type { ApiDiscount, ApiDiscountCategory } from '../api/types';
import { Icon } from '../icons';
import { colors, fonts, formatPYG } from '../theme';
import { CATEGORY_LABELS, CATEGORY_ORDER, offerBadge } from '../utils/discounts';

const ALL = 'all';

// Each bank's own brand accent, taken from their own stylesheets rather than
// guessed: GNB's green from beneficios.css (`.beneficios { background-color:
// #7AB83F; }`), Sudameris' red from the rule that draws every heading underline
// on their benefits pages (`border-bottom: solid 7px #d90613`).
const BANK_COLORS: Record<string, string> = {
  GNB: '#7AB83F',
  Sudameris: '#D90613',
};

/**
 * `tint` is what separates the two filter rows at a glance: a selected bank
 * chip goes to that bank's own brand colour — the same one its label carries on
 * every card below — while a selected category stays neutral. Without it two
 * stacked rows of identical white pills are easy to confuse.
 */
function Chip({ label, active, onPress, tint }: { label: string; active: boolean; onPress: () => void; tint?: string }) {
  const activeBg = tint ?? '#F2F2F4';
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: active ? activeBg : colors.cardAlt,
        borderWidth: 1,
        borderColor: active ? activeBg : colors.cardBorder,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: active ? fonts.bold : fonts.medium,
          color: active ? (tint ? '#FFFFFF' : '#0A0A0B') : colors.textDim60,
        }}
      >
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
  const badge = offerBadge(d);
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
        {badge && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.mint }}>{badge.value}</Text>
            {badge.note && <Text style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim45 }}>{badge.note}</Text>}
          </View>
        )}
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

  const [selBank, setSelBank] = useState<string>(ALL);
  const [selCategory, setSelCategory] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  // Most rows first, so whichever bank has the deeper catalogue leads.
  const banks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of discounts) counts.set(d.bank, (counts.get(d.bank) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([bank]) => bank);
  }, [discounts]);

  // Scoped to the selected bank: offering "Automotive & Fuel" when the chosen
  // bank has no fuel promo would just be a chip that empties the list.
  const categories = useMemo(() => {
    const inBank = selBank === ALL ? discounts : discounts.filter(d => d.bank === selBank);
    const present = new Set(inBank.map(d => d.category).filter((c): c is ApiDiscountCategory => !!c));
    const ordered = CATEGORY_ORDER.filter(c => present.has(c));
    // Any future category the server adds before this list catches up still
    // shows, just parked at the end rather than silently dropped.
    return [...ordered, ...[...present].filter(c => !CATEGORY_ORDER.includes(c))];
  }, [discounts, selBank]);

  useEffect(() => {
    if (selBank !== ALL && !banks.includes(selBank)) setSelBank(ALL);
  }, [banks, selBank]);

  // Switching bank can strip the selected category out from under the filter —
  // leaving it set would show an empty list with no obvious way back.
  useEffect(() => {
    if (selCategory !== ALL && !categories.includes(selCategory as ApiDiscountCategory)) setSelCategory(ALL);
  }, [categories, selCategory]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      discounts.filter(
        d =>
          (selBank === ALL || d.bank === selBank) &&
          (selCategory === ALL || d.category === selCategory) &&
          (!query || d.merchant.toLowerCase().includes(query))
      ),
    [discounts, selBank, selCategory, query]
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

      {/* Bank first, category second — a bank is the coarser cut, and which
          card is in your pocket is usually what you're deciding by. Only worth
          a row once there is more than one bank to choose between. */}
      {banks.length > 1 && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, marginBottom: 10 }}
        >
          <Chip label="All banks" active={selBank === ALL} onPress={() => setSelBank(ALL)} />
          {banks.map(bank => (
            <Chip
              key={bank}
              label={bank}
              active={selBank === bank}
              onPress={() => setSelBank(selBank === bank ? ALL : bank)}
              tint={BANK_COLORS[bank] ?? colors.textDim60}
            />
          ))}
        </ScrollView>
      )}

      {categories.length > 0 && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, marginBottom: 16 }}
        >
          <Chip label="All categories" active={selCategory === ALL} onPress={() => setSelCategory(ALL)} />
          {categories.map(cat => (
            <Chip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              active={selCategory === cat}
              onPress={() => setSelCategory(selCategory === cat ? ALL : cat)}
            />
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
        {/* Name the filters actually narrowing things, so the way out is the
            thing the sentence points at rather than a guess. */}
        {discounts.length === 0
          ? "Card discounts from your banks will show up here once they're synced."
          : query
            ? `No match for "${search.trim()}"${selBank === ALL ? '' : ` at ${selBank}`}. Try a different spelling${
                selBank === ALL ? '' : ', or All banks'
              }.`
            : selBank === ALL
              ? 'Try a different category.'
              : `${selBank} has nothing in this category. Try another, or All banks.`}
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
