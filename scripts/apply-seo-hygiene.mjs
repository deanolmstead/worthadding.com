import { readFile, writeFile } from 'node:fs/promises';
import { comparisons, pageFileForComparison, site } from '../data/site-content.mjs';

const root = process.cwd();

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateTimeFor(date) {
  return `${date}T00:00:00-07:00`;
}

function articleTitle(comparison) {
  return `${comparison.title}: Which Wins?`;
}

function articleDescription(comparison) {
  return comparison.summary.replace(/\?$/, '.');
}

function pngPathFor(src) {
  return src.replace(/\.webp$/, '.png');
}

function webpPathFor(src) {
  return src.replace(/\.png$/, '.webp');
}

function absoluteUrlFor(src) {
  return `${site.url}${src}`;
}

function relatedFor(comparison) {
  const sameHome = new Set([
    'Can openers',
    'Food processors',
    'Blenders',
    'Espresso machines'
  ]);
  const powerTools = new Set(['Cordless drills', 'Table saws']);
  const homeComfort = new Set(['Air purifiers', 'Light therapy', 'Hair dryers']);
  const electronics = new Set(['Portable power stations', 'Turntables', 'Cameras', 'Telescopes', 'Portable SSDs', 'Noise-cancelling headphones', 'Audio interfaces', 'Portable monitors']);
  const sports = new Set(['Basketball hoops']);

  const cluster = [sameHome, powerTools, homeComfort, electronics, sports]
    .find((group) => group.has(comparison.category));
  const inCluster = cluster
    ? comparisons.filter((candidate) => candidate.slug !== comparison.slug && cluster.has(candidate.category))
    : [];
  const fallback = comparisons.filter((candidate) => candidate.slug !== comparison.slug);

  return [...inCluster, ...fallback]
    .filter((candidate, index, array) => array.findIndex((item) => item.slug === candidate.slug) === index)
    .slice(0, 3);
}

function relatedSection(comparison) {
  const cards = relatedFor(comparison).map((related) => `          <article class="product-card">
            <div class="kicker">${htmlEscape(related.category)}</div>
            <h3><a href="${site.url}/${related.slug}/">${htmlEscape(related.title)}</a></h3>
            <p>${htmlEscape(related.summary)}</p>
            <p class="source-note"><strong>${htmlEscape(related.winnerLabel)}:</strong> ${htmlEscape(related.winner)}</p>
          </article>`).join('\n');

  return `      <section class="section related-comparisons" id="related" aria-labelledby="related-title">
        <div class="section-head">
          <div>
            <div class="kicker">Related comparisons</div>
            <h2 id="related-title">More buying decisions to check next.</h2>
          </div>
          <p class="section-desc">Keep comparing adjacent categories before you buy, especially if counter space, storage, power, maintenance, or daily handling are part of the decision.</p>
        </div>
        <div class="card-grid related-list">
${cards}
        </div>
      </section>`;
}

function strengthenAlt(currentAlt, comparison) {
  if (!currentAlt || currentAlt.includes(' comparison')) return currentAlt;
  return `${currentAlt} for the ${comparison.title} comparison`;
}

async function updatePage(comparison) {
  const filePath = `${root}/${pageFileForComparison(comparison)}`;
  let html = await readFile(filePath, 'utf8');
  const dt = dateTimeFor(comparison.date);
  const fallbackAlt = comparison.image?.alt ? strengthenAlt(comparison.image.alt, comparison) : null;
  const title = articleTitle(comparison);
  const description = articleDescription(comparison);
  const imageSrc = comparison.image?.src ? webpPathFor(comparison.image.src) : null;
  const imageUrl = imageSrc ? absoluteUrlFor(imageSrc) : null;
  const imagePng = imageSrc ? pngPathFor(imageSrc) : null;

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${htmlEscape(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:image:type" content="[^"]*">\n?/, '')
    .replace(/<meta property="article:published_time" content="[^"]*">/, `<meta property="article:published_time" content="${dt}">`)
    .replace(/<meta property="article:modified_time" content="[^"]*">/, `<meta property="article:modified_time" content="${dt}">`)
    .replaceAll(`"datePublished": "${comparison.date}"`, `"datePublished": "${dt}"`)
    .replaceAll(`"dateModified": "${comparison.date}"`, `"dateModified": "${dt}"`)
    .replaceAll(`"description": "${comparison.schemaTitle.replace(/"/g, '\\"')}"`, `"description": "${description.replace(/"/g, '\\"')}"`)
    .replaceAll(`"description": "${description.replace(/"/g, '\\"').replace(/\.$/, '?')}"`, `"description": "${description.replace(/"/g, '\\"')}"`);

  if (comparison.image && imageSrc && imageUrl && imagePng) {
    html = html
      .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imageUrl}">`)
      .replace(/<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="${comparison.image.width}">`)
      .replace(/<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="${comparison.image.height}">`)
      .replaceAll(`"image": "${absoluteUrlFor(imagePng)}"`, `"image": "${imageUrl}"`)
      .replaceAll(`"url": "${absoluteUrlFor(imagePng)}"`, `"url": "${imageUrl}"`)
      .replaceAll(`src="${imagePng}"`, `src="${imageSrc}"`);
  }

  if (fallbackAlt && comparison.image?.src) {
    const imagePattern = new RegExp(`(<img src="${comparison.image.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" alt=")[^"]*(")`);
    html = html.replace(imagePattern, `$1${htmlEscape(fallbackAlt)}$2`);
  } else {
    html = html.replace(/(<figure class="hero-media">\s*<img src="\/images\/[^"]+" alt=")([^"]*)(")/, (_match, start, currentAlt, end) => {
      return `${start}${htmlEscape(strengthenAlt(currentAlt, comparison))}${end}`;
    });
  }

  html = html
    .replaceAll(`rel="sponsored noopener noreferrer"`, `rel="sponsored nofollow noopener noreferrer"`);

  const related = relatedSection(comparison);
  const existingRelatedPattern = /\n\s*<section class="section related-comparisons"[\s\S]*?<\/section>\n\s*<section class="section" aria-labelledby="final-cta-title">/;
  if (existingRelatedPattern.test(html)) {
    html = html.replace(existingRelatedPattern, `\n${related}\n\n      <section class="section" aria-labelledby="final-cta-title">`);
  } else {
    html = html.replace(/\n\s*<section class="section" aria-labelledby="final-cta-title">/, `\n${related}\n\n      <section class="section" aria-labelledby="final-cta-title">`);
  }

  await writeFile(filePath, html);
}

function setMeta(html, tagPattern, tag) {
  const headEnd = html.indexOf('</head>');

  if (headEnd !== -1) {
    const head = html.slice(0, headEnd);
    const rest = html.slice(headEnd);
    if (tagPattern.test(head)) {
      return `${head.replace(tagPattern, tag).replace(/\s*$/, '\n')}${rest}`;
    }
    return `${head}\n  ${tag}\n${rest.replace(tagPattern, '')}`;
  }

  if (tagPattern.test(html)) {
    return html.replace(tagPattern, tag);
  }

  return html;
}

function setStaticSocial(html, pageType = 'website') {
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
  const description = html.match(/<meta name="description" content="([^"]*)">/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)">/)?.[1];
  const image = site.socialImage ?? comparisons.find((comparison) => comparison.image)?.image;

  if (!title || !description || !canonical || !image) return html;

  html = setMeta(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${htmlEscape(title)}">`);
  html = setMeta(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${htmlEscape(description)}">`);
  html = setMeta(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${pageType}">`);
  html = setMeta(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
  html = setMeta(html, /<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="${site.name}">`);
  html = setMeta(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${image.url}">`);
  html = setMeta(html, /<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="${image.width}">`);
  html = setMeta(html, /<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="${image.height}">`);
  html = setMeta(html, /<meta name="twitter:card" content="[^"]*">/, '<meta name="twitter:card" content="summary_large_image">');

  return html;
}

async function updateStaticPages() {
  const pages = [
    ['index.html', 'website'],
    ['comparisons/index.html', 'website'],
    ['about/index.html', 'website'],
    ['affiliate-disclosure/index.html', 'website'],
    ['privacy/index.html', 'website'],
    ['contact/index.html', 'website']
  ];

  for (const [file, type] of pages) {
    const filePath = `${root}/${file}`;
    const html = await readFile(filePath, 'utf8');
    await writeFile(filePath, setStaticSocial(html, type));
  }
}

for (const comparison of comparisons) {
  await updatePage(comparison);
}
await updateStaticPages();

console.log(`Applied SEO hygiene to ${comparisons.length} comparison pages.`);
