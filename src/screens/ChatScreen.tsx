import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Badge } from '../components/Badge';
import { FadeIn } from '../components/FadeIn';
import { Laser } from '../components/Laser';
import { Dots } from '../components/Dots';
import { Paper } from '../components/Paper';
import { PulseDot } from '../components/PulseDot';
import { Toggle } from '../components/Toggle';
import { Wave } from '../components/Wave';
import { Icon } from '../icons';
import { CATS, CatKey, colors, fonts, moneyFont } from '../theme';
import { Msg } from '../store/mockData';
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
        backgroundColor: '#181C25',
        borderWidth: 1,
        borderColor: 'rgba(157,140,255,.28)',
        borderRadius: 16,
        borderTopLeftRadius: 6,
        padding: 14,
        paddingTop: 14,
        paddingBottom: 12,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
        <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.2, color: colors.textDim55 }}>{cat.name.toUpperCase()}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 15.5, fontFamily: fonts.bold, color: '#F2F5FA' }}>{m.merchant}</Text>
          <Text style={{ fontSize: 12, color: colors.textDim50, marginTop: 2 }}>{m.note}</Text>
        </View>
        <Text style={{ fontSize: 26, fontFamily: moneyFont(store.baseCur, 'bold'), color: colors.violetLight }}>{store.fmt(store.baseCur, m.eur, m.usd, m.pyg)}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: colors.hairline }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, color: colors.textDim75 }}>Business expense</Text>
        <Toggle on={card.tax} onToggle={() => store.setCard(m.id, { tax: !card.tax })} />
      </View>
      {!card.ok ? (
        <Pressable onPress={() => store.setCard(m.id, { ok: true })}>
          <LinearGradient
            colors={[colors.mintDeep, colors.mint]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ marginTop: 2, borderRadius: 999, paddingVertical: 10, alignItems: 'center' }}
          >
            <Text style={{ color: colors.mintDark, fontFamily: fonts.bold, fontSize: 13.5 }}>Approve & log</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <View
          style={{
            marginTop: 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: 'rgba(77,240,184,.4)',
            borderRadius: 999,
            paddingVertical: 9,
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
            borderWidth: 1,
            borderColor: colors.bubbleAiBorder,
            padding: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderTopLeftRadius: 6,
          }}
        >
          <Text style={{ fontSize: 14.5, lineHeight: 21, color: '#DDE3EA' }}>{m.text}</Text>
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
            borderWidth: 1,
            borderColor: colors.bubbleUserBorder,
            padding: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderTopRightRadius: 6,
          }}
        >
          <Text style={{ fontSize: 14.5, lineHeight: 21, color: '#EAFFF7' }}>{m.text}</Text>
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
            borderWidth: 1,
            borderColor: colors.bubbleUserBorder,
            padding: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderTopRightRadius: 6,
          }}
        >
          <Icon name="mic" size={16} color={colors.mintText} />
          <Wave animated={false} color={colors.mintText} n={18} />
          <Text style={{ fontFamily: fonts.mono, fontSize: 11.5, color: colors.textDim70 }}>{m.dur}</Text>
        </View>
      </FadeIn>
    );
  }
  if (m.type === 'receipt') {
    return (
      <FadeIn style={{ alignItems: 'flex-end', gap: 5 }}>
        <View style={{ width: 100, height: 128, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }}>
          <Paper seed={1} />
        </View>
        <Text style={{ fontSize: 10.5, color: colors.textDim45, fontFamily: fonts.mono }}>factura_0717.jpg</Text>
      </FadeIn>
    );
  }
  if (m.type === 'scanning') {
    return (
      <FadeIn>
        <View
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            backgroundColor: colors.bubbleAi,
            borderWidth: 1,
            borderColor: 'rgba(77,240,184,.28)',
            borderRadius: 18,
            borderTopLeftRadius: 6,
            padding: 12,
          }}
        >
          <View style={{ position: 'relative', width: 62, height: 80, borderRadius: 8, overflow: 'hidden' }}>
            <Paper seed={1} />
            <Laser />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13.5, fontFamily: fonts.medium, color: colors.mintText2 }}>Reading your factura</Text>
            <Text style={{ fontSize: 11.5, color: colors.textDim50 }}>Pulling merchant, total & VAT…</Text>
            <Dots />
          </View>
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

  const hasContent = store.input.trim().length > 0 || store.attachment;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 14, paddingTop: 8, gap: 10 }}
      >
        {store.messages.map(m => (
          <MessageBubble key={m.id} m={m} />
        ))}
      </ScrollView>

      {store.attachment && (
        <FadeIn style={{ paddingHorizontal: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ width: 62, height: 78, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(77,240,184,.4)' }}>
            <Paper seed={1} />
            <Pressable
              onPress={store.removeAttachment}
              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(8,10,13,.85)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={11} color={colors.text} />
            </Pressable>
          </View>
          <Text style={{ marginLeft: 10, marginBottom: 4, fontSize: 11, color: colors.textDim50, fontFamily: fonts.mono }}>
            factura_0717.jpg · ready to send
          </Text>
        </FadeIn>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, paddingBottom: 10 }}>
        {!store.recording ? (
          <>
            <Pressable
              onPress={store.attach}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.input, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="cam" size={20} color="rgba(233,237,242,.75)" />
            </Pressable>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.input,
                borderWidth: 1,
                borderColor: colors.inputBorder,
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
                placeholderTextColor="rgba(233,237,242,.38)"
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
                  backgroundColor: hasContent ? undefined : 'transparent',
                  overflow: 'hidden',
                }}
              >
                {hasContent ? (
                  <LinearGradient colors={['#B7A8FF', '#9D8CFF']} style={{ position: 'absolute', width: 34, height: 34, borderRadius: 17 }} />
                ) : null}
                <Icon name="send" size={16} color={hasContent ? '#0B0D11' : 'rgba(233,237,242,.35)'} />
              </Pressable>
            </View>
            <Pressable onPress={store.startRec}>
              <LinearGradient
                colors={[colors.mintDeep, colors.mint]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="mic" size={21} color={colors.mintDark} />
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => store.endRec(false)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.input, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={18} color="rgba(233,237,242,.7)" />
            </Pressable>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: 'rgba(77,240,184,.09)',
                borderWidth: 1,
                borderColor: 'rgba(77,240,184,.35)',
                borderRadius: 999,
                paddingHorizontal: 16,
                minHeight: 44,
              }}
            >
              <PulseDot color={colors.rose} />
              <View style={{ flex: 1, overflow: 'hidden' }}>
                <Wave animated color={colors.mint} n={28} />
              </View>
              <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mintText2 }}>0:{String(store.recSecs).padStart(2, '0')}</Text>
            </View>
            <Pressable onPress={() => store.endRec(true)}>
              <LinearGradient
                colors={[colors.mintDeep, colors.mint]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="check" size={21} color={colors.mintDark} />
              </LinearGradient>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
