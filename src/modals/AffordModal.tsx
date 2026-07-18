import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SlideUp } from '../components/FadeIn';
import { colors, fonts } from '../theme';
import { AFFORD_OPTS, SAVINGS_TODAY, useSpendOwl } from '../store/SpendOwlContext';

export function AffordModal() {
  const store = useSpendOwl();
  const opt = AFFORD_OPTS[store.affordSel];
  const after = SAVINGS_TODAY - opt.v;

  const verdict =
    after > 1500
      ? { t: 'Yes — comfortably within your buffer.', c: colors.mint, bg: 'rgba(77,240,184,.08)', bd: 'rgba(77,240,184,.35)' }
      : after > 500
        ? { t: 'Yes, but it’ll be tight this month.', c: colors.amberText, bg: 'rgba(255,196,107,.08)', bd: 'rgba(255,196,107,.35)' }
        : { t: 'I’d wait — this cuts deep into your buffer.', c: colors.rose, bg: 'rgba(255,143,163,.08)', bd: 'rgba(255,143,163,.35)' };

  return (
    <Modal visible={store.affordOpen} transparent animationType="fade" onRequestClose={store.closeAfford}>
      <Pressable onPress={store.closeAfford} style={{ flex: 1 }}>
        <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(4,5,8,.5)' }}>
          <Pressable onPress={e => e.stopPropagation()} style={{ width: '100%' }}>
            <SlideUp
              style={{
                width: '100%',
                backgroundColor: colors.sheet,
                borderWidth: 1,
                borderColor: colors.sheetBorder,
                borderRadius: 24,
                padding: 20,
                gap: 16,
              }}
            >
              <View>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>Can I afford this?</Text>
                <Text style={{ fontSize: 12.5, color: colors.textDim55, marginTop: 3 }}>Sandbox a purchase before you commit.</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {AFFORD_OPTS.map((o, i) => {
                  const active = store.affordSel === i;
                  return (
                    <Pressable
                      key={o.label}
                      onPress={() => store.setAffordSel(i)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 8,
                        paddingHorizontal: 4,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: active ? 'rgba(157,140,255,.6)' : 'rgba(255,255,255,.1)',
                        backgroundColor: active ? 'rgba(157,140,255,.16)' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontFamily: fonts.medium, color: active ? colors.violetText : colors.textDim60 }}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ gap: 14 }}>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textDim65 }}>Savings today</Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.mint }}>€{SAVINGS_TODAY.toLocaleString('en-US')}</Text>
                  </View>
                  <View style={{ height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                    <LinearGradient colors={[colors.mintDeep, colors.mint]} style={{ height: '100%', width: '100%', borderRadius: 999 }} />
                  </View>
                </View>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textDim65 }}>After purchase</Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.violetLight }}>€{after.toLocaleString('en-US')}</Text>
                  </View>
                  <View style={{ height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                    <LinearGradient
                      colors={['#8B7CF6', '#B7A8FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ height: '100%', width: `${Math.max((after / SAVINGS_TODAY) * 100, 3)}%`, borderRadius: 999 }}
                    />
                  </View>
                </View>
              </View>

              <View style={{ alignItems: 'center', backgroundColor: verdict.bg, borderWidth: 1, borderColor: verdict.bd, borderRadius: 12, padding: 10, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: verdict.c, textAlign: 'center' }}>{verdict.t}</Text>
              </View>

              <Pressable
                onPress={store.closeAfford}
                style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' }}
              >
                <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.textDim75 }}>Done</Text>
              </Pressable>
            </SlideUp>
          </Pressable>
        </BlurView>
      </Pressable>
    </Modal>
  );
}
