# Style Guide: Perspective Availability

**Slug:** pov-availability
**Date:** 2026-08-24

> Governs all user-facing text in this feature area. Binding during engineering review. Built from `product-team/guardrails/language.md` plus this product's voice. The base guardrails are never relaxed here, only extended.

## Voice

**Plain, exact, and unbothered.** The Hub speaks to a member of a community, not to a user of a service. It tells her what she is looking at and gets out of the way.

Three qualities, in priority order when they conflict:

1. **Exact before reassuring.** The product's whole claim is that a trust number belongs to a perspective. Copy that blurs whose perspective is worse than copy that sounds abrupt. Never soften a statement into ambiguity.
2. **Calm before apologetic.** When something can't be served, the Hub says so once, without apology and without alarm. It does not say sorry, it does not say "oops," and it does not raise its voice with an exclamation mark or a warning symbol.
3. **Useful before complete.** A member gets the fact she can act on, not the full causal chain. The provider's own explanation is longer and more accurate and is exactly the wrong thing to show her.

**Register.** Second person, present tense, contractions welcome. "You're seeing your own view instead" — the way a person would say it.

**Who it does not sound like.** Not a system reporting on itself ("the request could not be completed"). Not a brand being friendly ("Hang tight — we're working on it!"). Not a protocol document.

## Language rules

The base guardrails at `product-team/guardrails/language.md` apply in full. In particular, and most often violated in this feature area:

- **No emoji in product copy.** Including warning symbols. Especially warning symbols.
- **No em-dash sentence joins** as a default connective. Use a period. Two short sentences beat one joined one.
- **No exclamation marks** in interface copy.
- **Active voice.** "Your account isn't registered," not "your account has not been registered."
- **Short sentences.** More than one comma is a signal to split.
- **Say what happened, not what the system did.** "My view is being set up," not "score computation has been scheduled."

Extended for this product:

- **No jargon without a member-facing meaning.** A word earns a place in the interface if it names something a member could act on or ask about. "Brainstorm" qualifies — it is a service she can be registered with. "Point of view," "algorithm," "rank," and "GrapeRank" do not.
- **Never say "unavailable" about results that are on screen.** The word describes a perspective, never the page and never the rows.
- **Claim only what the page can verify.** The page knows a perspective was refused. It does not know which perspective replaced it. Copy states the first and never the second.
- **Name a perspective the same way every time.** "Les Femmes Orange" for the community's. "You" and "your own view" for the member's. Never "the community POV," never "the house view," never "global."

## UI copy patterns

- **Perspective labels:** name the perspective, nothing else. `— searching as Les Femmes Orange`. The reason a perspective is active never appears in the label.
- **Status lines:** state, then consequence. `Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.` Two sentences: what is true, then what it means for her.
- **Causes:** name the cause when there is one a member can act on. `My view isn't available yet because your account isn't registered with Brainstorm.` A bare fact with no cause is a dead end and is not acceptable copy in this product.
- **Waits:** give a number in units a person says out loud. `Check back in about 10 minutes.` Never "shortly," never "soon," never "please wait."
- **Button labels:** verb plus noun. Unchanged from the shipped page.
- **Empty states:** describe what would appear here and how to get it. The shipped `No profiles matched that search.` stands.
- **Error messages:** what went wrong and what to do. Reserved for actual errors — a substituted perspective is not one.
- **Confirmation messages:** confirm the action, not the click. Unchanged from the shipped page.

## Forbidden phrases

Beyond the base list, banned in this feature area specifically:

- **Any provider-authored string.** The provider's reason text, verbatim or excerpted, in any element.
- **`pov`, `POV`, `point of view`, `algorithm`, `graperank`, `graperank-pov`, `relevance-pov`, `rank`** as member-facing words.
- **A raw public key** in any explanatory copy. Keys belong in inputs and identity rows, never in a sentence.
- **A provisioning or console URL** aimed at an operator.
- **"Network-default results," "the whole Nostr network," "global view," "the network's view"** — all assert something the page cannot verify.
- **"Something went wrong," "an error occurred," "please try again later"** — three ways of saying nothing.
- **"Temporarily unavailable"** applied to a perspective. It implies a wait the page has no basis to promise.
- **"Personalization is disabled"** and any framing that makes a missing perspective sound like a setting she turned off.
