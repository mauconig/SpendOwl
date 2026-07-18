import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

function Dot({ delay }: { delay: number }) {
  const o = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 600, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.2, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, o]);

  return <Animated.View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4DF0B8', opacity: o }} />;
}

export function Dots() {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      <Dot delay={0} />
      <Dot delay={200} />
      <Dot delay={400} />
    </View>
  );
}
