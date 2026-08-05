import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon, IconName } from '../icons';
import { ModalShell } from '../components/ModalShell';
import { GRAD, GRAD_LOCATIONS, colors, fonts, displayToMinor, minorToDisplay } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { availableOnCard } from '../store/constants';
import { formatAmountInput, parseAmountInput, formatThousands, parseThousands } from '../utils/moneyInput';
import { t } from '../i18n';

function AmountRow({
  icon,
  iconColor,
  label,
  sublabel,
  value,
  onChangeText,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  sublabel?: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: iconColor + '26',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: fonts.bold, color: colors.text }} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ fontSize: 11, color: colors.textDim45, marginTop: 1 }} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        placeholderTextColor="rgba(245,245,247,.3)"
        keyboardType="number-pad"
        textAlign="right"
        style={{
          minWidth: 108,
          color: colors.text,
          fontFamily: fonts.bold,
          fontSize: 14.5,
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
        }}
      />
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.cardBorder }} />;
}

/**
 * One place to recalibrate the numbers Home and the Dashboard are built from:
 * what's actually available today, and what each card actually owes right
 * now — replacing the old lone "Starting balance" field in Settings.
 *
 * The available-balance field isn't `openingBalanceMinor` directly — nobody
 * remembers what they started with, but everybody knows what they have today.
 * Entering a number here shifts the opening balance by the difference between
 * that and the current running balance, so the account lands exactly on the
 * figure typed without rewriting transaction history.
 *
 * Local state is seeded fresh from the store every time the sheet opens, and
 * everything changed is committed together on "Save" rather than per-field.
 */
export function ConfigureBalancesSheet() {
  const store = useSpendOwl();
  const { baseCur, openingBalanceMinor, creditCards, balancesSheetOpen, closeBalancesSheet, setOpeningBalance, updateCreditCard, summary } =
    store;

  const [availableText, setAvailableText] = useState('');
  const [cardDigits, setCardDigits] = useState<Record<string, string>>({});

  const currentAvailableMinor = summary?.balanceMinor ?? 0;

  useEffect(() => {
    if (!balancesSheetOpen) return;
    setAvailableText(formatAmountInput(String(minorToDisplay(currentAvailableMinor, baseCur)), baseCur));
    setCardDigits(Object.fromEntries(creditCards.map(c => [c.id, String(availableOnCard(c))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancesSheetOpen]);

  const submit = () => {
    const desiredAvailableMinor = displayToMinor(parseAmountInput(availableText, baseCur), baseCur);
    const delta = desiredAvailableMinor - currentAvailableMinor;
    if (delta !== 0) setOpeningBalance(openingBalanceMinor + delta);

    for (const card of creditCards) {
      // The field is what's left to spend, not what's owed — so it's the
      // limit that anchors the conversion back to a balance, the same way
      // CreditCardsSection derives one from the other.
      const enteredAvailable = parseThousands(cardDigits[card.id] ?? '');
      const balance = Math.max(Math.round(card.limit) - enteredAvailable, 0);
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
      bodyStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, gap: 18 }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.2)', alignSelf: 'center' }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>{t('Configure balances')}</Text>
        <Text style={{ fontSize: 12, color: colors.textDim50 }}>
          {t('Set what you actually have today — Home and the Dashboard adjust to match.')}
        </Text>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14 }}>
        <AmountRow
          icon="arrowNE"
          iconColor="#4ADE80"
          label={t('Available balance')}
          value={availableText}
          onChangeText={v => setAvailableText(formatAmountInput(v, baseCur))}
        />
      </View>

      {creditCards.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.textDim45, letterSpacing: 0.3 }}>
            {t('Credit cards').toUpperCase()}
          </Text>
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14, gap: 14 }}>
            {creditCards.map((card, i) => (
              <React.Fragment key={card.id}>
                {i > 0 ? <Divider /> : null}
                <AmountRow
                  icon="card"
                  iconColor={card.color}
                  label={card.name}
                  sublabel={t('Available credit')}
                  value={formatThousands(cardDigits[card.id] ?? '')}
                  onChangeText={v => setCardDigits(prev => ({ ...prev, [card.id]: v.replace(/\D/g, '') }))}
                />
              </React.Fragment>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable onPress={submit}>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
        >
          <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14 }}>{t('Save changes')}</Text>
        </LinearGradient>
      </Pressable>
    </ModalShell>
  );
}
