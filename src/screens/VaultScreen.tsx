import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Paper } from '../components/Paper';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../icons';
import { colors, fonts } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

export function VaultScreen() {
  const store = useSpendOwl();
  const items = store.vaultItems;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 24 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>Factura Vault</Text>
      <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 3, marginBottom: 16, fontFamily: fonts.mono }}>
        {items.length === 0 ? 'JULY · NOTHING FILED YET' : `${items.length} FILED · JULY`}
      </Text>

      {items.length === 0 ? (
        <View style={{ marginTop: 44, alignItems: 'center', gap: 14, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 30,
              borderWidth: 1.5,
              borderColor: 'rgba(77,240,184,.4)',
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(77,240,184,.05)',
            }}
          >
            <Icon name="cam" size={34} color="rgba(77,240,184,.75)" />
          </View>
          <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Your vault is empty</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textDim55, textAlign: 'center' }}>
            Snap a factura in chat and I’ll file it here — logged, categorised and ready for tax season.
          </Text>
          <Pressable onPress={store.scanFirst}>
            <View style={{ marginTop: 4, backgroundColor: colors.mint, paddingVertical: 11, paddingHorizontal: 22, borderRadius: 999 }}>
              <Text style={{ color: colors.mintDark, fontFamily: fonts.bold, fontSize: 13.5 }}>Scan your first factura</Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {items.map(v => {
            const status = store.vaultPatch[v.id] ?? v.status;
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
                  <Text style={{ fontSize: 10, color: colors.textDim45, fontFamily: fonts.mono, marginTop: -3 }}>
                    {v.date} · {v.amount}
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
