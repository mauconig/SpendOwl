import React, { useEffect, useRef } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { AddCardSheet } from './modals/AddCardSheet';
import { AffordModal } from './modals/AffordModal';
import { CardPayoffModal } from './modals/CardPayoffModal';
import { InvoiceDetail } from './modals/InvoiceDetail';
import { SubscriptionsSheet } from './modals/SubscriptionsSheet';
import { ChatScreen } from './screens/ChatScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { VaultScreen } from './screens/VaultScreen';
import { useSpendOwl } from './store/SpendOwlContext';
import { colors } from './theme';

export function RootScreen() {
  const store = useSpendOwl();
  const scrollRef = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  useEffect(() => {
    if (store.nav === 'pager') {
      scrollRef.current?.scrollTo({ x: store.page * width, animated: true });
    }
  }, [store.page, store.nav, width]);

  const onMomentumEnd = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(ev.nativeEvent.contentOffset.x / width) as 0 | 1;
    if (page !== store.page) store.setPage(page);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screenBg }}>
      <Header />
      <View style={{ flex: 1 }}>
        {store.nav === 'pager' && (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            contentOffset={{ x: store.page * width, y: 0 }}
          >
            <View style={{ width, flex: 1 }}>
              <HomeScreen />
            </View>
            <View style={{ width, flex: 1 }}>
              <DashboardScreen />
            </View>
          </ScrollView>
        )}
        {store.nav === 'chat' && <ChatScreen />}
        {store.nav === 'vault' && <VaultScreen />}
        {store.nav === 'settings' && <SettingsScreen />}
      </View>
      <BottomNav />

      <AffordModal />
      <SubscriptionsSheet />
      <InvoiceDetail />
      <AddCardSheet />
      <CardPayoffModal />
    </View>
  );
}
