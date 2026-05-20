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

function relatedFor(comparison) {
  const sameHome = new Set([
    'Can openers',
    'Food processors',
    'Blenders',
    'Espresso machines'
  ]);
  const powerTools = new Set(['Cordless drills', 'Table saws']);
  const homeComfort = new Set(['Air purifiers', 'Light therapy', 'Hair dryers']);
  const electronics = new Set(['Portable power stations', 'Turntables', 'Cameras', 'Telescopes', 'Portable SSDs']);
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

  html = html
    .replace(/<meta property="article:published_time" content="[^"]*">/, `<meta property="article:published_time" content="${dt}">`)
    .replace(/<meta property="article:modified_time" content="[^"]*">/, `<meta property="article:modified_time" content="${dt}">`)
    .replaceAll(`"datePublished": "${comparison.date}"`, `"datePublished": "${dt}"`)
    .replaceAll(`"dateModified": "${comparison.date}"`, `"dateModified": "${dt}"`);

  if (fallbackAlt && comparison.image?.src) {
    const imagePattern = new RegExp(`(<img src="${comparison.image.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" alt=")[^"]*(")`);
    html = html.replace(imagePattern, `$1${htmlEscape(fallbackAlt)}$2`);
  } else {
    html = html.replace(/(<figure class="hero-media">\s*<img src="\/images\/[^"]+" alt=")([^"]*)(")/, (_match, start, currentAlt, end) => {
      return `${start}${htmlEscape(strengthenAlt(currentAlt, comparison))}${end}`;
    });
  }

  const related = relatedSection(comparison);
  const existingRelatedPattern = /\n\s*<section class="section related-comparisons"[\s\S]*?<\/section>\n\s*<section class="section" aria-labelledby="final-cta-title">/;
  if (existingRelatedPattern.test(html)) {
    html = html.replace(existingRelatedPattern, `\n${related}\n\n      <section class="section" aria-labelledby="final-cta-title">`);
  } else {
    html = html.replace(/\n\s*<section class="section" aria-labelledby="final-cta-title">/, `\n${related}\n\n      <section class="section" aria-labelledby="final-cta-title">`);
  }

  await writeFile(filePath, html);
}

for (const comparison of comparisons) {
  await updatePage(comparison);
}

console.log(`Applied SEO hygiene to ${comparisons.length} comparison pages.`);
