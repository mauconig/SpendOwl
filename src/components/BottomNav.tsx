import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../icons';
import { colors } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

type TabId = 'home' | 'dashboard' | 'vault' | 'settings';

// The center button used to float half above the bar at 56px — visually a big
// orb bursting out the top next to small bare icons. Shrunk and sat fully
// inside the bar instead, vertically centered against BAR_HEIGHT (the height
// the side buttons' fixed boxes give the row) rather than overflowing it.
const CENTER_SIZE = 48;
const BAR_HEIGHT = 56;
const CENTER_TOP = (BAR_HEIGHT - CENTER_SIZE) / 2;

export function BottomNav() {
  const store = useSpendOwl();
  const insets = useSafeAreaInsets();

  // A single 0->1 run driving both a scale "pop" (overshoots past 1 before
  // settling — a plain 1->1 tween reads as sluggish, not springy) and a full
  // spin on the icon. One driver rather than two Animated.Values keeps them
  // perfectly in sync and means a rapid second tap can only ever restart the
  // same run, never leave two independent animations racing each other.
  const press = useRef(new Animated.Value(0)).current;
  const playPress = () => {
    press.setValue(0);
    Animated.timing(press, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const centerScale = press.interpolate({ inputRange: [0, 0.35, 0.65, 1], outputRange: [1, 0.82, 1.12, 1] });
  const centerSpin = press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // The button's gradient swirls continuously while the chat is open — a
  // separate, ambient rotation from the one-shot pop above. It runs only in
  // chat because it is meant to read as "this is where the coach lives," not
  // as generic chrome decoration that never turns off.
  //
  // 0->360 is looped rather than reset, which is what makes it seamless: those
  // two angles are visually identical, so the wrap point is invisible. Leaving
  // chat stops the loop and snaps back to 0deg — the same neutral pose the
  // button has always had everywhere else — rather than freezing wherever the
  // rotation happened to be.
  const ambientSpinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (store.nav !== 'chat') {
      ambientSpinValue.stopAnimation(() => ambientSpinValue.setValue(0));
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ambientSpinValue, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [store.nav, ambientSpinValue]);
  const ambientSpin = ambientSpinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const active: TabId | null =
    store.nav === 'pager' ? (store.page === 0 ? 'home' : 'dashboard') : store.nav === 'vault' || store.nav === 'settings' ? store.nav : null;

  const navLeft: { id: TabId; icon: IconName; onTap: () => void }[] = [
    { id: 'home', icon: 'home', onTap: () => { store.setNav('pager'); store.setPage(0); } },
    { id: 'dashboard', icon: 'bars', onTap: store.goDash },
  ];
  const navRight: { id: TabId; icon: IconName; onTap: () => void }[] = [
    { id: 'vault', icon: 'folder', onTap: () => store.setNav('vault') },
    { id: 'settings', icon: 'person', onTap: () => store.setNav('settings') },
  ];

  return (
    <View
      onLayout={e => store.setBottomNavHeight(e.nativeEvent.layout.height)}
      style={{ paddingHorizontal: 10, paddingTop: 2, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.navBg }}
    >
      <View style={{ position: 'relative' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.navBg,
            borderTopWidth: 1,
            borderTopColor: colors.navBorder,
          }}
        >
          {navLeft.map(n => (
            <Pressable key={n.id} onPress={n.onTap} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {/* A full BAR_HEIGHT tap target, not just an icon dropped
                  into whatever space padding left. */}
              <View style={{ width: BAR_HEIGHT, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={n.icon} size={22} color={active === n.id ? '#FFFFFF' : colors.textDim40} />
              </View>
            </Pressable>
          ))}
          <View style={{ width: 68, flexShrink: 0 }} />
          {navRight.map(n => (
            <Pressable key={n.id} onPress={n.onTap} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {/* A full BAR_HEIGHT tap target, not just an icon dropped
                  into whatever space padding left. */}
              <View style={{ width: BAR_HEIGHT, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={n.icon} size={22} color={active === n.id ? '#FFFFFF' : colors.textDim40} />
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => {
            playPress();
            store.toggleChat();
          }}
          style={{ position: 'absolute', left: '50%', top: CENTER_TOP, marginLeft: -CENTER_SIZE / 2 }}
        >
          {/* Shadow lives on this outer layer, deliberately not the one below
              that sets overflow:hidden — iOS clips a shadow to nothing if it
              and the mask that clips its content share a view. */}
          <Animated.View
            style={{
              transform: [{ scale: centerScale }, { rotate: centerSpin }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.5,
              shadowRadius: 14,
              elevation: Platform.OS === 'android' ? 8 : 0,
            }}
          >
            <View
              style={{
                width: CENTER_SIZE,
                height: CENTER_SIZE,
                borderRadius: CENTER_SIZE / 2,
                borderWidth: 4,
                borderColor: '#050506',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Oversized relative to the circle it's clipped into, and
                  centered on it, so that at every rotation angle its edges
                  stay well outside the circle — no corner of the square ever
                  peeks through the mask. */}
              <Animated.View
                style={{
                  position: 'absolute',
                  width: CENTER_SIZE * 2,
                  height: CENTER_SIZE * 2,
                  top: -CENTER_SIZE / 2,
                  left: -CENTER_SIZE / 2,
                  transform: [{ rotate: ambientSpin }],
                }}
              >
                <LinearGradient
                  colors={['#FFFFFF', '#CADEF7', '#78ADEE', '#F0A878']}
                  start={{ x: 0.3, y: 0.2 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: CENTER_SIZE * 2, height: CENTER_SIZE * 2 }}
                />
              </Animated.View>
              <Icon name="spark" size={22} color="#0A0A0B" />
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}
