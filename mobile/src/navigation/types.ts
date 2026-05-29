import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  NameDetail: { name: string };
  AuctionDetail: { auctionId: string };
  Claim: { name?: string } | undefined;
  SetValue: { name?: string } | undefined;
  Recovery: { name?: string } | undefined;
  Backup: undefined;
  MyNames: undefined;
  Deposit: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
