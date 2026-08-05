import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ModalShell } from '../components/ModalShell';
import { GRAD, GRAD_LOCATIONS, colors, fonts, displayToMinor, minorToDisplay } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { formatAmountInput, parseAmountInput, formatThousands, parseThousands } from '../utils/moneyInput';
import { t } from '../i18n';

function Field({ label, value, onChangeText, placeholder }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: colors.textDim50 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(245,245,247,.3)"
        keyboardType="number-pad"
        style={{ backgroundColor: colors.input, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14.5 }}
      />
    </View>
  );
}

/**
 * One place to reconfigure the starting balance and every card's balance,
 * replacing the old lone "Starting balance" field in Settings. Local state is
 * seeded fresh from the store every time the sheet opens, and everything
 * changed is committed together on "Save" rather than per-field, since this
 * is a deliberate reconfiguration rather than the everyday editing AddCardSheet
 * covers.
 */
export function ConfigureBalancesSheet() {
  const store = useSpendOwl();
  const { baseCur, openingBalanceMinor, creditCards, balancesSheetOpen, closeBalancesSheet, setOpeningBalance, updateCreditCard } = store;

  const [openingText, setOpeningText] = useState('');
  const [cardDigits, setCardDigits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!balancesSheetOpen) return;
    setOpeningText(openingBalanceMinor === 0 ? '' : formatAmountInput(String(minorToDisplay(openingBalanceMinor, baseCur)), baseCur));
    setCardDigits(Object.fromEntries(creditCards.map(c => [c.id, String(Math.round(c.balance))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancesSheetOpen]);

  const submit = () => {
    const minor = displayToMinor(parseAmountInput(openingText, baseCur), baseCur);
    if (minor !== openingBalanceMinor) setOpeningBalance(minor);

    for (const card of creditCards) {
      const balance = parseThousands(cardDigits[card.id] ?? '');
      if (balance !== Math.round(card.balance)) updateCreditCard({ id: card.id, balance });
    }

    closeBalancesSheet();
  };

  return (
    <ModalShell
      visible={balancesSheetOpen}
      onClose={closeBalancesSheet}
      scrollable
      contentStyle={{
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      bodyStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, gap: 14 }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center' }} />
      <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>{t('Configure balances')}</Text>

      <Field
        label={t('Starting balance')}
        value={openingText}
        onChangeText={v => setOpeningText(formatAmountInput(v, baseCur))}
        placeholder="0"
      />

      {creditCards.map(card => (
        <Field
          key={card.id}
          label={card.name}
          value={formatThousands(cardDigits[card.id] ?? '')}
          onChangeText={v => setCardDigits(prev => ({ ...prev, [card.id]: v.replace(/\D/g, '') }))}
          placeholder="0"
        />
      ))}

      <Pressable onPress={submit}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 2 }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>{t('Save changes')}</Text>
        </LinearGradient>
      </Pressable>
    </ModalShell>
  );
}
