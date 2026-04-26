export type XmlContentType = 'edit' | 'shell';

export interface XmlContentItem {
  type: XmlContentType;
  /** Raw extracted payload (no trimming, preserves exact bytes between tags). */
  payload: string;
}

export interface XmlPlaceholderResult {
  /** JSON-parseable arguments string with XML-tagged regions replaced by safe placeholders. */
  sanitizedArgs: string;
  /** Map of placeholder → raw payload (JSON-unescaped, ready to write to disk). */
  placeholderMap: Map<string, string>;
}

/**
 * Process a raw JSON tool-call arguments string BEFORE JSON.parse.
 *
 * Scans for {@code "newContent":"<edit-content>...payload...</edit-content>"} and
 * {@code "command":"<shell-content>...payload...</shell-content>"} patterns,
 * extracts the raw payload between tags (still JSON-encoded at this point),
 * replaces the whole tagged region with a safe placeholder, and decodes the
 * payload back to its original text.
 *
 * The caller JSON.parses the sanitized args, then swaps placeholders back to
 * the decoded payloads before writing to disk.
 */
export function extractXmlPlaceholders(rawArgs: string): XmlPlaceholderResult {
  const placeholderMap = new Map<string, string>();

  // Match "newContent" or "command" field whose value starts with <edit-content> / <shell-content>
  const re = /"(newContent|command)"\s*:\s*"<(edit-content|shell-content)>([\s\S]*?)<\/(edit-content|shell-content)>"/gi;

  let idx = 0;
  const sanitizedArgs = rawArgs.replace(re, (full, fieldName, openTag, rawPayload, closeTag) => {
    if (openTag.toLowerCase() !== closeTag.toLowerCase()) return full;

    // Decode JSON string escaping (\\n → newline, \\\\ → \\, etc.)
    let decoded = '';
    try {
      decoded = JSON.parse('"' + rawPayload + '"');
    } catch {
      decoded = rawPayload;
    }

    const placeholder = `__XML_PH_${idx}__`;
    placeholderMap.set(placeholder, decoded);
    idx++;
    return '"' + fieldName + '":"' + placeholder + '"';
  });

  return { sanitizedArgs, placeholderMap };
}

/**
 * Apply placeholder replacements inside a JSON-parsed args object.
 * Walks the object shallowly and replaces known placeholders in string values.
 * Returns the same object (mutated in place).
 */
export function applyXmlPlaceholders(
  args: Record<string, unknown>,
  placeholderMap: Map<string, string>
): Record<string, unknown> {
  for (const key of Object.keys(args)) {
    const val = args[key];
    if (typeof val === 'string' && placeholderMap.has(val)) {
      args[key] = placeholderMap.get(val);
    }
  }
  return args;
}