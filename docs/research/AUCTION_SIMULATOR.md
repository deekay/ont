# Auction Simulator

This note describes the current auction simulator and CLI surface.

The simulator now follows the current launch direction:

- one auction mechanism for every valid name
- no semantic reserved-word list
- no brand/person/generic classes
- no short-name wave
- a valid bonded opening bid starts the auction clock

The TypeScript identifiers still contain some older `reserved` names in a few
internal places. Treat those as legacy implementation names, not product or
launch vocabulary.

The simulator still contains a legacy scheduled-catalog compatibility state for
compatibility fixtures. That should not be presented as the current launch UX:
in the user-started model, no auction exists until the opening bid confirms.

## CLI Commands

Print the current temporary auction policy:

```bash
npm run dev:cli -- print-auction-policy
```

Write the policy to a file for local editing:

```bash
npm run dev:cli -- print-auction-policy --write /tmp/ont-auction-policy.json
```

Run a single auction fixture:

```bash
npm run dev:cli -- simulate-auction fixtures/auction/marble-competitive.json
```

Run a single auction fixture with an edited policy:

```bash
npm run dev:cli -- simulate-auction fixtures/auction/silverpine-thin-market.json --policy /tmp/ont-auction-policy.json
```

Run a market-level scenario with bidder budget pressure:

```bash
npm run dev:cli -- simulate-auction-market fixtures/auction/market-capital-pressure.json
```

## What It Models

The simulator models:

- opening bid requirements
- minimum increment rules
- stronger soft-close increment rules
- soft-close extension
- legacy scheduled-catalog compatibility
- bidder budget constraints in market scenarios
- settlement into a winning bidder when a valid auction clears

It is still a simulator, not the final launch engine.

## Current Policy Shape

The default policy has one auction group:

- `launch_name`: the public auction group for valid names

The default timing and floors are placeholders. They are intentionally useful
for tests and demos, not final launch constants.

## What Still Needs Work

Before launch, the simulator direction still needs to be connected to:

- auction-opening UX
- final auction windows, soft-close response windows, and increment rules
- final settlement duration
- batching / footprint analysis for auction openings and bids
