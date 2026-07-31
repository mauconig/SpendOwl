import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

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
  /**
   * For sheets holding a form. Caps the sheet at the space the keyboard leaves
   * and scrolls the body, so a tall form loses nothing off the top instead of
   * being clipped. Put the body's own padding and gap in `bodyStyle`, not
   * `contentStyle` — padding on the clipped container would not scroll with it.
   */
  scrollable?: boolean;
  /** Padding and gap for the scrolling body. Only used with `scrollable`. */
  bodyStyle?: ViewStyle;
};

export function ModalShell({
  visible,
  onClose,
  children,
  variant = 'sheet',
  blur = false,
  contentStyle,
  scrollable = false,
  bodyStyle,
}: Props) {
  const { height } = useWindowDimensions();
  // A bottom sheet rests against the bottom edge, which is exactly where the
  // keyboard appears — so typing into one hides the field being typed into.
  //
  // Nothing does this for us. On Android a Modal renders in its own window,
  // which the system does not resize for the keyboard the way it resizes the
  // activity, so adjustResize never reaches these. Reserving the keyboard's
  // height at the bottom lifts the sheet clear of it, the same approach
  // AuthScreen and ChatScreen already take.
  const keyboardHeight = useKeyboardHeight();
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
      <View
        style={{
          flex: 1,
          justifyContent: variant === 'sheet' ? 'flex-end' : 'center',
          paddingBottom: keyboardHeight,
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]} pointerEvents="none">
          {blur ? (
            <BlurView intensity={30} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,5,8,.5)' }]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,5,8,.6)' }]} />
          )}
        </Animated.View>

        {/* Dismiss area, and the two variants genuinely need different ones.
            A sheet gets a flex sibling filling only the gap above it: nothing
            then sits over the sheet's scroll axes, which is what made
            TransactionsSheet scrollable in the first place. A centred dialog
            has no such gap, so its backdrop covers the screen and the content
            claims its own touches below — an inert View would let a tap on the
            card's padding fall through and dismiss it. */}
        {variant === 'sheet' ? (
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        )}

        <Animated.View
          // Children are offered the touch first, so buttons and inputs inside
          // still work; this only catches what they don't.
          onStartShouldSetResponder={variant === 'center' ? () => true : undefined}
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
            // Leaves a strip of backdrop above a full-height sheet, so it still
            // reads as a sheet over the app rather than a new screen.
            scrollable ? { maxHeight: height - keyboardHeight - 48 } : null,
            { transform: [{ translateY }], opacity: contentOpacity },
          ]}
        >
          {scrollable ? (
            <ScrollView
              // flexShrink lets it give way to the maxHeight above rather than
              // growing to its content and overflowing the sheet.
              style={{ flexShrink: 1 }}
              contentContainerStyle={bodyStyle}
              // Without this the first tap on a field only dismisses the
              // keyboard, so moving between inputs takes two taps.
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
