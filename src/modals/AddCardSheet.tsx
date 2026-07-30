import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ModalShell } from '../components/ModalShell';
import { GRAD, GRAD_LOCATIONS, colors, fonts } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { formatThousands, parseThousands } from '../utils/moneyInput';

function Field({ label, value, onChangeText, placeholder, keyboardType, maxLength }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: colors.textDim50 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(245,245,247,.3)"
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={{ backgroundColor: colors.input, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14.5 }}
      />
    </View>
  );
}

export function AddCardSheet() {
  const store = useSpendOwl();
  const [name, setName] = useState('');
  const [balanceDigits, setBalanceDigits] = useState('');
  const [limitDigits, setLimitDigits] = useState('');
  const [apr, setApr] = useState('');

  const reset = () => {
    setName('');
    setBalanceDigits('');
    setLimitDigits('');
    setApr('');
  };

  const close = () => {
    store.closeAddCard();
    reset();
  };

  const balance = parseThousands(balanceDigits);
  const limit = parseThousands(limitDigits);
  const canSubmit = name.trim().length > 0 && balance >= 0 && limit > 0 && Number(apr) >= 0;

  const submit = () => {
    if (!canSubmit) return;
    store.addCreditCard({ name: name.trim(), balance, limit, apr: Number(apr) });
    close();
  };

  return (
    <ModalShell
      visible={store.addCardOpen}
      onClose={close}
      contentStyle={{
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 22,
        gap: 14,
      }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center' }} />
      <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Add a card</Text>

      <Field label="Card name" value={name} onChangeText={setName} placeholder="Visa Platinum" />
      <Field
        label="Balance owed"
        value={formatThousands(balanceDigits)}
        onChangeText={v => setBalanceDigits(v.replace(/\D/g, ''))}
        placeholder="0"
        keyboardType="number-pad"
      />
      <Field
        label="Credit limit"
        value={formatThousands(limitDigits)}
        onChangeText={v => setLimitDigits(v.replace(/\D/g, ''))}
        placeholder="0"
        keyboardType="number-pad"
      />
      <Field label="APR / interest rate (%)" value={apr} onChangeText={setApr} placeholder="24.99" keyboardType="decimal-pad" />

      <Pressable onPress={submit} disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.4 }}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 2 }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>Add card</Text>
        </LinearGradient>
      </Pressable>
    </ModalShell>
  );
}
