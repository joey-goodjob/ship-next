# LyricEdits Behaviors

## Interaction Model
- Header: static top navigation. Active pricing link uses yellow text on pricing page.
- Hero upload card: click-driven upload in source product; clone maps CTA to `/dashboard/lyric-videos`.
- Featured videos: time-driven autoplay/loop/muted webm cards. In the clone, video elements should be present with fallback gradient surfaces.
- Pricing segmented control: click-driven monthly/annual UI. MVP clone can render the segment visually with monthly selected.
- FAQ: click-driven accordion. First item open by default on source screenshots.
- Mobile: navigation collapses; public clone can keep current site header behavior while matching surface style.

## Extracted Visual Behaviors
- Buttons: yellow primary fill, subtle hover darkening, 10px radius, black text.
- Secondary buttons: very light gray fill or white bordered button.
- Cards: no strong hover dependency; borders and rounded corners carry the layout.
- Section rhythm: alternating white and light gray bands with generous vertical padding.
- Videos: autoplay, loop, muted. Captions sit below/near card blocks.

## Assets
- Downloaded to `public/lyricedits-assets/`:
  - `premiere.svg`
  - `davinci-big.png`
  - `fcpx-big.png`
  - `featured-on-taaft.png`
  - favicon variants
- Remote video references extracted:
  - `https://media.lyricedits.ai/featured/the-giants-are-marching-home-4k.webm`
  - `https://media.lyricedits.ai/featured/bubbles-4k.webm`
  - `https://media.lyricedits.ai/featured/filla-on-ets.webm`
  - `https://media.lyricedits.ai/featured/tease-her-4k.webm`
  - `https://media.lyricedits.ai/featured/ultimo-aliento-4k.webm`
  - `https://media.lyricedits.ai/featured/bad-chick-4k.webm`
