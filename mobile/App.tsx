import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DemoModeProvider } from "./src/DemoMode";
import { RootNavigator } from "./src/navigation";
import { WalletProvider } from "./src/wallet/WalletContext";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DemoModeProvider>
          <WalletProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </WalletProvider>
        </DemoModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
