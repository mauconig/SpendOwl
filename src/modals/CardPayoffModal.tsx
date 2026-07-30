import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ModalShell } from '../components/ModalShell';
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

  // `card` goes null the instant the modal is dismissed, and returning null on
  // that would unmount the shell before it could animate out. Holding on to the
  // last one keeps the content on screen for the length of the slide down.
  const [shown, setShown] = useState(card);
  useEffect(() => {
    if (card) setShown(card);
  }, [card]);

  if (!shown) return null;

  const months = Number(monthsInput);
  const payment = Number(paymentInput);

  let resultPayment: number | null = null;
  let resultMonths: number | null = null;
  let interest = 0;

  if (mode === 'months' && months > 0) {
    resultPayment = paymentForMonths(shown.balance, shown.apr, months);
    interest = totalInterestPaid(shown.balance, resultPayment, months);
  } else if (mode === 'payment' && payment > 0) {
    resultMonths = monthsForPayment(shown.balance, shown.apr, payment);
    if (resultMonths !== null) interest = totalInterestPaid(shown.balance, payment, resultMonths);
  }

  const neverPaysOff = mode === 'payment' && payment > 0 && resultMonths === null;
  const interestRatio = shown.balance > 0 ? interest / shown.balance : 0;
  const verdict = neverPaysOff
    ? { t: `This payment won't cover the interest — you'd never pay it off. Try a higher amount.`, c: colors.rose, bd: 'rgba(248,113,113,.35)' }
    : interestRatio < 0.2
      ? { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — a solid payoff pace.`, c: colors.mint, bd: 'rgba(74,222,128,.35)' }
      : interestRatio < 0.5
        ? { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — could be faster with a bigger payment.`, c: colors.amber, bd: 'rgba(250,204,21,.35)' }
        : { t: `≈ ${formatMoney(interest, baseCur, 2)} in interest — this will cost you a lot over time.`, c: colors.rose, bd: 'rgba(248,113,113,.35)' };

  return (
    <ModalShell
      visible={!!card}
      onClose={store.closePayoff}
      variant="center"
      blur
      contentStyle={{ backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.sheetBorder, borderRadius: 24, padding: 20, gap: 16 }}
    >
      <View>
        <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>{shown.name}</Text>
        <Text style={{ fontSize: 12.5, color: colors.textDim55, marginTop: 3 }}>
          {shown.last4 ? `•••• ${shown.last4} · ` : ''}
          {formatMoney(shown.balance, baseCur, 2)} at {shown.apr}% APR
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
    </ModalShell>
  );
}
