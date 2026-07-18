import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

export function Laser() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 825, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(t, { toValue: 0, duration: 675, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const top = t.interpolate({ inputRange: [0, 1], outputRange: ['3%', '93%'] });

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} pointerEvents="none">
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(77,240,184,.08)' }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: '3%',
          right: '3%',
          top,
          height: 2,
          borderRadius: 2,
          backgroundColor: '#4DF0B8',
          shadowColor: '#4DF0B8',
          shadowOpacity: 0.8,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}
