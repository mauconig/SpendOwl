import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

const HS = [30, 55, 40, 75, 60, 90, 50, 70, 35, 80, 55, 95, 45, 65, 85, 40, 70, 50, 60, 35, 75, 55, 45, 65, 38, 72, 52, 88];

function Bar({ height, color, animated, delay, duration }: { height: number; color: string; animated: boolean; delay: number; duration: number }) {
  const scale = useRef(new Animated.Value(animated ? 0.3 : 1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: duration * 500, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.3, duration: duration * 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, delay, duration, scale]);

  return (
    <Animated.View
      style={{
        width: 3,
        height: Math.round(height * 0.26),
        borderRadius: 2,
        backgroundColor: color,
        flexShrink: 0,
        transform: [{ scaleY: scale }],
      }}
    />
  );
}

export function Wave({ animated, color, n }: { animated: boolean; color: string; n: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 26, overflow: 'hidden' }}>
      {HS.slice(0, n).map((h, i) => (
        <Bar key={i} height={h} color={color} animated={animated} delay={i * 60} duration={0.7 + (i % 4) * 0.15} />
      ))}
    </View>
  );
}
