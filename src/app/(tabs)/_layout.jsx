
import { useEffect, useRef, useState } from "react";
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
}) {
  unstable_useReconcileTabHistory();

  const pagerRef = useRef(null);
  const [visitedRoutes, setVisitedRoutes] = useState(() => new Set());

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
  const activePageKey = routes[activePage]?.key;

  useEffect(() => {
    if (!activePageKey) return;
    setVisitedRoutes((current) =>
      current.has(activePageKey)
        ? current
        : new Set(current).add(activePageKey)
    );
  }, [activePageKey]);

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
        offscreenPageLimit={1}
        overScrollMode="never"
        onPageSelected={(event) => {
          const route = routes[event.nativeEvent.position];
          navigateToPage(route);
        }}
      >
        {routes.map((route) => (
          <View key={route.key} style={styles.page}>
            {visitedRoutes.has(route.key) || route.key === activePageKey
              ? descriptors[route.key].render()
              : null}
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
