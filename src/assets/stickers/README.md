# Mầm nhỏ — sticker pack v1

Six original illustrations generated on 2026-11-18 with the built-in ImageGen
tool. Production asset: `sprout-sheet-v1.webp`, 1536 × 1024, transparent RGBA,
3 columns × 2 rows, 241,400 bytes. Encoded to WebP with FFmpeg (quality 88);
the layout and alpha are preserved. No external image service is used at runtime.

Cell order: wave, love, laugh / thanks, sad, party. These ids and positions are
versioned in `src/features/messages/message-content.ts`. Keep existing v1 cells
stable so saved messages keep rendering the same artwork. New packs/versions
should use a new asset and protocol version.

The PNG source is retained in the local ImageGen output and copied to
`output/imagegen/sprout-sheet-v1-source.png` (gitignored).

Final generation prompt (built-in tool; transparent_background=true):

> Use case: illustration-story. Asset type: one transparent PNG sticker sprite sheet for a chat application, a single production asset. Create a precise landscape 1536x1024 sprite atlas with exactly 3 equal columns and 2 equal rows, each cell 512x512. Six original friendly mint-green round blob characters with small cream faces, dark teal soft outlines, subtle dimensional gouache shading, a clean white sticker-cut outline, expressive simple faces and small rounded hands. Same character identity and style in all cells. Each sticker centered at the exact center of its cell, contained strictly within its cell with at least 64px transparent padding on all four sides, no overlap or cross-cell elements, equal visual scale. Reading order left to right: TOP LEFT waving hello with one raised hand; TOP MIDDLE hugging a coral red heart with affectionate happy face; TOP RIGHT laughing with joyful curved eyes and tiny tears of laughter. BOTTOM LEFT hands pressed together saying thank you with gentle grateful face and one small golden sparkle; BOTTOM MIDDLE sad face with two large blue tears, still cute; BOTTOM RIGHT celebrating with a little golden party hat and 3 small coral/gold confetti shapes. No text, lettering, labels, cell borders, background rectangles, checkerboard, shadows cast across cells, logos or watermark. Background must be truly alpha transparent. Whole sheet must be exactly uniform 3x2 grid; do not rearrange cells.
