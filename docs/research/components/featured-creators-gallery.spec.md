# FeaturedCreatorsGallery Specification

## Overview
- Target files: `src/components/featured-creators-gallery.tsx`, `src/blocks/featured-creators.tsx`
- Desktop screenshot: `docs/design-references/beatmv-creators-section-desktop.png`
- Mobile screenshot: `docs/design-references/beatmv-creators-section-mobile.png`
- Interaction model: time-driven marquee, no click state.

## DOM Structure
- Full-width `section`.
- Background image layer using `public/beatmv-showcase/bgdark.webp`.
- Header wrapper with title and description.
- Gallery wrapper with two clipped rows.
- Each row has a flex track containing duplicated cards for seamless looping.
- Each card contains one local MP4 video.
- Cards with title/description render a bottom gradient overlay.

## Computed Styles

### Source Section
- padding desktop: `64px 0px`
- padding mobile: `48px 0px`
- color: `oklch(0.9288 0.0126 255.508)`
- max inner width: `1280px`

### Source Heading
- desktop fontSize: `62px`
- desktop lineHeight: `68px`
- mobile fontSize: `36px`
- mobile lineHeight: `40px`
- fontWeight: `600`
- background: `linear-gradient(to right, oklch(0.714 0.203 305.504), oklch(0.673 0.182 276.935), oklch(0.718 0.202 349.761))`

### Source Description
- fontSize: `20px`
- lineHeight: `28px`
- color: `oklch(0.8 0.0192 261.325)`
- marginTop: `16px`

### Source Gallery
- display: `flex`
- flexDirection: `column`
- gap: `8px`
- overflow: `hidden`

### Source Cards
- desktop width: `280px`
- mobile width: `220px`
- aspect ratio: `9 / 16`
- borderRadius: `16px`
- backgroundColor: `oklch(0.17 0 0)`
- overflow: `hidden`
- video objectFit: `cover`

## States & Behaviors

### Marquee Motion
- Trigger: time.
- State A: top row initial transform around `matrix(1, 0, 0, 1, -459.264, 0)`.
- State B after 5s: top row transform around `matrix(1, 0, 0, 1, -539.264, 0)`.
- State A: bottom row initial transform around `matrix(1, 0, 0, 1, -229.168, 0)`.
- State B after 5s: bottom row transform around `matrix(1, 0, 0, 1, -149.168, 0)`.
- Implementation approach: CSS linear infinite keyframes at about 16px/s; duplicated card sequence creates seamless loop.

### Hover
- Local implementation pauses both marquee rows when the user hovers/focuses the section so videos can be inspected.

## Assets
- `/beatmv-showcase/G7V2Biy3omw.mp4`
- `/beatmv-showcase/XvzlglZbZf0.mp4`
- `/beatmv-showcase/s7OrG5Iq2Kw.mp4`
- `/beatmv-showcase/_8QsZGLyZGQ.mp4`
- `/beatmv-showcase/-Nb-M1GAOX8.mp4`
- `/beatmv-showcase/edvPrDCWwOk.mp4`
- `/beatmv-showcase/7NK_JOkuSVY.mp4`
- `/beatmv-showcase/fpUpVznI4Yc.mp4`
- `/beatmv-showcase/bgdark.webp`

## Text Content
- Title: "See What Creators Are Making"
- Description: "Real AI music videos created by the community"
- Card label: "One Click" / "Upload a song, get a music video."
- Card label: "20+ Styles" / "Anime, cinematic, retro - match any vibe."
- Card label: "Lip Sync" / "AI characters that sing your lyrics."
- Card label: "Any Format" / "16:9, 9:16, 1:1 - every platform ready."

## Responsive Behavior
- Desktop 1440px: `max-width: 1280px`, rows show four to five cards with clipped overflow.
- Tablet 768px: same two-row marquee, cards use mobile width until `md`.
- Mobile 390px: heading wraps to two lines, rows remain horizontal marquee, cards use 220px width.
