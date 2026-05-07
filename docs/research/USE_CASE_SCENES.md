# ONT Use-Case Scenes

This note turns the narrative framework into concrete scenes people can picture.

It is not a product roadmap and it is not a final marketing page. The goal is to pressure-test the thesis against moments that feel real, near-term, and important.

## How To Use This

Each scene is trying to answer the same question:

> What does ONT let a human do that feels both new and obviously useful?

The scenes are ordered from easiest to explain to most ambitious:

1. pay the right person
2. pay the right merchant or rail
3. delegate safely to software

The recommendation is to treat them as a ladder, not as competing stories. The first public-facing story should start with payment unless there is a strong reason not to.

## Scene 1: Pay The Right Person

### The scene

A human tells their wallet or client:

> Pay `david` back for dinner.

The client resolves `david`, shows the current signed payment destination, confirms whether the target changed since the last payment, and asks for approval before sending.

The human is not comparing raw addresses. The client is not guessing a recipient from context. The name is the trusted bridge.

### Why it works

This is the cleanest proof point because the stakes are immediate.

- money going to the wrong place is easy to understand
- the pain of opaque addresses is already familiar
- human-readable names feel obviously better at the point of action

It also gives a good answer to "why not just let the model handle it?" A model can help interpret the request, but it should not be free to improvise who gets paid.

### What ONT is doing here

- turning a human-readable name into an authoritative payment instruction
- giving the client something verifiable to resolve before it acts
- letting the user pin, review, and approve recipients in familiar words

### What not to imply

- this should be framed as a payment handle first, while leaving room for broader records later
- this should not be framed as a direct attack on adjacent human-readable payment efforts
- this is the first proof point, not the full destination

### Why it matters strategically

This is the best on-ramp because it is concrete and high-stakes. It earns the right to tell the bigger story later.

## Scene 2: Pay The Right Merchant Or Rail

### The scene

A human tells their client:

> Pay River for this recurring buy.

The client resolves `river`, checks the current signed records, notices whether the target changed since last time, and shows the human which merchant and payment rail it is about to use.

The human is not choosing between raw addresses, substituted invoices, or rail-specific account strings. The human is choosing the payment relationship they mean in words they can understand.

### Why it works

This is the natural second step after the person-to-person payment story lands.

It naturally includes:

- merchant trust
- multi-rail payment records
- payment approval
- target-change warnings

It is also a better long-term frame than identity alone. A handle or profile is static. A trusted payment relationship is active and much closer to where software will actually make decisions on a human's behalf. But it is still easier to believe after Scene 1 has already established why names matter around money.

### What ONT is doing here

- binding a merchant name to owner-controlled, signed payment instructions
- giving the client a way to choose among supported rails
- making room for warnings like "this payment target changed" or "this rail is new"

### What not to imply

- do not pretend ONT alone solves all merchant reputation or fraud problems
- do not imply every payment rail will support ONT immediately
- do not overstate what clients can verify without extra context

### Why it matters strategically

If Scene 1 proves the need for trustworthy names around money, Scene 2 shows the larger payment surface: humans need trustworthy names across merchants, repeated payments, and multiple rails.

This is probably the best second story, not the first one.

## Scene 3: Delegate Safely To Software

### The scene

A human sets standing rules for their software:

- only buy from names I have approved
- warn me if a resolved target changed
- do not send more than my approval threshold without asking
- use `david` for reimbursements
- use `delta` for travel unless I override it

Later, the human gives a broad instruction:

> Handle my travel for this conference.

The model interprets the goal. The client still has to resolve names, obey policy, verify recipients or merchants, and present the human with a legible summary before acting.

### Why it works

This scene captures the real long-term prize.

The point is not just lookup. It is giving humans a way to constrain software in words that stay meaningful as more work gets delegated.

This is where the phrase "LLMs widen the interpretation surface; ONT narrows the action surface" becomes most useful.

### What ONT is doing here

- turning some words in a user's instructions into trusted constraints
- separating "understand what I want" from "decide who I mean"
- helping the client enforce preferences at the payment-target layer

### What not to imply

- do not imply the model becomes deterministic
- do not imply names eliminate every trust or policy problem
- do not imply agent-to-agent naming is the central purpose

### Why it matters strategically

This is the scene that makes ONT feel like future infrastructure rather than a niche naming tool.

It is also the place where the "human-readable authority" framing becomes clearest.

## Recommended Story Order

If these scenes are used in a presentation, homepage, or explainer, the recommended order is:

1. start with Scene 1 because it is instantly legible and high-stakes
2. expand into Scene 2 because it generalizes the payment-handle problem after the first wedge is established
3. end on Scene 3 because it shows why the problem grows as software becomes more capable

That progression moves from concrete pain to broader system relevance.

## Product Behaviors These Scenes Suggest

These scenes imply certain client behaviors that may deserve stronger emphasis in demos and docs:

- clear recipient previews before payment or action
- warnings when a resolved target changed since the user's last interaction
- pinned or allowlisted names
- approval thresholds tied to named recipients
- explicit display of what record was resolved and why the client considers it authoritative

These are not all protocol features. Some are product and client behaviors. But they make the narrative more believable because they show how ONT would actually help a human stay in control.

## Relationship To Universal Auctions

These scenes also help explain why salient names matter.

If names become part of how humans tell software which service they trust, then certain names carry outsized coordination value. Pretending the protocol can know in advance which names are ordinary and which are special no longer looks neutral.

That strengthens the universal-auction case:

- launch-eligible names should face the same allocation rule
- the market should discover which names draw real demand
- very short names should be priced by objective floors, not carved into a
  separate subjective lane

The fairness argument is not mainly about prestige. It is about coordination pressure, market discovery, and the cost of misallocation.

## Open Questions

- Which scene feels most natural for the first public-facing explainer?
- Which scene is best for a live product demo?
- How much policy language should appear in early messaging versus later product material?
- Which examples feel vivid without relying too much on specific current companies?
