import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ModalShell } from '../components/ModalShell';
import { GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { AFFORD_OPTS, SAVINGS_TODAY, useSpendOwl } from '../store/SpendOwlContext';
import { t } from '../i18n';

export function AffordModal() {
  const store = useSpendOwl();
  const opt = AFFORD_OPTS[store.affordSel];
  const after = SAVINGS_TODAY - opt.v;
  const baseCur = store.baseCur;

  const verdict =
    after > 1500
      ? { t: t('Yes — comfortably within your buffer.'), c: colors.mint, bg: colors.card, bd: 'rgba(74,222,128,.35)' }
      : after > 500
        ? { t: 'Yes, but it’ll be tight this month.', c: colors.amber, bg: colors.card, bd: 'rgba(250,204,21,.35)' }
        : { t: t('I’d wait — this cuts deep into your buffer.'), c: colors.rose, bg: colors.card, bd: 'rgba(248,113,113,.35)' };

  return (
    <ModalShell
      visible={store.affordOpen}
      onClose={store.closeAfford}
      variant="center"
      blur
      contentStyle={{
        backgroundColor: colors.sheet,
        borderWidth: 1,
        borderColor: colors.sheetBorder,
        borderRadius: 24,
        padding: 20,
        gap: 16,
      }}
    >
      <View>
        <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>{t('Can I afford this?')}</Text>
        <Text style={{ fontSize: 12.5, color: colors.textDim55, marginTop: 3 }}>{t('Sandbox a purchase before you commit.')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {AFFORD_OPTS.map((o, i) => {
          const active = store.affordSel === i;
          return (
            <Pressable
              key={o.name}
              onPress={() => store.setAffordSel(i)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 9,
                paddingHorizontal: 4,
                borderRadius: 12,
                backgroundColor: active ? '#F2F2F4' : colors.iconBg,
              }}
            >
              <Text style={{ fontSize: 11.5, fontFamily: moneyFont(baseCur, 'bold'), color: active ? '#0A0A0B' : colors.textDim60 }}>
                {o.name} {formatMoney(o.v, baseCur, 0)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 14 }}>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.textDim65 }}>{t('Savings today')}</Text>
            <Text style={{ fontSize: 12, fontFamily: moneyFont(baseCur, 'bold'), color: colors.mint }}>{formatMoney(SAVINGS_TODAY, baseCur, 0)}</Text>
          </View>
          <View style={{ height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: '100%', borderRadius: 999, backgroundColor: colors.mint }} />
          </View>
        </View>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.textDim65 }}>{t('After purchase')}</Text>
            <Text style={{ fontSize: 12, fontFamily: moneyFont(baseCur, 'bold'), color: colors.text }}>{formatMoney(after, baseCur, 0)}</Text>
          </View>
          <View style={{ height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <LinearGradient
              colors={GRAD}
              locations={GRAD_LOCATIONS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: '100%', width: `${Math.max((after / SAVINGS_TODAY) * 100, 3)}%`, borderRadius: 999 }}
            />
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'center', backgroundColor: verdict.bg, borderWidth: 1, borderColor: verdict.bd, borderRadius: 12, padding: 10, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: verdict.c, textAlign: 'center' }}>{verdict.t}</Text>
      </View>

      <Pressable onPress={store.closeAfford} style={{ alignItems: 'center', paddingVertical: 11, borderRadius: 999, backgroundColor: '#F2F2F4' }}>
        <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: '#0A0A0B' }}>{t('Done')}</Text>
      </Pressable>
    </ModalShell>
  );
}
