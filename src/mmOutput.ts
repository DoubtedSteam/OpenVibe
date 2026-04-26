export type XmlContentType = 'edit' | 'shell';

export interface XmlContentItem {
  type: XmlContentType;
  /** Raw extracted payload (no trimming, preserves exact bytes between tags). */
  payload: string;
}

/**
 * Extracts ALL <edit-content>...</edit-content> and <shell-content>...</shell-content>
 * tags from the visible content text, in document order.
 * Used to supply raw payloads for tool calls that carry large text data
 * (edit.newContent, run_shell_command.command), avoiding JSON escaping issues.
 */
export function extractXmlContents(text: string | null | undefined): XmlContentItem[] {
  const src = String(text ?? '');
  if (!src.trim()) {
    return [];
  }

  const results: XmlContentItem[] = [];
  const tagRe = /<\s*(edit-content|shell-content)\s*>([\s\S]*?)<\s*\/\s*(edit-content|shell-content)\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(src)) !== null) {
    const openTag = match[1].toLowerCase();
    const closeTag = (match[3] ?? '').toLowerCase();
    // Sanity: opening and closing tags should match
    if (openTag !== closeTag) {
      continue;
    }
    const type = openTag === 'edit-content' ? 'edit' as XmlContentType : 'shell' as XmlContentType;
    results.push({ type, payload: match[2] });
  }


  return results;
}

/**
 * Extract <edit-content>/<shell-content> tags from a raw JSON tool-call arguments string.
 * The tags sit inside JSON string values (e.g. "newContent":"<edit-content>...payload...</edit-content>").
 * Because the payload has been JSON-encoded, we decode it back via JSON.parse so the caller
 * receives the original unescaped text — the same as if it came from plain content text.
 */
export function extractAndDecodeXmlFromJson(rawJson: string): XmlContentItem[] {
  const results: XmlContentItem[] = [];

  // Match "newContent": "<edit-content>...payload...</edit-content>"
  // or "command": "<shell-content>...payload...</shell-content>"
  // The capture group grabs everything between the tags (still JSON-encoded).
  const re = /"(?:newContent|command)"\s*:\s*"<(edit-content|shell-content)>([\s\S]*?)<\/(edit-content|shell-content)>"/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(rawJson)) !== null) {
    const openTag = match[1].toLowerCase();
    const jsonPayload = match[2]; // still JSON-encoded
    const closeTag = (match[3] ?? '').toLowerCase();
    if (openTag !== closeTag) continue;

    // Decode JSON escaping back to raw text.
    let decoded = '';
    try {
      decoded = JSON.parse('"' + jsonPayload + '"');
    } catch {
      // If decoding fails, fall back to the JSON-encoded literal.
      decoded = jsonPayload;
    }

    const type = openTag === 'edit-content' ? 'edit' as XmlContentType : 'shell' as XmlContentType;
    results.push({ type, payload: decoded });
  }

  return results;
}
