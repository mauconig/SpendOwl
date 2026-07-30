import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { FadeIn } from '../components/FadeIn';
import { Laser } from '../components/Laser';
import { Dots } from '../components/Dots';
import { Paper } from '../components/Paper';
import { PulseDot } from '../components/PulseDot';
import { Toggle } from '../components/Toggle';
import { Wave } from '../components/Wave';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { Icon } from '../icons';
import { CATS, CatKey, GRAD, GRAD_LOCATIONS, colors, fonts, formatMoney, moneyFont } from '../theme';
import { FACTURAS_ENABLED, Msg } from '../store/constants';
import { useSpendOwl } from '../store/SpendOwlContext';

function CardMessage({ m }: { m: Extract<Msg, { type: 'card' }> }) {
  const store = useSpendOwl();
  const card = store.cardFor(m.id);
  const cat = CATS[m.cat as CatKey];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        width: '88%',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 22,
        borderTopLeftRadius: 6,
        padding: 15,
        paddingTop: 15,
        paddingBottom: 13,
        gap: 11,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: cat.color + '26', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: cat.color, fontSize: 12, fontFamily: fonts.bold }}>{cat.name[0]}</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textDim50 }}>{cat.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: '#FFFFFF' }}>{m.merchant}</Text>
          <Text style={{ fontSize: 12, color: colors.textDim45, marginTop: 2 }}>{m.note}</Text>
        </View>
        <Text style={{ fontSize: 27, fontFamily: moneyFont(store.baseCur, 'bold'), letterSpacing: -0.5, color: '#FFFFFF' }}>{formatMoney(m.amountEur, store.baseCur, 2)}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: colors.cardBorder }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, color: colors.textDim70 }}>Business expense</Text>
        <Toggle on={card.tax} onToggle={() => store.setCard(m.id, { tax: !card.tax })} />
      </View>
      {!card.ok ? (
        // Reject deletes the draft outright — see rejectCard in SpendOwlContext.
        // Only offered before approval: afterwards a real transaction exists and
        // removing just the card would be a lie.
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Pressable
            onPress={() => store.rejectCard(m.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 11,
              paddingHorizontal: 15,
              borderRadius: 999,
              backgroundColor: colors.iconBg,
            }}
          >
            <Icon name="close" size={13} color={colors.textDim60} />
            <Text style={{ color: colors.textDim60, fontFamily: fonts.medium, fontSize: 13 }}>Reject</Text>
          </Pressable>
          <Pressable onPress={() => store.setCard(m.id, { ok: true })} style={{ flex: 1 }}>
            <LinearGradient
              colors={GRAD}
              locations={GRAD_LOCATIONS}
              start={{ x: 0, y: 0.1 }}
              end={{ x: 1, y: -0.1 }}
              style={{ borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
            >
              <Text style={{ color: '#0A0A0B', fontFamily: fonts.bold, fontSize: 13.5 }}>Approve & log</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <View
          style={{
            marginTop: 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            backgroundColor: colors.iconBg,
            borderRadius: 999,
            paddingVertical: 10,
          }}
        >
          <Icon name="check" size={15} color={colors.mint} />
          <Text style={{ color: colors.mint, fontFamily: fonts.medium, fontSize: 13 }}>Logged to July</Text>
        </View>
      )}
    </View>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  if (m.type === 'ai') {
    return (
      <FadeIn>
        <View
          style={{
            alignSelf: 'flex-start',
            maxWidth: '84%',
            backgroundColor: colors.bubbleAi,
            padding: 11,
            paddingHorizontal: 15,
            borderRadius: 20,
            borderTopLeftRadius: 6,
          }}
        >
          <Text style={{ fontSize: 14.5, lineHeight: 21, color: '#E7E7EA' }}>{m.text}</Text>
        </View>
      </FadeIn>
    );
  }
  if (m.type === 'user') {
    return (
      <FadeIn style={{ alignItems: 'flex-end' }}>
        <View
          style={{
            maxWidth: '78%',
            backgroundColor: colors.bubbleUser,
            padding: 11,
            paddingHorizontal: 15,
            borderRadius: 20,
            borderTopRightRadius: 6,
          }}
        >
          <Text style={{ fontSize: 14.5, lineHeight: 21, color: colors.bubbleUserText, fontFamily: fonts.medium }}>{m.text}</Text>
        </View>
      </FadeIn>
    );
  }
  if (m.type === 'voice') {
    return (
      <FadeIn style={{ alignItems: 'flex-end' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.bubbleUser,
            padding: 11,
            paddingHorizontal: 15,
            borderRadius: 20,
            borderTopRightRadius: 6,
          }}
        >
          <Icon name="mic" size={16} color={colors.bubbleUserText} />
          <Wave animated={false} color={colors.bubbleUserText} n={18} />
          <Text style={{ fontFamily: fonts.mono, fontSize: 11.5, color: 'rgba(16,16,19,.6)' }}>{m.dur}</Text>
        </View>
      </FadeIn>
    );
  }
  if (m.type === 'receipt') {
    return (
      <FadeIn style={{ alignItems: 'flex-end', gap: 5 }}>
        <View style={{ width: 100, height: 128, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }}>
          <Paper seed={1} />
        </View>
        <Text style={{ fontSize: 10.5, color: colors.textDim40 }}>factura_0717.jpg</Text>
      </FadeIn>
    );
  }
  if (m.type === 'scanning') {
    return (
      <FadeIn>
        <LinearGradient
          colors={GRAD}
          locations={GRAD_LOCATIONS}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: -0.1 }}
          style={{ alignSelf: 'flex-start', borderRadius: 21, borderTopLeftRadius: 7, padding: 1 }}
        >
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, borderTopLeftRadius: 6, padding: 12 }}>
            <View style={{ position: 'relative', width: 62, height: 80, borderRadius: 9, overflow: 'hidden' }}>
              <Paper seed={1} />
              <Laser />
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="spark" size={14} color="#FFFFFF" />
                <Text style={{ fontSize: 13.5, fontFamily: fonts.bold, color: '#F5F5F7' }}>Reading your factura</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: colors.textDim50 }}>Pulling merchant, total & VAT…</Text>
              <Dots />
            </View>
          </View>
        </LinearGradient>
      </FadeIn>
    );
  }
  if (m.type === 'thinking') {
    return (
      <FadeIn>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: colors.bubbleAi,
            paddingVertical: 15,
            paddingHorizontal: 18,
            borderRadius: 20,
            borderTopLeftRadius: 6,
          }}
        >
          <Dots />
        </View>
      </FadeIn>
    );
  }
  if (m.type === 'error') {
    return (
      <FadeIn>
        <View
          style={{
            alignSelf: 'flex-start',
            maxWidth: '84%',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 9,
            backgroundColor: colors.bubbleAi,
            borderWidth: 1,
            borderColor: 'rgba(248,113,113,.35)',
            padding: 11,
            paddingHorizontal: 15,
            borderRadius: 20,
            borderTopLeftRadius: 6,
          }}
        >
          <Icon name="warn" size={15} color={colors.rose} />
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.rose }}>{m.text}</Text>
        </View>
      </FadeIn>
    );
  }
  return (
    <FadeIn>
      <CardMessage m={m} />
    </FadeIn>
  );
}

export function ChatScreen() {
  const store = useSpendOwl();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  // BottomNav stays mounted (still reserving its own space) even though the
  // keyboard visually covers it, so only the portion of the keyboard taller
  // than BottomNav actually needs compensating here. A little extra breathing
  // room keeps the input from sitting flush against the keyboard's top edge.
  const bottomPadding = keyboardHeight > 0 ? Math.max(keyboardHeight - store.bottomNavHeight, 0) + 12 : 0;

  const hasContent = store.input.trim().length > 0 || store.attachment;

  return (
    <View style={{ flex: 1, paddingBottom: bottomPadding }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 14, paddingTop: 8, gap: 10 }}
      >
        {store.messages.map(m => (
          <MessageBubble key={m.id} m={m} />
        ))}
      </ScrollView>

      {store.attachment && (
        <FadeIn style={{ paddingHorizontal: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ width: 62, height: 78, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' }}>
            <Paper seed={1} />
            <Pressable
              onPress={store.removeAttachment}
              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(5,5,6,.85)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={11} color={colors.text} />
            </Pressable>
          </View>
          <Text style={{ marginLeft: 10, marginBottom: 4, fontSize: 11, color: colors.textDim45 }}>factura_0717.jpg · ready to send</Text>
        </FadeIn>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, paddingBottom: 10 }}>
        {!store.recording ? (
          <>
            {/* Attaching a factura is the only way one gets filed, so it goes
                with the vault while facturas are parked. See FACTURAS_ENABLED
                in src/store/constants.ts. */}
            {FACTURAS_ENABLED && (
              <Pressable onPress={store.attach} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bubbleAi, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cam" size={20} color="rgba(245,245,247,.75)" />
              </Pressable>
            )}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.input,
                borderRadius: 999,
                paddingLeft: 16,
                paddingRight: 6,
                minHeight: 44,
              }}
            >
              <TextInput
                value={store.input}
                onChangeText={store.setInput}
                placeholder="Message your coach…"
                placeholderTextColor="rgba(245,245,247,.35)"
                onSubmitEditing={store.send}
                style={{ flex: 1, color: colors.text, fontSize: 14.5 }}
              />
              <Pressable
                onPress={store.send}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hasContent ? '#F2F2F4' : 'transparent',
                }}
              >
                <Icon name="send" size={16} color={hasContent ? '#0A0A0B' : 'rgba(245,245,247,.3)'} />
              </Pressable>
            </View>
            <Pressable onPress={store.startRec}>
              <LinearGradient
                colors={GRAD}
                locations={GRAD_LOCATIONS}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="mic" size={21} color="#0A0A0B" />
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => store.endRec(false)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bubbleAi, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={18} color="rgba(245,245,247,.7)" />
            </Pressable>
            <LinearGradient
              colors={GRAD}
              locations={GRAD_LOCATIONS}
              start={{ x: 0, y: 0.1 }}
              end={{ x: 1, y: -0.1 }}
              style={{ flex: 1, borderRadius: 999, padding: 1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#101012', borderRadius: 999, paddingHorizontal: 15, minHeight: 42 }}>
                <PulseDot color={colors.rose} />
                <View style={{ flex: 1, overflow: 'hidden' }}>
                  <Wave animated color="#F5F5F7" n={28} />
                </View>
                <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: '#F5F5F7' }}>0:{String(store.recSecs).padStart(2, '0')}</Text>
              </View>
            </LinearGradient>
            <Pressable
              onPress={() => store.endRec(true)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F2F4', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="check" size={21} color="#0A0A0B" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
