/**
 * Parse YAML frontmatter (text between `---` delimiters) from a markdown file.
 * Returns { attributes, body } where attributes is a flat key-value map,
 * and body is the markdown content after the frontmatter.
 */
function parseFrontmatter(raw: string): { attributes: Record<string, any>; body: string } {
  const lines = raw.split(/\x0d?\x0a/);
  const attrs: Record<string, any> = {};
  let bodyStart = 0;

  if (lines.length > 0 && lines[0].trim() === '---') {
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== -1) {
      // Parse YAML-like lines between the two --- markers
      for (let i = 1; i < endIdx; i++) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          let value: any = line.slice(colonIdx + 1).trim();
          // Strip surrounding quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          // Handle array values like [a, b, c]
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            const inner = value.slice(1, -1);
            value = inner.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          }
          attrs[key] = value;
        }
      }
      bodyStart = endIdx + 1;
    }
  }

  const body = lines.slice(bodyStart).join('\x0a').trim();
  return { attributes: attrs, body };
}

export { parseFrontmatter };