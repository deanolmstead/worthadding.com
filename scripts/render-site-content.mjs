import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { comparisons, comparisonUrl, site } from '../data/site-content.mjs';

const root = process.cwd();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function longDate(isoDate) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function shortDate(isoDate) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function replaceBetween(html, startMarker, endMarker, content) {
  const pattern = new RegExp(`(${escapeRegExp(startMarker)}\\n)[\\s\\S]*?(\\n\\s*${escapeRegExp(endMarker)})`);
  if (!pattern.test(html)) {
    throw new Error(`Missing managed block: ${startMarker}`);
  }
  return html.replace(pattern, `$1${content}$2`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function jsonLdScript(graph) {
  return `<script type="application/ld+json">\n  ${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/\n/g, '\n  ')}\n  </script>`;
}

function homeJsonLd() {
  const recent = comparisons.slice(0, 5);
  const featured = comparisons[0];

  return jsonLdScript([
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: `${site.url}/`,
      name: site.name,
      publisher: { '@id': `${site.url}/#organization` }
    },
    {
      '@type': 'CollectionPage',
      '@id': `${site.url}/#webpage`,
      url: `${site.url}/`,
      name: 'Worth Adding: Recent product comparisons worth your shortlist',
      description: 'Worth Adding publishes concise, sourced product comparisons for people deciding what is actually worth adding to their home, kit, or daily routine.',
      isPartOf: { '@id': `${site.url}/#website` },
      publisher: { '@id': `${site.url}/#organization` },
      primaryImageOfPage: { '@id': `${site.url}/#primaryimage` },
      mainEntity: { '@id': `${site.url}/#recent-posts` }
    },
    {
      '@type': 'ItemList',
      '@id': `${site.url}/#recent-posts`,
      name: 'Recent Worth Adding comparisons',
      numberOfItems: recent.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: recent.map((comparison, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: comparisonUrl(comparison),
        name: comparison.schemaTitle
      }))
    },
    {
      '@type': 'ImageObject',
      '@id': `${site.url}/#primaryimage`,
      url: featured.image.url,
      width: featured.image.width,
      height: featured.image.height
    },
    {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: site.name,
      url: `${site.url}/`
    }
  ]);
}

function homeFeature() {
  const featured = comparisons[0];

  return `<article class="feature-panel" aria-labelledby="featured-title">
            <a href="${featured.slug}/" aria-label="Read the featured comparison">
              <img src="${featured.image.src}" alt="${escapeHtml(featured.image.alt)}" width="${featured.image.width}" height="${featured.image.height}" loading="eager" fetchpriority="high">
            </a>
            <div class="feature-copy">
              <div class="feature-meta">
                <span class="pill">Latest</span>
                <span class="pill">${escapeHtml(featured.category)}</span>
                <span class="pill"><time datetime="${featured.date}">${longDate(featured.date)}</time></span>
              </div>
              <h2 id="featured-title"><a class="feature-title" href="${featured.slug}/">${escapeHtml(featured.title)}</a></h2>
              <p>${escapeHtml(featured.featuredSummary || featured.summary)}</p>
              <div>
                <a class="button" href="${featured.slug}/">Read comparison</a>
              </div>
            </div>
          </article>`;
}

function homeRecentList() {
  return comparisons.slice(0, 5).map((comparison) => `          <a class="post-row" href="${comparison.slug}/">
            <time class="post-date" datetime="${comparison.date}">${shortDate(comparison.date)}</time>
            <div>
              <h3>${escapeHtml(comparison.title)}</h3>
              <p>${escapeHtml(comparison.summary)}</p>
            </div>
            <span class="post-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
            </span>
          </a>`).join('\n\n');
}

function archiveJsonLd() {
  return jsonLdScript([
    {
      '@type': 'CollectionPage',
      '@id': `${site.url}/comparisons/#webpage`,
      url: `${site.url}/comparisons/`,
      name: `All Comparisons | ${site.name}`,
      description: 'Browse every Worth Adding product comparison by category, verdict, and updated date.',
      publisher: { '@id': `${site.url}/#organization` },
      mainEntity: { '@id': `${site.url}/comparisons/#itemlist` }
    },
    {
      '@type': 'ItemList',
      '@id': `${site.url}/comparisons/#itemlist`,
      name: 'Worth Adding comparison archive',
      numberOfItems: comparisons.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: comparisons.map((comparison, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: comparisonUrl(comparison),
        name: comparison.schemaName
      }))
    },
    {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: site.name,
      url: `${site.url}/`
    }
  ]);
}

function archiveMeta() {
  return `<span class="pill">${comparisons.length} comparisons</span>
          <span class="pill">${uniqueCategories().length} categories</span>
          <span class="pill">Updated ${longDate(site.homepageUpdated)}</span>`;
}

function archiveCards() {
  return comparisons.map((comparison) => `          <a class="archive-card" href="${comparisonUrl(comparison)}">
            <div>
              <div class="card-top">
                <span class="pill">${escapeHtml(comparison.category)}</span>
                <span class="pill"><time datetime="${comparison.date}">${longDate(comparison.date)}</time></span>
              </div>
              <h3>${escapeHtml(comparison.title)}</h3>
              <p>${escapeHtml(comparison.summary)}</p>
            </div>
            <div class="winner">
              ${escapeHtml(comparison.winnerLabel)}
              <strong>${escapeHtml(comparison.winner)}</strong>
            </div>
          </a>`).join('\n');
}

function categoryGrid() {
  return uniqueCategories().map((comparison) => `          <article class="category-card">
            <div class="kicker">${escapeHtml(comparison.category)}</div>
            <p>${escapeHtml(comparison.categorySummary)}</p>
          </article>`).join('\n');
}

function uniqueCategories() {
  const seen = new Set();
  return comparisons.filter((comparison) => {
    if (seen.has(comparison.category)) return false;
    seen.add(comparison.category);
    return true;
  });
}

function sitemapXml() {
  const comparisonUrls = comparisons.map((comparison) => `  <url>
    <loc>${comparisonUrl(comparison)}</loc>
    <lastmod>${comparison.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.80</priority>
  </url>`).join('\n');

  const utilityUrls = site.utilityPages.map((page) => `  <url>
    <loc>${site.url}/${page.path}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site.url}/</loc>
    <lastmod>${site.homepageUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.00</priority>
  </url>
  <url>
    <loc>${site.url}/comparisons/</loc>
    <lastmod>${site.homepageUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
${comparisonUrls}
${utilityUrls}
</urlset>
`;
}

async function renderHome() {
  const filePath = path.join(root, 'index.html');
  let html = await readFile(filePath, 'utf8');
  const featured = comparisons[0];

  html = html
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${featured.image.url}">`)
    .replace(/<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="${featured.image.width}">`)
    .replace(/<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="${featured.image.height}">`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, homeJsonLd())
    .replace(/<article class="feature-panel" aria-labelledby="featured-title">[\s\S]*?<\/article>/, `<!-- generated-feature:start -->\n          ${homeFeature()}\n          <!-- generated-feature:end -->`)
    .replace(/<div class="post-list">[\s\S]*?<\/div>\s*<div class="hero-actions">/, `<div class="post-list">\n<!-- generated-recent:start -->\n${homeRecentList()}\n<!-- generated-recent:end -->\n        </div>\n        <div class="hero-actions">`);

  html = html.replace(/<!-- generated-feature:start -->\n\s*<!-- generated-feature:start -->/, '<!-- generated-feature:start -->');
  html = html.replace(/<!-- generated-feature:end -->\n\s*<!-- generated-feature:end -->/, '<!-- generated-feature:end -->');

  await writeFile(filePath, html);
}

async function renderArchive() {
  const filePath = path.join(root, 'comparisons/index.html');
  let html = await readFile(filePath, 'utf8');

  html = html
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, archiveJsonLd())
    .replace(/<div class="archive-meta" aria-label="Archive summary">[\s\S]*?<\/div>/, `<div class="archive-meta" aria-label="Archive summary">\n          <!-- generated-archive-meta:start -->\n          ${archiveMeta()}\n          <!-- generated-archive-meta:end -->\n        </div>`)
    .replace(/<div class="archive-list">[\s\S]*?<\/div>\s*<div class="category-grid"/, `<div class="archive-list">\n<!-- generated-archive-list:start -->\n${archiveCards()}\n<!-- generated-archive-list:end -->\n        </div>\n        <div class="category-grid"`)
    .replace(/<div class="category-grid" aria-label="Current topic groups">[\s\S]*?<\/div>\s*<\/section>/, `<div class="category-grid" aria-label="Current topic groups">\n<!-- generated-category-grid:start -->\n${categoryGrid()}\n<!-- generated-category-grid:end -->\n        </div>\n      </section>`);

  await writeFile(filePath, html);
}

await renderHome();
await renderArchive();
await writeFile(path.join(root, 'sitemap.xml'), sitemapXml());

console.log('Rendered homepage, comparison archive, and sitemap from data/site-content.mjs');
