import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Paper } from '../components/Paper';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../icons';
import { GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { FACTURAS_ENABLED } from '../store/constants';

export function VaultScreen() {
  const store = useSpendOwl();
  const items = store.vaultItems;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 64 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Factura Vault</Text>
      <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, marginBottom: 16, fontFamily: fonts.mono }}>
        {!FACTURAS_ENABLED ? 'COMING SOON' : items.length === 0 ? 'JULY · NOTHING FILED YET' : `${items.length} FILED · JULY`}
      </Text>

      {!FACTURAS_ENABLED ? (
        // Parked, not broken — see FACTURAS_ENABLED in src/store/constants.ts.
        // The tab stays reachable so this says what's coming rather than
        // vanishing from the nav and leaving a gap.
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
            <Icon name="folder" size={34} color={colors.textDim45} />
          </View>
          <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Facturas are coming soon</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textDim55, textAlign: 'center' }}>
            Snap a factura and have it filed here — logged, categorised and ready for tax season. Not switched on yet.
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 19, color: colors.textDim45, textAlign: 'center' }}>
            In the meantime, tell the coach what you spent and it will draft the expense for you.
          </Text>
          <Pressable onPress={() => store.setNav('chat')} style={{ marginTop: 4 }}>
            <LinearGradient
              colors={GRAD}
              locations={GRAD_LOCATIONS}
              start={{ x: 0, y: 0.1 }}
              end={{ x: 1, y: -0.1 }}
              style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 }}
            >
              <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 13.5 }}>Open the coach</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={{ marginTop: 44, alignItems: 'center', gap: 14, paddingHorizontal: 24 }}>
          <LinearGradient
            colors={GRAD}
            locations={GRAD_LOCATIONS}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: -0.1 }}
            style={{ width: 96, height: 96, borderRadius: 48, padding: 1 }}
          >
            <View style={{ flex: 1, borderRadius: 48, backgroundColor: '#101012', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="cam" size={34} color="#F5F5F7" />
            </View>
          </LinearGradient>
          <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Your vault is empty</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textDim55, textAlign: 'center' }}>
            Snap a factura in chat and I’ll file it here — logged, categorised and ready for tax season.
          </Text>
          <Pressable onPress={store.scanFirst}>
            <LinearGradient
              colors={GRAD}
              locations={GRAD_LOCATIONS}
              start={{ x: 0, y: 0.1 }}
              end={{ x: 1, y: -0.1 }}
              style={{ marginTop: 4, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 }}
            >
              <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 13.5 }}>Scan your first factura</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {items.map(v => {
            const status = v.status;
            const displayAmount = formatMoney(v.amountEur, store.baseCur, 2);
            return (
              <FadeIn key={v.id} style={{ width: '30%', gap: 6 }}>
                <Pressable onPress={() => store.openInvoice(v.id)}>
                  <View style={{ aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }}>
                    <Paper seed={v.seed} />
                    <View style={{ position: 'absolute', top: 6, right: 6 }}>
                      <Badge kind={status} />
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: colors.text, marginTop: 6 }} numberOfLines={1}>
                    {v.merchant}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textDim45, fontFamily: moneyFont(store.baseCur, 'mono'), marginTop: -3 }}>
                    {v.date} · {displayAmount}
                  </Text>
                </Pressable>
              </FadeIn>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
