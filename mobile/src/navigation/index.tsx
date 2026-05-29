import { Ionicons } from "@expo/vector-icons";
import { DefaultTheme, NavigationContainer, Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import ActivityScreen from "../screens/ActivityScreen";
import AuctionDetailScreen from "../screens/AuctionDetailScreen";
import AuctionsScreen from "../screens/AuctionsScreen";
import BackupScreen from "../screens/BackupScreen";
import ClaimScreen from "../screens/ClaimScreen";
import ExploreScreen from "../screens/ExploreScreen";
import NameDetailScreen from "../screens/NameDetailScreen";
import SetValueScreen from "../screens/SetValueScreen";
import WalletScreen from "../screens/WalletScreen";
import { colors } from "../theme";
import type { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen name="Explore" component={ExploreScreen} options={{ tabBarIcon: tabIcon("search-outline") }} />
      <Tab.Screen name="Auctions" component={AuctionsScreen} options={{ tabBarIcon: tabIcon("hammer-outline") }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ tabBarIcon: tabIcon("pulse-outline") }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ tabBarIcon: tabIcon("wallet-outline") }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <RootStack.Screen name="NameDetail" component={NameDetailScreen} options={{ title: "Name" }} />
        <RootStack.Screen name="AuctionDetail" component={AuctionDetailScreen} options={{ title: "Auction" }} />
        <RootStack.Screen name="Claim" component={ClaimScreen} options={{ title: "Claim a name" }} />
        <RootStack.Screen name="SetValue" component={SetValueScreen} options={{ title: "Set a name's value" }} />
        <RootStack.Screen name="Backup" component={BackupScreen} options={{ title: "Back up / restore" }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
