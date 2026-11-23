# Fonts

Self-hosted WOFF2 files only. Never commit OTF or TTF files to this public repository.

## Licence holder

BlueHealer Inc. holds a lifetime full licence for TT Firs Neue (H1 and H2) and TT Interphases Pro (all other text). Those licensed web files are not in this repository yet. The founder supplies the WOFF2 files.

## Stand-ins in use today

| Role | Brand font | Stand-in | Licence |
| --- | --- | --- | --- |
| Display (H1, H2) | TT Firs Neue | Manrope 600, 700 | SIL Open Font License 1.1 (`OFL-Manrope.txt`) |
| Interface | TT Interphases Pro | Inter 400, 500, 600 | SIL Open Font License 1.1 (`OFL-Inter.txt`) |

Latin subsets, from the Fontsource packages.

## Swapping in the licensed fonts

1. Add the WOFF2 files here with ASCII names, for example `tt-firs-neue-700.woff2`.
2. Point the `@font-face` rules in `src/styles/fonts.css` at them, keeping the family names `BH Display` and `BH Sans` and `font-display: swap`.
3. Update the two preload links in `index.html` to the two most used weights.
4. Delete the stand-in files and licences if nothing uses them.
