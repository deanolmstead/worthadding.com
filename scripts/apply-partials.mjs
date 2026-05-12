import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const partialDir = path.join(root, 'partials');

const pages = [
  { file: 'index.html', header: 'header-home.html' },
  { file: 'comparisons/index.html', header: 'header-utility.html' },
  { file: 'spalding-momentous-vs-lifetime-90600/index.html', header: 'header-article-guide.html' },
  { file: 'dewalt-dwe7491rs-vs-skil-ts6307-00/index.html', header: 'header-article-guide.html' },
  { file: 'breville-dual-boiler-vs-rancilio-silvia-pro-x/index.html', header: 'header-article-guide.html' },
  { file: 'vitamix-ascent-x5-vs-breville-super-q/index.html', header: 'header-article-guide.html' },
  { file: 'hooga-hg300-vs-bestqool-bq60-red-light-therapy-panel/index.html', header: 'header-article.html' },
  { file: 'fujifilm-gfx100-ii-vs-gfx100s-ii/index.html', header: 'header-article-guide.html' },
  { file: 'vaonis-vespera-pro-vs-unistellar-odyssey-pro/index.html', header: 'header-article.html' },
  { file: 'about/index.html', header: 'header-utility.html' },
  { file: 'affiliate-disclosure/index.html', header: 'header-utility.html' },
  { file: 'privacy/index.html', header: 'header-utility.html' },
  { file: 'contact/index.html', header: 'header-utility.html' }
];

const start = (name, source) => `<!-- ${name}:start ${source} -->`;
const end = (name) => `<!-- ${name}:end -->`;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wrap(name, source, content) {
  return `${start(name, source)}\n${content.trim()}\n${end(name)}`;
}

function replaceManagedBlock(html, name, source, content, fallbackPattern) {
  const managed = new RegExp(
    `<!-- ${escapeRegExp(name)}:start [^>]*-->[\\s\\S]*?<!-- ${escapeRegExp(name)}:end -->`
  );
  const replacement = wrap(name, source, content);

  if (managed.test(html)) {
    return html.replace(managed, replacement);
  }

  if (!fallbackPattern.test(html)) {
    throw new Error(`Could not find ${name} block to replace.`);
  }

  return html.replace(fallbackPattern, replacement);
}

function replaceOrInsertManagedBlockAfter(html, name, source, content, afterPattern, legacyNames = []) {
  const managed = new RegExp(
    `<!-- ${escapeRegExp(name)}:start [^>]*-->[\\s\\S]*?<!-- ${escapeRegExp(name)}:end -->`
  );
  const replacement = wrap(name, source, content);

  if (managed.test(html)) {
    return html.replace(managed, replacement);
  }

  for (const legacyName of legacyNames) {
    const legacy = new RegExp(
      `<!-- ${escapeRegExp(legacyName)}:start [^>]*-->[\\s\\S]*?<!-- ${escapeRegExp(legacyName)}:end -->`
    );

    if (legacy.test(html)) {
      return html.replace(legacy, replacement);
    }
  }

  if (!afterPattern.test(html)) {
    throw new Error(`Could not find insertion point for ${name} block.`);
  }

  return html.replace(afterPattern, (match) => `${match}\n${replacement}`);
}

function replaceOrInsertManagedBlockBefore(html, name, source, content, beforePattern) {
  const managed = new RegExp(
    `<!-- ${escapeRegExp(name)}:start [^>]*-->[\\s\\S]*?<!-- ${escapeRegExp(name)}:end -->`
  );
  const replacement = wrap(name, source, content);

  if (managed.test(html)) {
    return html.replace(managed, replacement);
  }

  if (!beforePattern.test(html)) {
    throw new Error(`Could not find insertion point for ${name} block.`);
  }

  return html.replace(beforePattern, `${replacement}\n$&`);
}

async function loadPartial(name) {
  return readFile(path.join(partialDir, name), 'utf8');
}

const footer = await loadPartial('footer.html');
const siteIcons = await loadPartial('site-icons.html');
const signupStyle = await loadPartial('email-signup-style.html');
const signup = await loadPartial('email-signup.html');
const footerSignup = signup.replace('class="signup-banner"', 'class="signup-banner signup-banner--footer"');

for (const page of pages) {
  const fullPath = path.join(root, page.file);
  const header = await loadPartial(page.header);
  let html = await readFile(fullPath, 'utf8');

  html = replaceOrInsertManagedBlockBefore(
    html,
    'site-icons',
    'site-icons.html',
    siteIcons,
    /<\/head>/
  );

  html = replaceOrInsertManagedBlockBefore(
    html,
    'email-signup-style',
    'email-signup-style.html',
    signupStyle,
    /<\/head>/
  );

  html = replaceManagedBlock(
    html,
    'site-header',
    page.header,
    header,
    /<header class="nav">[\s\S]*?<\/header>/
  );

  html = replaceOrInsertManagedBlockAfter(
    html,
    'email-signup-top',
    'email-signup.html',
    signup,
    /<!-- site-header:start [^>]*-->[\s\S]*?<!-- site-header:end -->/,
    ['email-signup']
  );

  html = replaceOrInsertManagedBlockBefore(
    html,
    'email-signup-footer',
    'email-signup.html',
    footerSignup,
    /<!-- site-footer:start [^>]*-->|<footer class="footer">/
  );

  html = replaceManagedBlock(
    html,
    'site-footer',
    'footer.html',
    footer,
    /<footer class="footer">[\s\S]*?<\/footer>/
  );

  await writeFile(fullPath, html);
  console.log(`Applied partials to ${page.file}`);
}
