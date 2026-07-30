import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';

/**
 * The shared chrome behind every overlay: backdrop, tap-to-dismiss, and a slide
 * that runs both ways — up from the bottom edge on open, back down on close.
 *
 * It exists because the closing half is impossible to do at the call site.
 * React Native's `Modal` unmounts its children the instant `visible` goes
 * false, so an exit animation has nothing left to animate — which is exactly
 * why these overlays used to appear with a slide and then simply vanish. The
 * fix is to keep the native Modal mounted a beat longer than the store flag:
 * `mounted` here trails `visible`, and only drops once the exit has finished.
 *
 * `animationType` is 'none' on purpose. RN's own fade would run against this
 * one, and the two together read as a stutter.
 */

const ENTER_MS = 300;
const EXIT_MS = 220;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 'sheet' rests against the bottom edge; 'center' rests in the middle. */
  variant?: 'sheet' | 'center';
  /** Centred dialogs blur what is behind them; bottom sheets only dim it. */
  blur?: boolean;
  /** Applied to the sliding container — the sheet's own background and radii. */
  contentStyle?: ViewStyle;
};

export function ModalShell({ visible, onClose, children, variant = 'sheet', blur = false, contentStyle }: Props) {
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [contentHeight, setContentHeight] = useState(0);

  // How far below its resting place the content starts, measured rather than
  // assumed: travelling a fixed screen-height would make a short sheet appear
  // to fly in from a long way off, at speed.
  //
  // A bottom sheet sits flush with the bottom edge, so its own height puts it
  // just offscreen. A centred dialog rests half a screen higher, so it needs
  // half the screen plus half of itself.
  const travel = variant === 'sheet' ? contentHeight : (height + contentHeight) / 2;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const exit = Animated.timing(anim, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    exit.start(({ finished }) => {
      // Only on a clean finish: an interrupted exit means it was reopened
      // mid-flight, and unmounting then would kill the new entry.
      if (finished) setMounted(false);
    });
    return () => exit.stop();
  }, [visible, mounted, anim]);

  // Deliberately waits for a measurement. Starting from an unknown distance
  // would show the content at its resting place for a frame before it jumped
  // down to begin.
  useEffect(() => {
    if (!visible || travel <= 0) return;
    const enter = Animated.timing(anim, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    enter.start();
    return () => enter.stop();
  }, [visible, travel, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] });
  // Opaque as soon as it starts moving, but invisible at rest — which is what
  // hides that single pre-measurement frame without fading the whole slide.
  const contentOpacity = anim.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: variant === 'sheet' ? 'flex-end' : 'center' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]} pointerEvents="none">
          {blur ? (
            <BlurView intensity={30} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,5,8,.5)' }]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,5,8,.6)' }]} />
          )}
        </Animated.View>

        {/* Dismiss area. A sibling of the content rather than a wrapper around
            it, so no press handler sits between a touch and the scroll axes
            inside — the bug that made TransactionsSheet unscrollable. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          onLayout={e => {
            const measured = e.nativeEvent.layout.height;
            setContentHeight(prev => (Math.abs(prev - measured) > 0.5 ? measured : prev));
          }}
          style={[
            // Margin, not padding: a centred dialog's own contentStyle sets
            // `padding` for its inner spacing, and padding here would be
            // overridden by it, leaving the card flush to the screen edges.
            variant === 'center' ? { marginHorizontal: 20 } : null,
            contentStyle,
            { transform: [{ translateY }], opacity: contentOpacity },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
