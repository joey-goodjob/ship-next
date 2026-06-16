# BeatMV Creators Gallery Behaviors

Scope: extracted only the "See What Creators Are Making" gallery from https://beatmv.ai/ for insertion into the local homepage.

## Interaction Model
- Time-driven marquee gallery.
- No click controls, tabs, modal, or route-changing interaction were present in the target section.
- Two horizontal rows move continuously in opposite directions.
- Measured transform delta at desktop: top row moves left about 16px/s; bottom row moves right about 16px/s.
- Videos are autoplay, muted, looped, playsInline MP4 elements.
- Reduced motion should stop the marquee animation and leave rows readable.

## Visual Behavior
- Cards use 9:16 aspect ratio.
- Desktop card size: 280px wide, 497.766px tall.
- Mobile card size: 220px wide, 391.109px tall.
- Card gap: 8px.
- Card radius: 16px.
- Cards with labels use a bottom overlay gradient from black/80 through black/40 to transparent.

## Responsive Behavior
- Desktop viewport 1440px: section is inside a 1280px max-width container, with two 497.766px rows.
- Mobile viewport 390px: section spans full viewport width, heading content has 16px side padding, cards shrink to 220px.
- Heading desktop: 62px font size, 68px line-height, font-weight 600.
- Heading mobile: 36px font size, 40px line-height, font-weight 600.
