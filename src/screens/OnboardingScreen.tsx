import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ColorSwatchPicker } from '../components/ColorSwatchPicker';
import { Icon } from '../icons';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useSpendOwl } from '../store/SpendOwlContext';
import { CARD_COLORS } from '../store/constants';
import { Currency, GRAD, GRAD_LOCATIONS, colors, displayToMinor, fonts, formatMoneyExact } from '../theme';
import { formatAmountInput, formatThousands, parseAmountInput, parseThousands } from '../utils/moneyInput';
import { t } from '../i18n';

type Step = 'name' | 'balance' | 'cards';
type DraftCard = { id: string; name: string; available: string; limit: string; apr: string; color: string };

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  autoFocus?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: colors.textDim50, letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim30}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        style={{
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 13,
          fontSize: 15,
          color: colors.text,
        }}
      />
    </View>
  );
}

function CurPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 9,
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: active ? '#F2F2F4' : 'transparent',
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: active ? '#0A0A0B' : colors.textDim45 }}>{label}</Text>
    </Pressable>
  );
}

function StepDots({ index }: { index: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={{
            width: i === index ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === index ? colors.text : colors.cardBorder,
          }}
        />
      ))}
    </View>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.4 : 1 }}>
      <LinearGradient
        colors={GRAD}
        locations={GRAD_LOCATIONS}
        start={{ x: 0, y: 0.1 }}
        end={{ x: 1, y: -0.1 }}
        style={{ borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}
      >
        <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 14.5 }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Fills in what `ensureUser` (server/src/seed.ts) can't: a name Clerk never
 * asked for on email sign-up, a starting balance, and — optionally — the
 * cards behind it. Gated in App.tsx on `store.onboarded`, which starts FALSE
 * only for rows created after the migration that added it — see
 * server/src/migrations.ts, version 12.
 */
export function OnboardingScreen() {
  const store = useSpendOwl();
  const { user } = useUser();
  const keyboardHeight = useKeyboardHeight();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(user?.fullName?.trim() ?? '');
  const [currency, setCurrency] = useState<Currency>(store.baseCur);
  const [amountText, setAmountText] = useState('');

  const [cards, setCards] = useState<DraftCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardAvailable, setCardAvailable] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [cardApr, setCardApr] = useState('');
  const [cardColor, setCardColor] = useState<string>(CARD_COLORS[0]!);

  const stepIndex = step === 'name' ? 0 : step === 'balance' ? 1 : 2;

  const goToBalance = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Best-effort: a failed Clerk write here shouldn't block someone from
    // reaching the rest of the wizard, which is why it's the only step of the
    // three not surfaced through store state.
    if (user && user.firstName !== trimmed) {
      try {
        await user.update({ firstName: trimmed });
      } catch {
        // Ignored — SettingsScreen falls back to the email's local part when
        // Clerk has no name on file, so nothing downstream breaks either way.
      }
    }
    setStep('balance');
  };

  const startAddCard = () => {
    setCardName('');
    setCardAvailable('');
    setCardLimit('');
    setCardApr('');
    setCardColor(CARD_COLORS[cards.length % CARD_COLORS.length]!);
    setAddingCard(true);
  };

  const confirmAddCard = () => {
    if (!cardName.trim()) return;
    setCards(prev => [
      ...prev,
      { id: `${Date.now()}`, name: cardName.trim(), available: cardAvailable, limit: cardLimit, apr: cardApr, color: cardColor },
    ]);
    setAddingCard(false);
  };

  const removeCard = (id: string) => setCards(prev => prev.filter(c => c.id !== id));

  const finish = () => {
    const amount = parseAmountInput(amountText, currency);
    store.completeOnboarding({ baseCurrency: currency, openingBalanceMinor: displayToMinor(amount, currency) });
    for (const card of cards) {
      const available = parseThousands(card.available);
      const limit = parseThousands(card.limit);
      store.addCreditCard({
        name: card.name,
        balance: Math.max(limit - available, 0),
        limit,
        apr: Number(card.apr) || 0,
        color: card.color,
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screenBg, paddingBottom: keyboardHeight }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 32, gap: 22 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
          <Text style={{ fontSize: 19, fontFamily: fonts.bold, color: colors.text, textAlign: 'center' }}>
            {t('Let’s set up your account')}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textDim50, textAlign: 'center' }}>
            {t('A few quick steps and you’re in.')}
          </Text>
        </View>

        <StepDots index={stepIndex} />

        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 20,
            padding: 18,
            gap: 16,
          }}
        >
          {step === 'name' ? (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>
                  {t('How should we call you?')}
                </Text>
                <Text style={{ fontSize: 12.5, color: colors.textDim50 }}>
                  {t('We’ll greet you by this name around the app.')}
                </Text>
              </View>
              <Field label={t('Your name')} value={name} onChangeText={setName} placeholder="Mauricio" autoFocus />
              <PrimaryButton label={t('Continue')} disabled={!name.trim()} onPress={() => void goToBalance()} />
            </>
          ) : step === 'balance' ? (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>
                  {t('What do you have available today?')}
                </Text>
                <Text style={{ fontSize: 12.5, color: colors.textDim50 }}>
                  {t('Set your starting balance and currency — we use them everywhere.')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.iconBg, borderRadius: 999, padding: 3 }}>
                {(['EUR', 'USD', 'PYG'] as Currency[]).map(cur => (
                  <CurPill
                    key={cur}
                    label={cur}
                    active={currency === cur}
                    onPress={() => {
                      setCurrency(cur);
                      setAmountText(formatAmountInput(parseAmountInput(amountText, currency).toString(), cur));
                    }}
                  />
                ))}
              </View>

              <Field
                label={t('Available balance')}
                value={amountText}
                onChangeText={v => setAmountText(formatAmountInput(v, currency))}
                placeholder="0"
                keyboardType={currency === 'PYG' ? 'number-pad' : 'decimal-pad'}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setStep('name')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: colors.textDim55 }}>{t('Back')}</Text>
                </Pressable>
                <View style={{ flex: 2 }}>
                  <PrimaryButton label={t('Continue')} onPress={() => setStep('cards')} />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>
                  {t('Add your credit cards')}
                </Text>
                <Text style={{ fontSize: 12.5, color: colors.textDim50 }}>
                  {t('Optional — add more anytime from Statistics.')}
                </Text>
              </View>

              {cards.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {cards.map(card => (
                    <View
                      key={card.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        backgroundColor: colors.cardAlt,
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: card.color }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, fontFamily: fonts.bold, color: colors.text }} numberOfLines={1}>
                          {card.name}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.textDim50 }}>
                          {formatMoneyExact(parseThousands(card.available), currency, 0)} {t('of').toLowerCase()}{' '}
                          {formatMoneyExact(parseThousands(card.limit), currency, 0)}
                        </Text>
                      </View>
                      <Pressable onPress={() => removeCard(card.id)} hitSlop={8}>
                        <Icon name="close" size={16} color={colors.textDim45} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : !addingCard ? (
                <Text style={{ fontSize: 12.5, color: colors.textDim45 }}>{t('No cards added yet.')}</Text>
              ) : null}

              {addingCard ? (
                <View style={{ gap: 12 }}>
                  <Field label={t('Card name')} value={cardName} onChangeText={setCardName} placeholder="Visa Platinum" />
                  <Field
                    label={t('Available credit')}
                    value={formatThousands(cardAvailable)}
                    onChangeText={v => setCardAvailable(v.replace(/\D/g, ''))}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  <Field
                    label={t('Credit limit')}
                    value={formatThousands(cardLimit)}
                    onChangeText={v => setCardLimit(v.replace(/\D/g, ''))}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  <Field
                    label={t('APR / interest rate (%)')}
                    value={cardApr}
                    onChangeText={setCardApr}
                    placeholder="24.99"
                    keyboardType="decimal-pad"
                  />
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textDim50 }}>{t('Colour')}</Text>
                    <ColorSwatchPicker value={cardColor} onChange={setCardColor} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => setAddingCard(false)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: colors.textDim55 }}>{t('Cancel')}</Text>
                    </Pressable>
                    <View style={{ flex: 2 }}>
                      <PrimaryButton label={t('Add card')} disabled={!cardName.trim()} onPress={confirmAddCard} />
                    </View>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={startAddCard}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderWidth: 1,
                    borderColor: colors.inputBorder,
                    borderStyle: 'dashed',
                    borderRadius: 14,
                    paddingVertical: 13,
                  }}
                >
                  <Icon name="plus" size={15} color={colors.textDim55} />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: colors.textDim55 }}>
                    {t('Add another card')}
                  </Text>
                </Pressable>
              )}

              {!addingCard ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => setStep('balance')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: colors.textDim55 }}>{t('Back')}</Text>
                  </Pressable>
                  <View style={{ flex: 2 }}>
                    <PrimaryButton label={t('Finish')} onPress={finish} />
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
