import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../icons';
import { colors, fonts } from '../theme';
import { useSpendOwl } from '../store/SpendOwlContext';

type TabId = 'chat' | 'dashboard' | 'vault' | 'settings';

export function BottomNav() {
  const store = useSpendOwl();
  const insets = useSafeAreaInsets();
  const active: TabId = store.nav === 'pager' ? (store.page === 0 ? 'chat' : 'dashboard') : store.nav;

  const items: { id: TabId; label: string; icon: IconName; onTap: () => void }[] = [
    { id: 'chat', label: 'Chat', icon: 'chat', onTap: () => { store.setNav('pager'); store.setPage(0); } },
    { id: 'dashboard', label: 'Dashboard', icon: 'pie', onTap: () => { store.setNav('pager'); store.setPage(1); } },
    { id: 'vault', label: 'Vault', icon: 'folder', onTap: () => store.setNav('vault') },
    { id: 'settings', label: 'Settings', icon: 'gear', onTap: () => store.setNav('settings') },
  ];

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.navBg,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,.08)',
          paddingHorizontal: 8,
          paddingVertical: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 16,
          elevation: Platform.OS === 'android' ? 12 : 0,
        }}
      >
        {items.map(n => {
          const isActive = active === n.id;
          return (
            <Pressable key={n.id} onPress={n.onTap} style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 }}>
              <View
                style={{
                  width: 58,
                  height: 30,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? 'rgba(77,240,184,.14)' : 'transparent',
                }}
              >
                <Icon name={n.icon} size={22} color={isActive ? colors.mint : colors.textDim50} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: isActive ? fonts.bold : fonts.regular, color: isActive ? colors.mint : colors.textDim50 }}>
                {n.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
