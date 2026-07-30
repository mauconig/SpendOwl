import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';

export function FadeIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
