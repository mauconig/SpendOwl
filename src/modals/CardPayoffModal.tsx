import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SlideUp } from '../components/FadeIn';
import { colors, fonts, formatMoney, moneyFont } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { monthsForPayment, paymentForMonths, totalInterestPaid } from '../utils/payoff';

type Mode = 'months' | 'payment';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: active ? '#F2F2F4' : colors.iconBg }}
    >
      <Text style={{ fontSize: 12.5, fontFamily: fonts.bold, color: active ? '#0A0A0B' : colors.textDim60 }}>{label}</Text>
    </Pressable>
  );
}

export function CardPayoffModal() {
  const store = useSpendOwl();
  const card = store.creditCards.find(c => c.id === store.payoffCardId) ?? null;
  const baseCur = store.baseCur;

  const [mode, setMode] = useState<Mode>('months');
  const [monthsInput, setMonthsInput] = useState('12');
  const [paymentInput, setPaymentInput] = useState('');

  useEffect(() => {
    if (!card) return;
    setMode('months');
    setMonthsInput('12');
    setPaymentInput(String(Math.max(Math.round(card.balance * 0.03), 25)));
  }, [store.payoffCardId]);

  if (!card) return null;

  const months = Number(monthsInput);
  const payment = Number(paymentInput);

  let resultPayment: number | null = null;
  let resultMonths: number | null = null;
  let interest = 0;

  if (mode === 'months' && months > 0) {
    resultPayment = paymentForMonths(card.balance, card.apr, months);
    interest = totalInterestPaid(card.balance, resultPayment, months);
  } else if (mode === 'payment' && payment > 0) {
    resultMonths = monthsForPayment(card.balance, card.apr, payment);
    if (resultMonths !== null) interest = totalInterestPaid(card.balance, payment, resultMonths);
  }

  const neverPaysOff = mode === 'payment' && payment > 0 && resultMonths === null;
  const interestRatio = card.balance > 0 ? interest / card.balance : 0;
  const verdict = neverPaysOff
    ? { t: `This payment won't cover the interest — you'd never pay it off. Try a higher amount.`, c: colors.rose, bd: 'rgba(248,113,113,.35)' }
    : interestRatio < 0.2
      ? { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — a solid payoff pace.`, c: colors.mint, bd: 'rgba(74,222,128,.35)' }
      : interestRatio < 0.5
        ? { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — could be faster with a bigger payment.`, c: colors.amber, bd: 'rgba(250,204,21,.35)' }
        : { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — this will cost you a lot over time.`, c: colors.rose, bd: 'rgba(248,113,113,.35)' };

  return (
    <Modal visible={!!card} transparent animationType="fade" onRequestClose={store.closePayoff}>
      <Pressable onPress={store.closePayoff} style={{ flex: 1 }}>
        <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(4,5,8,.5)' }}>
          <Pressable onPress={e => e.stopPropagation()} style={{ width: '100%' }}>
            <SlideUp style={{ width: '100%', backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.sheetBorder, borderRadius: 24, padding: 20, gap: 16 }}>
              <View>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>{card.name}</Text>
                <Text style={{ fontSize: 12.5, color: colors.textDim55, marginTop: 3 }}>
                  •••• {card.last4} · {formatMoney(card.balance, baseCur, 2)} at {card.apr}% APR
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Target a date" active={mode === 'months'} onPress={() => setMode('months')} />
                <Chip label="Set a payment" active={mode === 'payment'} onPress={() => setMode('payment')} />
              </View>

              {mode === 'months' ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.textDim50 }}>Months to pay off</Text>
                  <TextInput
                    value={monthsInput}
                    onChangeText={setMonthsInput}
                    keyboardType="number-pad"
                    placeholder="12"
                    placeholderTextColor="rgba(245,245,247,.3)"
                    style={{ backgroundColor: colors.input, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14.5 }}
                  />
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.textDim50 }}>Monthly payment</Text>
                  <TextInput
                    value={paymentInput}
                    onChangeText={setPaymentInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="rgba(245,245,247,.3)"
                    style={{ backgroundColor: colors.input, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14.5 }}
                  />
                </View>
              )}

              <View style={{ alignItems: 'center', gap: 4 }}>
                {mode === 'months' && resultPayment !== null && (
                  <Text style={{ fontSize: 22, fontFamily: moneyFont(baseCur, 'bold'), color: colors.text }}>
                    {formatMoney(resultPayment, baseCur, 2)}
                    <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.textDim50 }}> / month</Text>
                  </Text>
                )}
                {mode === 'payment' && resultMonths !== null && (
                  <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>
                    {resultMonths} <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.textDim50 }}>months to debt-free</Text>
                  </Text>
                )}
              </View>

              {((mode === 'months' && months > 0) || (mode === 'payment' && payment > 0)) && (
                <View style={{ alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: verdict.bd, borderRadius: 12, padding: 10, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: verdict.c, textAlign: 'center' }}>{verdict.t}</Text>
                </View>
              )}

              <Pressable onPress={store.closePayoff} style={{ alignItems: 'center', paddingVertical: 11, borderRadius: 999, backgroundColor: '#F2F2F4' }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: '#0A0A0B' }}>Done</Text>
              </Pressable>
            </SlideUp>
          </Pressable>
        </BlurView>
      </Pressable>
    </Modal>
  );
}
