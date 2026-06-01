import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type TabParamList = {
  Explore: undefined;
  Auctions: undefined;
  Activity: undefined;
  Wallet: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  NameDetail: { name: string };
  AuctionDetail: { auctionId: string };
  Claim: { name?: string } | undefined;
  SetValue: { name?: string } | undefined;
  Recovery: { name?: string } | undefined;
  Transfer: { name?: string } | undefined;
  Backup: undefined;
  MyNames: undefined;
  Deposit: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
