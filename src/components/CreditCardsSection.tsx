import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../icons';
import { colors, fonts, formatMoneyExact } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';
import { availableOnCard } from '../store/constants';
import { t, tf } from '../i18n';

export function CreditCardsSection() {
  const store = useSpendOwl();
  const { creditCards, baseCur } = store;
  const totalDebt = creditCards.reduce((a, c) => a + c.balance, 0);

  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14.5, fontFamily: fonts.bold, color: colors.text }}>{t('Credit cards')}</Text>
        {/* The total stays the debt, in rose, while each card below leads with
            what it has left. The two answer different questions and the header
            is where the debt one belongs: per card you are deciding whether a
            purchase fits, across all of them you are asking what you owe. */}
        <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.rose }}>
          {tf('{amount} owed', { amount: formatMoneyExact(totalDebt, baseCur, 2) })}
        </Text>
      </View>

      {creditCards.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: colors.textDim50 }}>{t('No cards yet — add one below.')}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {creditCards.map(c => {
            const available = availableOnCard(c);
            // Fills with what is left rather than what is spent, so the bar and
            // the figure under it say the same thing. A bar that drains as you
            // spend, under a number that counts what you can still spend, would
            // read as two different accounts of the same card.
            const pct = c.limit > 0 ? Math.min(available / c.limit, 1) : 0;
            return (
              <Pressable key={c.id} onPress={() => store.openPayoff(c.id)} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.color + '26', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="card" size={16} color={c.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontFamily: fonts.bold, color: colors.text }} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {/* The debt moves here rather than disappearing: it is
                        still what the payoff modal behind this row is about,
                        and a card app that cannot tell you what you owe is
                        missing the point. It is secondary, not absent. */}
                    <Text style={{ fontSize: 11, color: colors.textDim45, marginTop: 1 }}>
                      {c.last4 ? `•••• ${c.last4} · ` : ''}
                      {c.apr}% APR · {tf('{amount} used', { amount: formatMoneyExact(c.balance, baseCur, 0) })}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => store.openEditCard(c.id)}
                    style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.iconBg, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="gear" size={11} color={colors.textDim60} />
                  </Pressable>
                  <Pressable onPress={() => store.removeCreditCard(c.id)} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.iconBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={11} color={colors.textDim60} />
                  </Pressable>
                  <Icon name="chev" size={16} color={colors.textDim40} />
                </View>
                <View style={{ height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.max(pct * 100, 3)}%`, borderRadius: 999, backgroundColor: c.color }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: colors.text }}>
                    {tf('{amount} available', { amount: formatMoneyExact(available, baseCur, 2) })}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textDim45 }}>
                    {tf('of {amount}', { amount: formatMoneyExact(c.limit, baseCur, 0) })}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable onPress={store.openAddCard} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 2 }}>
        <Icon name="plus" size={14} color="#78ADEE" />
        <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: '#78ADEE' }}>{t('Add card')}</Text>
      </Pressable>
    </View>
  );
}
