# Worth Adding

Static Amazon affiliate comparison site for [worthadding.com](https://worthadding.com).

## Contents

- `index.html` - recent posts front page
- `data/site-content.mjs` - comparison metadata used by the homepage, archive, sitemap, and shared page registry
- `scripts/build-site.mjs` - regenerates metadata-driven sections and applies shared partials
- `vaonis-vespera-pro-vs-unistellar-odyssey-pro/` - first product comparison page
- `images/` - generated comparison artwork
- `robots.txt` and `sitemap.xml` - crawler metadata

## Updating Comparisons

Add or edit comparison metadata in `data/site-content.mjs`, then run:

```bash
node scripts/build-site.mjs
```

That updates the homepage featured/recent sections, `/comparisons/`, `sitemap.xml`, and the shared partial registry from the same source.

## Affiliate Disclosure

Worth Adding participates in the Amazon Associates program. Pages include affiliate disclosures and sponsored link attributes for Amazon links.
