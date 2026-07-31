import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ModalShell } from '../components/ModalShell';
import { Toggle } from '../components/Toggle';
import { Icon } from '../icons';
import {
  CATS,
  CatKey,
  colors,
  decimalsFor,
  displayToMinor,
  fonts,
  formatMoney,
  minorToDisplay,
  moneyFont,
} from '../theme';
import { minorToEur } from '../api/types';
import { useSpendOwl } from '../store/SpendOwlContext';
import { formatAmountInput, parseAmountInput } from '../utils/moneyInput';
import { longDate, parseDay, toDayString } from '../utils/date';

const CAT_KEYS = Object.keys(CATS) as CatKey[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textDim45 }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: colors.input,
  borderRadius: 14,
  paddingVertical: 12,
  paddingHorizontal: 14,
  color: colors.text,
  fontSize: 14.5,
} as const;

/**
 * Edit or delete one transaction.
 *
 * Rendered twice, once per surface, and each instance ignores anything opened
 * by the other. That is not redundancy: the Dashboard's list sits on the page,
 * but the full history is itself a native Modal, and stacking one Modal on
 * another is only reliable when the second is rendered inside the first's tree.
 * So the sheet renders its own copy, and `editTx.from` decides which one is
 * live.
 */
export function TransactionDetail({ source }: { source: 'dash' | 'sheet' }) {
  const store = useSpendOwl();
  const { baseCur, editTx } = store;
  const open = editTx?.from === source;
  const tx = open ? store.transactions.find(t => t.id === editTx.id) : undefined;

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<CatKey>('food');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [tax, setTax] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reload the form whenever a different transaction is opened. Keyed on the id
  // rather than the row so that saving — which refetches the list and hands
  // back a new object — doesn't wipe what is on screen mid-edit.
  useEffect(() => {
    if (!tx) return;
    setMerchant(tx.merchant);
    setAmount(formatAmountInput(String(Math.abs(minorToDisplay(tx.amountMinor, baseCur))), baseCur));
    setCat(tx.category);
    setDate(tx.occurredAt);
    setNote(tx.note ?? '');
    setTax(tx.taxDeductible);
    setConfirmingDelete(false);
    setPickingDate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTx?.id, baseCur]);

  const close = () => {
    store.closeEditTx();
    setConfirmingDelete(false);
    setPickingDate(false);
  };

  const amountValue = parseAmountInput(amount, baseCur);
  const canSave = merchant.trim().length > 0 && amountValue > 0 && ISO_DATE.test(date);

  const save = () => {
    if (!tx || !canSave) return;
    store.updateTransaction({
      id: tx.id,
      merchant: merchant.trim(),
      category: cat,
      // The field is always a positive number; the sign comes from the
      // category. That keeps an edited row consistent no matter what it was
      // before — recategorising a mistaken expense as income flips it, rather
      // than leaving a negative amount filed under income.
      amountMinor: (cat === 'income' ? 1 : -1) * displayToMinor(amountValue, baseCur),
      occurredAt: date,
      note: note.trim() || null,
      taxDeductible: tax,
    });
    close();
  };

  const remove = () => {
    if (!tx) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    store.deleteTransaction(tx.id);
    close();
  };

  return (
    <ModalShell
      visible={open && !!tx}
      onClose={close}
      contentStyle={{
        maxHeight: '86%',
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 10,
        paddingBottom: 22,
      }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center' }} />

      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Edit transaction</Text>

        <Field label="MERCHANT">
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Where you paid"
            placeholderTextColor="rgba(245,245,247,.3)"
            style={inputStyle}
          />
        </Field>

        <Field label={`AMOUNT · ${baseCur}`}>
          <TextInput
            value={amount}
            onChangeText={v => setAmount(formatAmountInput(v, baseCur))}
            keyboardType={decimalsFor(baseCur) === 0 ? 'number-pad' : 'decimal-pad'}
            placeholder={decimalsFor(baseCur) === 0 ? '0' : '0.00'}
            placeholderTextColor="rgba(245,245,247,.3)"
            style={{ ...inputStyle, fontFamily: moneyFont(baseCur, 'medium') }}
          />
        </Field>

        <Field label="CATEGORY">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {CAT_KEYS.map(key => {
              const active = cat === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setCat(key)}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 7,
                    paddingHorizontal: 13,
                    backgroundColor: active ? '#F2F2F4' : colors.cardAlt,
                    borderWidth: 1,
                    borderColor: active ? '#F2F2F4' : colors.cardBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: active ? fonts.bold : fonts.medium,
                      color: active ? '#0A0A0B' : colors.textDim60,
                    }}
                  >
                    {CATS[key].name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {tx?.cardId ? (
          (() => {
            const card = store.creditCards.find(c => c.id === tx.cardId);
            if (!card) return null;
            // Read-only: nothing today lets you reassign which card a logged
            // transaction was paid with, only see it.
            return (
              <Field label="PAID WITH">
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    backgroundColor: card.color + '1F',
                    borderWidth: 1,
                    borderColor: card.color + '4D',
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.medium, color: card.color }}>{card.name}</Text>
                </View>
              </Field>
            );
          })()
        ) : null}

        {/* Only on rows a subscription generated. The rate is shown because it
            is frozen: this charge used the rate on the day it happened, and
            next month's will use a different one — which is the whole reason
            the subscription stores a currency rather than one fixed amount. */}
        {tx?.originalCurrency != null && tx.originalMinor != null && (
          <Field label="BILLED AS">
            <Text style={{ fontSize: 14.5, color: colors.text }}>
              {formatMoney(minorToEur(tx.originalMinor), tx.originalCurrency, decimalsFor(tx.originalCurrency))}
            </Text>
            {tx.fxRate != null && tx.originalCurrency !== baseCur && (
              // A plain number, not formatMoney: that helper expects the
              // minor-units/100 convention and would read a rate of 0.86 as
              // one cent. A rate is not an amount.
              <Text style={{ fontSize: 11.5, fontFamily: fonts.mono, color: colors.textDim45, marginTop: 4 }}>
                1 {tx.originalCurrency} = {tx.fxRate.toLocaleString('en-US', { maximumFractionDigits: 2 })} {baseCur} on
                this date
              </Text>
            )}
          </Field>
        )}

        <Field label="DATE">
          <Pressable
            onPress={() => setPickingDate(v => !v)}
            style={{ ...inputStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 14.5, color: colors.text }}>{date ? longDate(date) : 'Pick a date'}</Text>
            <Icon name="chev" size={16} color={colors.textDim40} />
          </Pressable>

          {pickingDate && date ? (
            <DateTimePicker
              value={parseDay(date)}
              mode="date"
              // iOS renders the calendar in place, which sits fine inside the
              // sheet; Android puts up its own dialog and dismisses itself.
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              // A transaction cannot have happened tomorrow.
              maximumDate={new Date()}
              themeVariant="dark"
              accentColor={colors.mint}
              onChange={(event, selected) => {
                if (Platform.OS !== 'ios') setPickingDate(false);
                if (event.type === 'dismissed' || !selected) return;
                // toDayString, never toISOString: the latter converts to UTC
                // first, so picking the 30th in Asunción would save the 29th.
                setDate(toDayString(selected));
              }}
            />
          ) : null}
        </Field>

        <Field label="NOTE">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor="rgba(245,245,247,.3)"
            multiline
            style={{ ...inputStyle, minHeight: 62, textAlignVertical: 'top' }}
          />
        </Field>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            backgroundColor: colors.cardAlt,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 16,
            padding: 13,
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontFamily: fonts.medium, color: colors.text }}>Tax deductible</Text>
            <Text style={{ fontSize: 11.5, color: colors.textDim50, marginTop: 2 }}>Flag as a business expense</Text>
          </View>
          <Toggle on={tax} onToggle={() => setTax(v => !v)} />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 9 }}>
        <Pressable
          onPress={save}
          disabled={!canSave}
          style={{
            alignItems: 'center',
            paddingVertical: 13,
            borderRadius: 999,
            backgroundColor: '#F2F2F4',
            opacity: canSave ? 1 : 0.4,
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: '#0A0A0B' }}>Save changes</Text>
        </Pressable>

        {/* Two-tap rather than a confirmation dialog: deleting is destructive
            and worth a beat, but a second modal stacked on this one is exactly
            the fragile arrangement this component already works around. */}
        <Pressable
          onPress={remove}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            paddingVertical: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: confirmingDelete ? colors.rose : colors.cardBorder,
            backgroundColor: confirmingDelete ? 'rgba(248,113,113,.12)' : 'transparent',
          }}
        >
          <Icon name={confirmingDelete ? 'warn' : 'close'} size={14} color={colors.rose} />
          <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.rose }}>
            {confirmingDelete ? 'Tap again to delete' : 'Delete transaction'}
          </Text>
        </Pressable>
      </View>
    </ModalShell>
  );
}
