import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { comparisons, comparisonUrl, pageFileForComparison } from '../data/site-content.mjs';

const root = process.cwd();
const slug = process.argv[2] || comparisons[0]?.slug;
const fileOverrideIndex = process.argv.indexOf('--file');
const fileOverride = fileOverrideIndex >= 0 ? process.argv[fileOverrideIndex + 1] : null;
const comparison = comparisons.find((candidate) => candidate.slug === slug);

if (!comparison) {
  console.error(`Comparison identity audit failed: unknown slug "${slug || ''}".`);
  process.exit(1);
}

const pagePath = fileOverride || pageFileForComparison(comparison);
let html;
try {
  html = await readFile(pagePath, 'utf8');
} catch (error) {
  console.error(`Comparison identity audit failed: could not read ${pagePath}: ${error.message}`);
  process.exit(1);
}

const failures = [];
const expectedUrl = comparisonUrl(comparison);

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalize(value) {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requireMatch(label, pattern, expected) {
  const match = html.match(pattern);
  const actual = match ? normalize(match[1]) : '';
  if (actual !== expected) failures.push(`${label} expected "${expected}" but found "${actual || 'missing'}"`);
}

requireMatch('canonical URL', /<link\s+rel="canonical"\s+href="([^"]+)"/i, expectedUrl);
requireMatch('Open Graph URL', /<meta\s+property="og:url"\s+content="([^"]+)"/i, expectedUrl);
requireMatch('visible H1', /<h1\b[^>]*>([\s\S]*?)<\/h1>/i, comparison.title);

const mainStart = html.search(/<main\b[^>]*id="main"[^>]*>/i);
const relatedStart = html.indexOf('<!-- related-comparisons:start');
const mainEnd = html.search(/<\/main>/i);
if (mainStart < 0) {
  failures.push('missing <main id="main">');
}
const coreEnd = relatedStart > mainStart ? relatedStart : mainEnd;
if (mainStart >= 0 && coreEnd <= mainStart) {
  failures.push('could not isolate the pre-related comparison body');
}
const coreHtml = mainStart >= 0 && coreEnd > mainStart ? html.slice(mainStart, coreEnd) : '';
const coreText = normalize(coreHtml).toLowerCase();

const titleSides = comparison.title.split(/\s+vs\s+/i);
if (titleSides.length !== 2) {
  failures.push(`comparison title must contain one "vs": ${comparison.title}`);
} else {
  const generic = new Set(['the', 'and', 'with', 'versus', 'edition', 'series', 'model']);
  for (const side of titleSides) {
    const candidates = side.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [];
    const ranked = candidates
      .filter((token) => token.length >= 3 && !generic.has(token.toLowerCase()))
      .sort((a, b) => {
        const score = (token) => (/[0-9]/.test(token) ? 100 : 0) + (/-/.test(token) ? 30 : 0) + token.length;
        return score(b) - score(a);
      });
    const identity = ranked[0];
    if (!identity) {
      failures.push(`could not derive a distinctive identity token from title side "${side}"`);
      continue;
    }
    const count = coreText.split(identity.toLowerCase()).length - 1;
    if (count < 2) failures.push(`pre-related body mentions identity token "${identity}" only ${count} time(s)`);
  }
}

const jsonBlocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
const jsonNodes = [];
for (const [index, match] of jsonBlocks.entries()) {
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) jsonNodes.push(...parsed);
    else if (Array.isArray(parsed['@graph'])) jsonNodes.push(...parsed['@graph']);
    else jsonNodes.push(parsed);
  } catch (error) {
    failures.push(`JSON-LD block ${index + 1} does not parse: ${error.message}`);
  }
}
if (jsonBlocks.length === 0) failures.push('missing JSON-LD');

const nodeByType = (type) => jsonNodes.find((node) => node?.['@type'] === type);
const webPage = nodeByType('WebPage');
if (webPage?.url !== expectedUrl) failures.push(`JSON-LD WebPage.url does not match ${expectedUrl}`);
const breadcrumb = nodeByType('BreadcrumbList');
const breadcrumbItems = breadcrumb?.itemListElement || [];
if (breadcrumbItems.at(-1)?.item !== expectedUrl) failures.push(`JSON-LD breadcrumb destination does not match ${expectedUrl}`);
const article = nodeByType('Article');
if (!normalize(article?.headline || '').toLowerCase().includes(comparison.title.toLowerCase())) {
  failures.push(`JSON-LD Article.headline does not identify "${comparison.title}"`);
}

const jsonText = JSON.stringify(jsonNodes).toLowerCase();
for (const candidate of comparisons) {
  if (candidate.slug === comparison.slug) continue;
  const candidateTitle = candidate.title.toLowerCase();
  if (coreText.includes(candidate.slug) || jsonText.includes(candidate.slug)) {
    failures.push(`found another registered comparison slug: ${candidate.slug}`);
  }
  if (candidateTitle.length >= 12 && (coreText.includes(candidateTitle) || jsonText.includes(candidateTitle))) {
    failures.push(`found another registered comparison title: ${candidate.title}`);
  }
}

const faqNode = nodeByType('FAQPage');
const schemaFaqs = (faqNode?.mainEntity || []).map((item) => ({
  question: normalize(item?.name || ''),
  answer: normalize(item?.acceptedAnswer?.text || '')
}));
const visibleFaqs = [...coreHtml.matchAll(/<details\b[^>]*class="[^"]*faq-item[^"]*"[^>]*>[\s\S]*?<summary>([\s\S]*?)<span\b[^>]*class="[^"]*faq-icon[^"]*"[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/summary>[\s\S]*?<div\b[^>]*class="[^"]*faq-body[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/details>/gi)].map((match) => ({
  question: normalize(match[1]),
  answer: normalize(match[2])
}));
if (JSON.stringify(schemaFaqs) !== JSON.stringify(visibleFaqs)) {
  failures.push(`FAQ schema/body mismatch (schema ${schemaFaqs.length}, visible ${visibleFaqs.length})`);
}

const imagePath = comparison.image?.src ? `${root}${comparison.image.src}` : '';
if (!imagePath || !existsSync(imagePath)) failures.push(`missing comparison image asset: ${imagePath || 'unset'}`);

if (failures.length > 0) {
  console.error(`Comparison identity audit FAILED for ${comparison.slug}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Comparison identity audit PASS: ${comparison.slug}`);
console.log(`- canonical, Open Graph URL, H1, JSON-LD, FAQ parity, body identity, residue, and image checks passed`);
