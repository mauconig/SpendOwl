import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ModalShell } from '../components/ModalShell';
import { GRAD, GRAD_LOCATIONS, colors, decimalsFor, fonts, type Currency } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

const CURRENCIES: Currency[] = ['PYG', 'USD', 'EUR'];

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
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
        style={{ backgroundColor: colors.input, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14.5 }}
      />
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: active ? '#F2F2F4' : colors.cardAlt,
        borderWidth: 1,
        borderColor: active ? '#F2F2F4' : colors.cardBorder,
      }}
    >
      <Text style={{ fontSize: 12.5, fontFamily: active ? fonts.bold : fonts.medium, color: active ? '#0A0A0B' : colors.textDim60 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Editing one subscription's terms — price, the currency it bills in, renewal
 * day, and which card pays for it.
 *
 * The currency is the point of this sheet. A subscription now charges a real
 * transaction every month converted at that month's rate, so recording that
 * Netflix bills in USD is what makes its guaraní cost track reality instead of
 * being frozen at whatever it happened to be when it was added.
 *
 * There is no add mode: subscriptions are still only created through the chat
 * coach, which is why this mirrors AddCardSheet's edit half rather than the
 * whole of it.
 */
export function EditSubSheet() {
  const store = useSpendOwl();
  const sheet = store.subSheet;
  const sub = sheet ? store.subs.find(s => s.id === sheet.id) : undefined;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [day, setDay] = useState('');
  const [cardId, setCardId] = useState<string | null>(null);

  // Re-read from the subscription on every open rather than holding local
  // state across opens, so the form always starts from what is actually stored.
  useEffect(() => {
    if (!sheet || !sub) return;
    setName(sub.name);
    setCurrency(sub.currency);
    setPrice(sub.nativePrice === 0 ? '' : String(decimalsFor(sub.currency) === 0 ? Math.round(sub.nativePrice) : sub.nativePrice));
    setDay(String(sub.dayOfMonth));
    setCardId(sub.cardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const close = () => store.closeSubSheet();

  const priceValue = Number(price.replace(',', '.'));
  const dayValue = Number(day);
  const canSubmit =
    name.trim().length > 0 &&
    Number.isFinite(priceValue) &&
    priceValue > 0 &&
    Number.isInteger(dayValue) &&
    dayValue >= 1 &&
    dayValue <= 31;

  const submit = () => {
    if (!canSubmit || !sheet) return;
    store.updateSubscriptionDetails({
      id: sheet.id,
      name: name.trim(),
      price: priceValue,
      currency,
      dayOfMonth: dayValue,
      // null rather than undefined so clearing the card actually unlinks it —
      // undefined would be read as "leave it alone" by the PATCH.
      cardId: cardId ?? null,
    });
    close();
  };

  return (
    <ModalShell
      visible={sheet !== null}
      onClose={close}
      scrollable
      contentStyle={{
        backgroundColor: colors.bottomSheet,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,.1)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      // The 88% cap this used to carry is now the keyboard-aware one in
      // ModalShell, which is the figure that actually matters here.
      bodyStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, gap: 14 }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center' }} />
      <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Edit subscription</Text>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Netflix" />

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Billed in</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CURRENCIES.map(c => (
              <Pill key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />
            ))}
          </View>
          <Text style={{ fontSize: 11, color: colors.textDim45, lineHeight: 16 }}>
            The currency the service actually charges. Each monthly renewal is converted at that day's rate.
          </Text>
        </View>

        <Field
          label={`Monthly price (${currency})`}
          value={price}
          onChangeText={setPrice}
          placeholder={decimalsFor(currency) === 0 ? '50000' : '9.99'}
          keyboardType={decimalsFor(currency) === 0 ? 'number-pad' : 'decimal-pad'}
        />

        <Field label="Renews on day of month" value={day} onChangeText={v => setDay(v.replace(/\D/g, ''))} placeholder="14" keyboardType="number-pad" />

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: colors.textDim50 }}>Paid with</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pill label="No card" active={cardId === null} onPress={() => setCardId(null)} />
            {store.creditCards.map(c => (
              <Pill key={c.id} label={c.name} active={cardId === c.id} onPress={() => setCardId(c.id)} />
            ))}
          </View>
          {cardId !== null && (
            <Text style={{ fontSize: 11, color: colors.textDim45, lineHeight: 16 }}>
              Each renewal is added to this card's balance, the same as any purchase on it.
            </Text>
          )}
        </View>
      </ScrollView>

      <Pressable onPress={submit} disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.4 }}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 2 }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>Save changes</Text>
        </LinearGradient>
      </Pressable>
    </ModalShell>
  );
}
