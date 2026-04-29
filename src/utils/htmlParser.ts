/** Extract plain text from HTML: remove scripts, styles, tags, decode entities, normalize whitespace. */
function htmlToPlainText(html: string): string {

  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Convert headings to markdown style before stripping remaining tags
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  s = s.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');

  s = s.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');
  // Block elements → newlines
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<\/li>/gi, '\n');
  s = s.replace(/<\/tr>/gi, '\n');
  // Preserve pre/code formatting
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&#x2F;/g, '/');
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();

  return s;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
}

/** Extract all <a href="..."> links from HTML. Returns deduplicated list of {url, text}. */
function extractLinks(html: string): Array<{ url: string; text: string }> {
  const seen = new Set<string>();
  const links: Array<{ url: string; text: string }> = [];
  const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim();
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    links.push({ url, text: text || url });
  }
  return links;
}

/** Extract <meta name="description" content="..."> from HTML. */
function extractMetaDescription(html: string): string {
  const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return m ? m[1].trim() : '';
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^fc00:/i.test(h) || /^fe80:/i.test(h)) return true;
  return false;
}

export {
  htmlToPlainText,
  extractTitle,
  extractLinks,
  extractMetaDescription,
  isPrivateHost,
};