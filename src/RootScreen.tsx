import React, { useEffect, useRef } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { BottomNav } from './components/BottomNav';
import { AddCardSheet } from './modals/AddCardSheet';
import { AffordModal } from './modals/AffordModal';
import { CardPayoffModal } from './modals/CardPayoffModal';
import { InvoiceDetail } from './modals/InvoiceDetail';
import { SubscriptionsSheet } from './modals/SubscriptionsSheet';
import { TransactionDetail } from './modals/TransactionDetail';
import { TransactionsSheet } from './modals/TransactionsSheet';
import { ChatScreen } from './screens/ChatScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { VaultScreen } from './screens/VaultScreen';
import { useSpendOwl, Nav } from './store/SpendOwlContext';
import { colors } from './theme';

// Every destination reachable from BottomNav lives on this single horizontal
// pager, in the same left-to-right order as the nav icons (home, dashboard,
// chat, vault, settings), so every switch — tap or swipe — animates through
// the exact same ScrollView transition.
const NON_PAGER_ORDER: Exclude<Nav, 'pager'>[] = ['chat', 'vault', 'settings'];

function pageIndexFor(nav: Nav, page: 0 | 1): number {
  if (nav === 'pager') return page;
  return 2 + NON_PAGER_ORDER.indexOf(nav);
}

export function RootScreen() {
  const store = useSpendOwl();
  const scrollRef = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;
  const pageIndex = pageIndexFor(store.nav, store.page);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: pageIndex * width, animated: true });
  }, [pageIndex, width]);

  const onMomentumEnd = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(ev.nativeEvent.contentOffset.x / width);
    if (idx === pageIndex) return;
    if (idx === 0) {
      store.setNav('pager');
      store.setPage(0);
    } else if (idx === 1) {
      store.setNav('pager');
      store.setPage(1);
    } else {
      store.setNav(NON_PAGER_ORDER[idx - 2]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screenBg }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          contentOffset={{ x: pageIndex * width, y: 0 }}
        >
          <View style={{ width, flex: 1 }}>
            <HomeScreen />
          </View>
          <View style={{ width, flex: 1 }}>
            <DashboardScreen />
          </View>
          <View style={{ width, flex: 1 }}>
            <ChatScreen />
          </View>
          <View style={{ width, flex: 1 }}>
            <VaultScreen />
          </View>
          <View style={{ width, flex: 1 }}>
            <SettingsScreen />
          </View>
        </ScrollView>
      </View>
      <BottomNav />

      <AffordModal />
      <SubscriptionsSheet />
      <TransactionsSheet />
      <TransactionDetail source="dash" />
      <InvoiceDetail />
      <AddCardSheet />
      <CardPayoffModal />
    </View>
  );
}
