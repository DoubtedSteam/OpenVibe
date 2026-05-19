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
 * 路线B：AI 在 visible response 中使用 <edit-content> / <shell-content> 标签，
 * 实际内容由 MessageHandler 从 response.content 提取后直接注入 args。
 * 因此 arguments JSON 字符串中不再包含 XML 标签，无需占位符替换。
 * 此函数保留接口签名以兼容调用方，但直接返回输入原串和空 Map。
 */
export function extractXmlPlaceholders(rawArgs: string): XmlPlaceholderResult {
  return { sanitizedArgs: rawArgs, placeholderMap: new Map() };
}

/**
 * 路线B 不再需要占位符替换，此函数保留仅为兼容性。
 */
export function applyXmlPlaceholders(
  args: Record<string, unknown>,
  _placeholderMap: Map<string, string>
): Record<string, unknown> {
  return args;
}
