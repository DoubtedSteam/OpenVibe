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
