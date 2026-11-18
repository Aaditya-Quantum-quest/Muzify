
import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import PagerView from "react-native-pager-view";

import {
  createStandardRouterNavigator,
  createBaseTabProps,
  TabRouter,
  unstable_useReconcileTabHistory,
} from "expo-router";

function SwipeNavigator({
  state,
  descriptors,
  actions,
  routeNames,
  preload,
}) {
  unstable_useReconcileTabHistory();

  const pagerRef = useRef(null);
  const didPreload = useRef(false);

  // Preload all swipeable screens.
  useEffect(() => {
    if (didPreload.current) return;

    routeNames
      .filter((name) => name !== "Player")
      .forEach((name) => preload(name));

    didPreload.current = true;
  }, [routeNames, preload]);

  // Keep the registered screen order.
  const routes = routeNames
    .filter((name) => name !== "Player")
    .map((name) =>
      state.routes.find((route) => route.name === name)
    )
    .filter(Boolean);

  const activeRoute = state.routes[state.index];

  const activePage = Math.max(
    0,
    routes.findIndex(
      (route) => route.key === activeRoute?.key
    )
  );

  // Sync pager with router navigation.
  useEffect(() => {
    pagerRef.current?.setPage(activePage);
  }, [activePage]);

  const navigateToPage = (route) => {
    if (route && route.key !== activeRoute?.key) {
      actions.navigate(route.name);
    }
  };

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={activePage}
        offscreenPageLimit={4}
        overScrollMode="never"
        onPageSelected={(event) => {
          const route = routes[event.nativeEvent.position];
          navigateToPage(route);
        }}
      >
        {routes.map((route) => (
          <View key={route.key} style={styles.page}>
            {descriptors[route.key].render()}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

const SwipeTabs = createStandardRouterNavigator(
  SwipeNavigator,
  TabRouter,
  {
    createProps: createBaseTabProps,
  }
);

export default function TabsLayout() {
  return (
    <SwipeTabs>
      <SwipeTabs.Screen name="home" />
      <SwipeTabs.Screen name="library" />
      <SwipeTabs.Screen name="settings" />
      <SwipeTabs.Screen name="statistics" />

      <SwipeTabs.Screen
        name="Player"
        options={{ href: null }}
      />
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0e",
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
