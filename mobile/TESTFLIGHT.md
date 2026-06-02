# Getting the app on a phone → TestFlight

The app is a standard Expo / React Native app. Everything is configured except
the two things only you can provide: an **Apple Developer account** ($99/yr) and
an **Expo account** (free) to run cloud builds. Bundle id is
`org.opennametags.mobile`; build profiles are in `eas.json`.

It ships pointed at the **private signet** (`ACTIVE_NETWORK = "signet"` in
`src/config.ts`) with **demo mode on by default**, so testers can walk every flow
with no setup and no real money.

## Fastest: on your own phone, right now

This is a React Native (Expo) app. **Do NOT open `ios/OpenNameTags.xcodeproj` and
build** — it doesn't link CocoaPods, so you'll get hundreds of missing-symbol
errors. Either use the CLI (below) or open the **`.xcworkspace`**.

Plug in your unlocked iPhone and:

```sh
cd mobile
npx expo run:ios --device      # pick your phone; signs with your Apple ID
```

That prebuilds, runs `pod install`, builds, installs, and launches. First run
prompts you to pick a signing team (your Apple ID).

**If you'd rather use Xcode:** open `ios/OpenNameTags.xcworkspace` (the workspace,
never the `.xcodeproj`). Set the target's Signing team to your Apple ID; if the
bundle id `org.opennametags.mobile` is taken, make it unique (e.g.
`org.opennametags.mobile.dk`). Pick your device and Run. For a debug build keep
Metro up (`npx expo start`); or build the **Release** config so the JS is baked in.

**First-time-on-device gotchas (iOS 16+):**
- Settings → Privacy & Security → **Developer Mode** → On (restarts the phone).
- After install: Settings → General → **VPN & Device Management** → trust your cert.
- A **free Apple ID ("Personal Team") is enough** for your own device — the paid
  Developer account is only for TestFlight/App Store. Free builds expire in ~7
  days; re-run to refresh.

If `ios/` ever gets out of sync (it's gitignored + regenerable):
`npx expo prebuild -p ios --clean && (cd ios && pod install)`.

## Cloud build → install on your phone (no Mac toolchain needed)

```sh
npm i -g eas-cli
eas login                       # your Expo account
eas build:configure             # writes the EAS projectId into app.json
eas device:create               # register your iPhone (UDID) for ad-hoc install
eas build -p ios --profile preview
```

EAS returns an install link / QR; open it on the phone to install the signed
build. `preview` is an internal-distribution release build (no dev client).

## TestFlight (for the dozens of signet testers)

```sh
eas build -p ios --profile production
eas submit -p ios --latest      # uploads to App Store Connect → TestFlight
```

Then in App Store Connect, add testers (or a public TestFlight link). Each new
build: bump nothing manually — `production` uses `autoIncrement` + remote
versioning, so `eas build` + `eas submit` is the whole loop.

## Notes for testers (signet)

- Everything runs on **signet** with **demo mode on** — claims, bids, value sets,
  recovery, and backup are walkable with no real funds. Reads (Explore / Auctions
  / Activity) are live signet data.
- "My ONT" shows real on-chain names you own **plus** your demo activity this
  session.
- The only thing that can't be exercised on signet is a real Lightning payment
  (that's mainnet-only) — the claim simulates it and still verifies a real
  inclusion proof.

## Before a real (mainnet) launch — much later

- Flip `ACTIVE_NETWORK` to `"main"` in `src/config.ts` (+ set the mainnet host).
- Turn off `DEMO_MODE_DEFAULT`; stand up the publisher's Lexe node; wire real
  Drive/iCloud backup. See `ROADMAP.md`.
