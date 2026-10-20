# Design Direction (proposed, awaiting approval)

Source: design data from nextlevelbuilder/ui-ux-pro-max-skill, filtered through my judgment about this product. The tool's top pick for "event sponsorship" was a loud purple "vibrant block" style. I'm not recommending it: this app handles money and asks local business owners to trust a stranger, so it should feel calm, credible, and local, not startup-playful.

## Feel
Trustworthy, warm, plain-spoken. Closer to a good community bank or a well-run chamber of commerce than a startup. Mobile-first: the public package page and the proof upload are used on phones.

## Proposed tokens
| Token | Value | Use |
|---|---|---|
| primary | #1E4D8C (deep blue) | main buttons, links |
| accent / CTA | #16A34A (green) | "Sponsor this event", "Lock in next year" |
| background | #F8FAFC | page |
| card | #FFFFFF | cards |
| foreground | #0F172A | body text |
| muted foreground | #475569 | secondary text |
| border | #E2E8F0 | dividers |
| destructive | #DC2626 | errors, "missed" |
| delivered | #16A34A | delivered badge |

All text pairings must meet 4.5:1 contrast. Verified during build.

## Type
Inter for everything (headings 600-700, body 400-500). One family keeps pages fast on weak connections.

## Rules
- Lucide icons only, no emojis as icons.
- Buttons at least 44px tall; thumb-reachable primary action on phones.
- Visible keyboard focus; respect reduced motion.
- Layouts checked at 375, 768, 1024, 1440 px.
- Proof upload screen: one big "take photo" button, upload queue with clear "waiting for signal" state.
- Recap page: sponsor logo and event name at top, each deliverable as a card with its proof, renewal button after the proof, not before.

## Key screens (order of build)
1. Public package page
2. Checkout / sponsor confirmation
3. Host dashboard
4. Proof upload (mobile)
5. Sponsor recap page
