import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Paper } from '../components/Paper';
import { Toggle } from '../components/Toggle';
import { Icon } from '../icons';
import { colors, fonts } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, color: colors.textDim45 }}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontFamily: fonts.medium, color: valueColor ?? colors.text }}>{value}</Text>
    </View>
  );
}

export function InvoiceDetail() {
  const store = useSpendOwl();
  const inv = store.invOpen ? store.vaultItems.find(v => v.id === store.invOpen) : null;
  if (!inv) return null;

  const status = store.vaultPatch[inv.id] ?? inv.status;
  const isWarn = status === 'warn';
  const card = store.cardFor('inv-' + inv.id);

  return (
    <Modal visible={!!inv} transparent animationType="slide" onRequestClose={store.closeInvoice}>
      <View style={{ flex: 1, backgroundColor: colors.screenBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, paddingHorizontal: 10 }}>
          <Pressable onPress={store.closeInvoice} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={20} color={colors.text} />
          </Pressable>
          <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>Factura detail</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 24, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 150, height: 190, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' }}>
            <Paper seed={inv.seed} />
          </View>

          {isWarn ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(255,196,107,.08)', borderWidth: 1, borderColor: 'rgba(255,196,107,.3)', borderRadius: 14, padding: 11, paddingHorizontal: 13 }}>
              <Icon name="warn" size={18} color={colors.amber} />
              <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textDim75 }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.amberText }}>Needs review. </Text>
                VAT number missing — add it below or approve as-is.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(77,240,184,.07)', borderWidth: 1, borderColor: 'rgba(77,240,184,.3)', borderRadius: 14, padding: 11, paddingHorizontal: 13 }}>
              <Icon name="check" size={18} color={colors.mint} />
              <Text style={{ fontSize: 12.5, color: colors.textDim75 }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.mintText }}>Logged automatically</Text> · matched from the scan
              </Text>
            </View>
          )}

          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 18, paddingHorizontal: 16 }}>
            <Field label="MERCHANT" value={inv.merchant} />
            <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
            <Field label="DATE" value={`${inv.date}, 2026`} />
            <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
            <Field label="CATEGORY" value={inv.cat} />
            <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
            <Field label="VAT ID" value={isWarn ? 'Missing — tap to add' : 'ESB-84920115'} valueColor={isWarn ? colors.amberText : colors.text} />
            <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, color: colors.textDim45 }}>TOTAL</Text>
              <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: colors.violetLight }}>{store.baseCur === 'USD' ? inv.usd : inv.amount}</Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 18, padding: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: colors.text }}>Tax deductible</Text>
              <Text style={{ fontSize: 11.5, color: colors.textDim50, marginTop: 2 }}>Flag as business expense for your Q3 return</Text>
            </View>
            <Toggle on={card.tax} onToggle={() => store.setCard('inv-' + inv.id, { tax: !card.tax })} />
          </View>

          {isWarn && (
            <Pressable onPress={store.approveInvoice}>
              <LinearGradient colors={[colors.mintDeep, colors.mint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: colors.mintDark, fontFamily: fonts.bold, fontSize: 14 }}>Approve & log</Text>
              </LinearGradient>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
