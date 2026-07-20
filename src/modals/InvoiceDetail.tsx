import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Paper } from '../components/Paper';
import { Toggle } from '../components/Toggle';
import { Icon } from '../icons';
import { GRAD, GRAD_LOCATIONS, colors, fonts, moneyFont } from '../theme';
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
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(250,204,21,.35)', borderRadius: 16, padding: 12, paddingHorizontal: 14 }}>
              <Icon name="warn" size={18} color={colors.amber} />
              <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textDim70 }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.amber }}>Needs review. </Text>
                VAT number missing — add it below or approve as-is.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(74,222,128,.3)', borderRadius: 16, padding: 12, paddingHorizontal: 14 }}>
              <Icon name="check" size={18} color={colors.mint} />
              <Text style={{ fontSize: 12.5, color: colors.textDim70 }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.mint }}>Logged automatically</Text> · matched from the scan
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
            <Field label="VAT ID" value={isWarn ? 'Missing — tap to add' : 'ESB-84920115'} valueColor={isWarn ? colors.amber : colors.text} />
            <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, color: colors.textDim45 }}>TOTAL</Text>
              <Text style={{ fontSize: 24, fontFamily: moneyFont(store.baseCur, 'bold'), color: '#FFFFFF' }}>
                {store.baseCur === 'USD' ? inv.usd : store.baseCur === 'PYG' ? inv.pyg : inv.amount}
              </Text>
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
              <LinearGradient colors={GRAD} locations={GRAD_LOCATIONS} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: -0.1 }} style={{ borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>Approve & log</Text>
              </LinearGradient>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
