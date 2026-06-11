# Cold-User Walkthrough

Use this when you want a first-time user to try ONT with little or no coaching and give back useful notes.

This is not a protocol test. It is a product-usability test for the current hosted private demo and repo entry points.

## Goal

Learn where a technically capable new user gets stuck when they:

- land in the repo or website for the first time
- set up the private demo wallet flow in Sparrow
- try the auction bid flow for one name
- try to understand what to save and what to do next

## Suggested Tester

Best fit:

- comfortable installing desktop software
- comfortable running one terminal command
- not already familiar with the ONT auction flow

Avoid:

- someone who already knows the protocol deeply
- someone who needs constant help using a terminal at all

## Facilitator Rules

Keep the session as cold as possible.

- Start by sending only the link you want tested:
  - website: [https://opennametags.org](https://opennametags.org)
  - repo: [https://github.com/deekay/ont](https://github.com/deekay/ont)
- Do not explain the flow up front.
- Let the tester narrate what they think each page is for.
- Do not rescue immediately when they pause.
- If they are blocked for more than a few minutes, ask what they expected to happen before you explain anything.

## Primary Task

Ask the tester to do this:

> Acquire a demo name through auction using the hosted private demo and Sparrow.

What success looks like:

- they get Sparrow connected
- they receive demo coins
- they prepare an auction bid package
- they sign and broadcast the bid
- they can find the auction-acquired name afterward

## Optional Follow-Up Task

If the first task succeeds without much help:

> Tell me which key matters after the auction, and how you think you would update or transfer the name later.

This is useful because it reveals whether the difference between:

- wallet key
- owner key

is actually clear.

## What To Observe

Capture the first point where they hesitate on each of these:

- understanding what ONT is
- choosing between website vs GitHub vs self-hosting
- wallet setup
- understanding that Sparrow is the supported hosted-demo wallet path
- understanding that Sparrow must be set to `Private Electrum`, not `Public Server`
- understanding that they must create/open a wallet before Sparrow can show a receive address
- requesting demo coins
- understanding what to save
- understanding which files belong in Sparrow
- understanding auction bid, settlement, and bond maturity timing
- finding the auction-acquired name afterward

Also capture:

- what they clicked first
- what they ignored completely
- whether the term `Electrum` made them think they should use the official Electrum app
- what wording they repeated back incorrectly
- any place where they expected the site to do more than it currently does

## Session Notes Template

Use this structure:

```md
# Cold-User Walkthrough

Date:
Tester:
Facilitator:
Starting point:
- [ ] Website
- [ ] GitHub

## Outcome

- [ ] Completed the hosted demo auction flow
- [ ] Needed help
- [ ] Stopped before completion

## First major point of confusion

Describe the first real place they stalled.

## Other friction points

1.
2.
3.

## Misunderstandings

- 

## Quotes worth keeping

-

## Changes this suggests

1.
2.
3.
```

## How To File The Result

Open a GitHub issue using the `Cold-user walkthrough` template and paste in the notes.

If several sessions point to the same problem, open one follow-up implementation issue rather than letting the walkthrough issues turn into a backlog by themselves.
