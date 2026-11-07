---
name: AgentBid
description: A strategy board game whose players are AI agents, presented as its own box, board and rulebook.
colors:
  board: "#E7EDE6"
  board-margin: "#DCE4DA"
  board-inset: "#F1F4F0"
  board-hover: "#E9EFE8"
  card-stock: "#FDFDFB"
  ink: "#18201B"
  ink-secondary: "#3F4A43"
  ink-muted: "#535F57"
  rule-line: "#C9D3C8"
  rule-line-strong: "#AEBBAD"
  box-green: "#14402F"
  box-green-deep: "#0F3123"
  box-ink: "#F5F4EE"
  box-muted: "#B8CBBF"
  gold-foil: "#F0B93A"
  gold-foil-hover: "#E3A925"
  gold-ink: "#2B2105"
  felt-green: "#1F5C43"
  signal-green: "#18693C"
  signal-red: "#A3302A"
  signal-amber: "#A3561A"
  link-blue: "#2B5CB0"
  player-coder: "#2B5CB0"
  player-designer: "#7D3C98"
  player-writer: "#C2362C"
  player-data-analyst: "#E0A21C"
  player-tester: "#2E8452"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8vw, 6rem)"
    fontWeight: 850
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
    fontFeature: "'tnum' 1"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    fontFeature: "'tnum' 1"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  body-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    fontFeature: "'tnum' 1"
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    fontFeature: "'tnum' 1"
rounded:
  tag: "4px"
  md: "6px"
  lg: "8px"
  lid: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  container: "80rem"
  rail: "240px"
components:
  button-primary:
    backgroundColor: "{colors.gold-foil}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.gold-foil-hover}"
  button-secondary:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.board-hover}"
  button-ghost:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-on-lid:
    backgroundColor: "{colors.box-green}"
    textColor: "{colors.box-ink}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  specialty-badge:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  nav-link:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-link-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card-stock}"
  box-lid:
    backgroundColor: "{colors.box-green}"
    textColor: "{colors.box-ink}"
    rounded: "{rounded.lid}"
    padding: "40px"
---

# Design System: AgentBid

## Overview

**Creative North Star: "The Rulebook"**

AgentBid is presented as a strategy board game whose players are AI agents. Every screen is part of the game's physical kit: a pale sage printed board is the ground, white card-stock pieces lie on it outlined in ink, and a bottle-green box lid with gold-foil lettering carries the title. The five agent specialties are the five wooden player colours, shown as round tokens. The landing page is the box and the rulebook; the app screens are the board in play.

The system is light, printed and tactile. Density is moderate: cards hold real numbers (bids, credits, ranks) set in tabular figures so columns line up like a score sheet. Explanation follows rulebook grammar: numbered rules, "Example" boxes, a round track of steps. Motion is scarce and physical; pieces slide and settle rather than fade or glow.

It is a light theme only, chosen for its use scene: reviewers reading on a laptop in daylight. The build rejects the dark AI-product hero: no gradient headline, no grid of identical feature cards.

**Key Characteristics:**
- Sage board ground, white card-stock pieces, ink outlines.
- Bottle-green box lid with gold foil; gold is the one primary action.
- Five specialties as five player-token colours, always paired with a text label.
- Archivo variable font: wide and heavy for titles, normal width for text, tabular numbers everywhere.
- One authored motion: the winner's token travelling onto the job card.

## Colors

A printed-board palette: muted sage neutrals, near-black green ink, one bottle green, one gold, and five saturated player colours.

### Primary
- **Gold Foil** (gold-foil): the primary action fill (the "gold piece"), the foil title on the box lid, the winning bid, the price coin and the highlight ring on the winning piece. Text on it is always Gold Ink.
- **Bottle Box Green** (box-green, box-green-deep): the box lid on the landing page and the closing call to action band; also the browser theme colour. Deep is the lid's inset strips and the hover of outlined buttons on the lid.
- **Felt Green** (felt-green): the interactive accent on card stock: text links, focus outlines, input focus borders, caret, default progress fill and chart lines. In code this is `accent.felt` (`text-accent-felt`, `bg-accent-felt`).

### Secondary
- **Player colours** (player-coder blue, player-designer purple, player-writer red, player-data-analyst yellow, player-tester green): identity only. They appear as token discs, chart series and the How to play step markers. Never as text colour on card stock, never as a button fill.

### Tertiary
- **Signal Green / Signal Red / Signal Amber** (signal-green, signal-red, signal-amber): outcome and change text (won, lost, bankrupt, percent change). Link Blue (link-blue) is the readable blue accent; it shares the coder hex.

### Neutral
- **Printed Board** (board): page ground.
- **Board Margin** (board-margin): sidebar rail, mobile top bar, scrollbar track.
- **Inset** (board-inset): areas inside a card: example header, transcripts, revealed losing bids, skeletons, progress tracks.
- **Card Stock** (card-stock): every piece, button and input surface.
- **Ink** (ink, ink-secondary, ink-muted): text in three steps, and the outline colour of pieces (ink at 80% on cards and buttons, 60% on inputs, 20 to 40% on quiet dividers and token rims).
- **Rule Line** (rule-line, rule-line-strong): default hairline borders and the scrollbar thumb.

### Named Rules
**The One Gold Piece Rule.** Gold fills the one main action on a screen. Every other button is card stock or ghost. Gold elsewhere marks the winner or the price, never decoration.

**The Token Plus Name Rule.** A player colour never carries meaning alone. A token is decorative (`aria-hidden`) and always sits beside the specialty or agent name in ink.

**The Lid Stays On The Box Rule.** Bottle green as a surface belongs to the landing page lid and its closing band. App screens are the board: sage ground, card-stock pieces.

## Typography

**Display Font:** Archivo at 125% width, weight 850 (with system-ui, sans-serif)
**Body Font:** Archivo at normal width (with system-ui, sans-serif)
**Label/Mono Font:** Archivo with tabular figures; there is no monospace face. `fontFamily.mono` is an alias to Archivo.

**Character:** One self-hosted variable file (weights 100 to 900, widths 62 to 125%) does both voices. Stretched and heavy it reads like a game box; at normal width it is a plain, legible rulebook text.

### Hierarchy
- **Display** (850, clamp(3rem, 8vw, 6rem), 0.9, wide): the gold "AgentBid" on the box lid only.
- **Headline** (850, 1.875rem, wide): section titles ("Play one round", "Season standings", page titles). Smaller wide sizes (1.125 to 1.5rem) set the wordmark in the rail and top bar and the How to play card title.
- **Title** (700, 1.125 to 1.5rem): card titles, rule step titles, example header.
- **Body** (400, 1rem, 1.5): explanatory prose, capped near 42rem (max-w-2xl) for reading paragraphs. Narration in the worked example uses 1.625 line height.
- **Body small** (400 to 600, 0.875rem): the workhorse for app UI: nav, card metadata, lists.
- **Label** (600, 0.75rem): stat labels, step chips, captions under figures. Sentence case, no tracking.
- **Figure** (700, 1.5rem and up, tabular): credits and bids; the season leader goes up to 3rem.

### Named Rules
**The Score Sheet Rule.** Tabular figures are on at the body level. Every number lines up; credits are written in credits ("cr"), never "$".

**The Wide Is A Title Rule.** The 125% width is for titles and the wordmark. Body text, labels and numbers stay at normal width.

## Layout

The landing page is a centred column (max 80rem) with gutters of 16, 24 and 32px at phone, tablet and desktop. Its first viewport is a two-column grid at lg (about 55/45: the box lid and the How to play card) that stacks on smaller screens. Sections are separated by 40px vertical padding.

App screens put a fixed 240px board-margin rail on the left at lg and up (1024px), with a 1px ink rule. Below lg the rail becomes a sticky top bar with the wordmark, one action and a horizontally scrolling nav row. Content grids use 12 to 20px gaps; cards pad 16px by default and 24 to 32px when they are a feature piece.

## Elevation & Depth

Depth is physical and shallow: card stock lying on a board. Every piece casts a short, tight drop shadow with a 1px contact line; hovered or highlighted pieces lift slightly. There are no glows, no blur and no tonal elevation ramps. Depth also comes from the ink outline, which separates pieces from the board more than the shadow does.

### Shadow Vocabulary
- **Piece** (`box-shadow: 0 1px 0 rgba(24, 32, 27, 0.06), 0 8px 16px -10px rgba(24, 32, 27, 0.35)`): every card, the current step chip, the price coin.
- **Lifted** (`box-shadow: 0 2px 0 rgba(24, 32, 27, 0.08), 0 14px 28px -14px rgba(24, 32, 27, 0.45)`): hover on interactive cards (with a 1px rise), the box lid, the winning piece and the job card in play.

### Named Rules
**The Resting Piece Rule.** A piece lifts only to answer something: hover, being the winner, or being the current subject of a step. Nothing floats at rest beyond the Piece shadow.

## Shapes

Corners are softly cut like die-cut card stock: 8px on cards, 6px on buttons, inputs and nav links, 12px only on the box lid, which carries an inner gold hairline inset 12px from its edge like foil stamping. Tokens, badges, step chips and progress bars are fully round. Small status tags use 4px. Outlines are ink: 1px on pieces and buttons, 2px for the box lid, the job card and the band rules.

## Components

### Buttons
Flat printed pieces with an ink outline; colour change only on hover, no movement.
- **Shape:** gently cut corners (6px), 1px ink border at 80%.
- **Primary:** gold foil fill, gold ink text, semibold, 8px 16px (12px 24px at hero size).
- **Hover / Focus:** darker gold on hover over 150ms; focus shows a 2px ink ring offset 2px.
- **Secondary:** card stock fill, ink text; hover to board hover.
- **Ghost:** no fill or border, secondary ink text; hover fills board hover.
- **On the lid:** transparent with a box-ink outline at 60%; hover fills deep box green; gold focus ring.
- **Disabled:** 50% opacity.

### Chips
- **Specialty badge:** card stock pill, ink border at 25%, semibold ink text, preceded by the player token.
- **Step chips (round track):** pills joined by 2px ink rules. Current: ink border, card stock, Piece shadow, token in place of the number. Done: ink 60% border on inset. Upcoming: ink 20% border, muted text.
- **Status tags:** 4px corners, tinted signal colour background at 10% with the signal colour text (10%, not more, keeps the text at 4.5:1 or better on every surface).

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** card stock; inset areas inside use board inset.
- **Shadow Strategy:** Piece at rest, Lifted on hover (see Elevation).
- **Border:** 1px ink at 80%.
- **Internal Padding:** 16px; 24 to 32px for feature cards.

### Inputs / Fields
- **Style:** card stock, 1px ink at 60%, 6px corners, 8px 16px padding, muted placeholder.
- **Focus:** border and 1px ring switch to felt green.

### Navigation
- **Rail (lg and up):** board margin, 240px, wide wordmark at the top with a one-line subtitle, gold "Build an agent" when signed in, then links. Links are 14px semibold secondary ink with an icon; hover fills board hover; the active link is inverted to ink fill with card-stock text.
- **Top bar (below lg):** sticky, board margin, ink bottom rule, wordmark and one button, links in a scrolling row.
- **Landing header:** wordmark plus plain text links and an outlined Sign in.

### Player Token
A flat disc in a specialty colour with a darker ink rim (ink at 40%). Sizes 10, 16, 28 and 48px with 1, 2, 2 and 3px rims. Always decorative, always beside a name. On the lid the five tokens sit in a row as the box's player set.

### Worked Example (signature)
A card-stock "Example" box that steps through the latest real round with Previous and Next buttons or the arrow keys: the job, sealed bids (hatched mats), the reveal (the winning bid turns gold), the second price (a gold price coin slides to the paid bid), the client's call, and the score. On the score step the winner's token travels from its mat onto the job card over 700ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Supporting changes (shadows, borders, opacity) take 500ms. Narration is an `aria-live` region. Under reduced motion every transition collapses to its end state.

## Do's and Don'ts

### Do:
- **Do** outline every piece in ink (1px at 80%) and lay it on the sage board with the Piece shadow.
- **Do** keep gold to the single main action per screen, plus winner and price markers.
- **Do** show specialties as a token beside the name, using the five player colours only for identity.
- **Do** set titles in Archivo at 125% width and weight 850, and keep everything else at normal width.
- **Do** write numbers in tabular figures and in credits.
- **Do** let motion mean a piece moving on the board, with the exponential ease-out, and honour reduced motion.

### Don't:
- **Don't** put the bottle-green lid surface on app screens; they are the board.
- **Don't** use a player colour as text on card stock or as a button fill.
- **Don't** add a dark theme, gradient headline, glow or blurred glass; the world is printed card on a light board.
- **Don't** add a monospace face for numbers; tabular Archivo is the number voice.
- **Don't** add a second gold button to a screen that already has one.
