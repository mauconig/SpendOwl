import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../icons';
import { colors } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

type TabId = 'home' | 'dashboard' | 'vault' | 'settings';

export function BottomNav() {
  const store = useSpendOwl();
  const insets = useSafeAreaInsets();
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
    <View style={{ paddingHorizontal: 10, paddingTop: 2, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.navBg }}>
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
            <Pressable key={n.id} onPress={n.onTap} style={{ flex: 1, alignItems: 'center', paddingVertical: 15 }}>
              <Icon name={n.icon} size={22} color={active === n.id ? '#FFFFFF' : colors.textDim40} />
            </Pressable>
          ))}
          <View style={{ width: 68, flexShrink: 0 }} />
          {navRight.map(n => (
            <Pressable key={n.id} onPress={n.onTap} style={{ flex: 1, alignItems: 'center', paddingVertical: 15 }}>
              <Icon name={n.icon} size={22} color={active === n.id ? '#FFFFFF' : colors.textDim40} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={store.toggleChat} style={{ position: 'absolute', left: '50%', top: -22, marginLeft: -28 }}>
          <LinearGradient
            colors={['#FFFFFF', '#CADEF7', '#78ADEE', '#F0A878']}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 5,
              borderColor: '#050506',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.55,
              shadowRadius: 22,
              elevation: Platform.OS === 'android' ? 12 : 0,
            }}
          >
            <Icon name="spark" size={26} color="#0A0A0B" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
