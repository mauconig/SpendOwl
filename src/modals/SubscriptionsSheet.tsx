import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../icons';
import { ModalShell } from '../components/ModalShell';
import { Toggle } from '../components/Toggle';
import { colors, decimalsFor, fonts, formatMoney, moneyFont } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { t, tf } from '../i18n';

export function SubscriptionsSheet() {
  const store = useSpendOwl();
  const active = store.subs.filter(s => !s.off);
  // Converted prices only. A USD subscription's native 9.99 cannot be added to
  // a guaraní one's 50000, and `price` is null when no rate was available —
  // leaving it out of the total is the honest answer, not counting it as zero.
  const total = active.reduce((a, s) => a + (s.price ?? 0), 0);
  const baseCur = store.baseCur;

  return (
    <ModalShell
      visible={store.subsOpen}
      onClose={store.closeSubs}
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
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>{t('Subscriptions')}</Text>
        <Text style={{ fontFamily: moneyFont(baseCur, 'mono'), fontSize: 12, color: colors.mint }}>{formatMoney(total, baseCur, 2)} / MO</Text>
      </View>
      {/* flexShrink lets the list be bounded by the sheet's maxHeight
          instead of growing past it. Until now that maxHeight never
          resolved at all — it was a percentage against a parent with no
          height of its own — so a long list simply overflowed and could
          not be scrolled. ModalShell gives the sheet a bounded parent,
          which is what makes both the cap and this shrink take effect. */}
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }}>
        {store.subs.map(s => (
          <View key={s.id} style={{ backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.hairline, borderRadius: 16, padding: 12, paddingHorizontal: 14, gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 13,
                  backgroundColor: colors.iconBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: s.off ? 0.5 : 1,
                }}
              >
                <Text style={{ color: s.color, fontSize: 15, fontFamily: fonts.bold }}>{s.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.bold,
                    color: colors.text,
                    textDecorationLine: s.off ? 'line-through' : 'none',
                    opacity: s.off ? 0.45 : 1,
                  }}
                >
                  {s.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textDim50, marginTop: 1 }}>
                  {s.off ? t('Cancelled — no longer charges') : tf('Charges the {day}', { day: s.day })}
                  {s.cardName && !s.off ? ` · ${s.cardName}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {/* The native price leads when the two differ: that is the
                    figure that is actually fixed. What it comes to in the
                    user's own currency moves with the rate every month. */}
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: moneyFont(s.currency, 'bold'),
                    color: s.off ? 'rgba(233,237,242,.35)' : colors.text,
                    textDecorationLine: s.off ? 'line-through' : 'none',
                  }}
                >
                  {formatMoney(s.nativePrice, s.currency, decimalsFor(s.currency))}/mo
                </Text>
                {s.currency !== baseCur && (
                  <Text style={{ fontSize: 10.5, fontFamily: moneyFont(baseCur, 'mono'), color: colors.textDim45, marginTop: 1 }}>
                    {s.price == null ? t('rate unavailable') : `≈ ${formatMoney(s.price, baseCur, decimalsFor(baseCur))}`}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Toggle on={s.muted} onToggle={() => store.toggleSubMute(s.id)} />
                <Text style={{ fontSize: 12, color: colors.textDim60 }}>{t('Mute alerts')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable onPress={() => store.openEditSub(s.id)} hitSlop={6} style={{ padding: 4 }}>
                  <Icon name="gear" size={14} color={colors.textDim50} />
                </Pressable>
                <Pressable onPress={() => store.toggleSubOff(s.id)}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: s.off ? colors.mint : colors.text, paddingVertical: 4, paddingHorizontal: 6 }}>
                    {s.off ? t('Undo') : t('Log cancelled')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </ModalShell>
  );
}
