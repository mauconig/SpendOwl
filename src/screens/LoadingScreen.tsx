import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { colors, fonts } from '../theme';

/**
 * The app used to render instantly from in-memory fixtures. Now that the first
 * paint waits on the API, both of these states are reachable — and the error
 * one is the state a developer hits when the server isn't running.
 */

/**
 * One pulsing placeholder. The animation is shared by every block from a single
 * driver in LoadingScreen, so thirty of these do not mean thirty timers running
 * slightly out of step with each other.
 */
function Block({
  w,
  h,
  radius = 8,
  pulse,
  style,
}: {
  w: number | `${number}%`;
  h: number;
  radius?: number;
  pulse: Animated.AnimatedInterpolation<number>;
  style?: object;
}) {
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: radius, backgroundColor: colors.input, opacity: pulse }, style]}
    />
  );
}

export function LoadingScreen() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  // Never fully transparent: a placeholder that blinks out reads as content
  // that failed to load rather than content on its way.
  const pulse = anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    // Mirrors the Dashboard's real layout — hero figure, progress bar, donut
    // with its legend, then the transaction list — so the first paint does not
    // move everything the moment the data lands.
    <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 18, gap: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Block w={104} h={13} pulse={pulse} />
        <Block w={34} h={34} radius={17} pulse={pulse} />
      </View>

      <View style={{ gap: 12 }}>
        <Block w={96} h={11} pulse={pulse} />
        <Block w="72%" h={40} radius={12} pulse={pulse} />
        <Block w="100%" h={8} radius={4} pulse={pulse} />
        <Block w={148} h={11} pulse={pulse} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 4 }}>
        <Block w={124} h={124} radius={62} pulse={pulse} />
        <View style={{ flex: 1, gap: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Block w={9} h={9} radius={5} pulse={pulse} />
              <Block w={`${58 - i * 7}%`} h={10} pulse={pulse} />
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 14, marginTop: 2 }}>
        <Block w={82} h={11} pulse={pulse} />
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Block w={34} h={34} radius={11} pulse={pulse} />
            <View style={{ flex: 1, gap: 7 }}>
              <Block w={`${64 - i * 6}%`} h={11} pulse={pulse} />
              <Block w={`${34 - i * 3}%`} h={9} pulse={pulse} />
            </View>
            <Block w={58} h={13} pulse={pulse} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.text }}>Can’t load your data</Text>
      <Text style={{ fontSize: 13, color: colors.textDim55, textAlign: 'center', lineHeight: 19 }}>{message}</Text>
      <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim30, textAlign: 'center' }}>
        {API_BASE_URL}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{ backgroundColor: '#F2F2F4', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginTop: 6 }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: '#0A0A0B' }}>Try again</Text>
      </Pressable>
    </View>
  );
}
