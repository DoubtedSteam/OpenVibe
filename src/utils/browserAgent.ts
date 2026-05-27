
import { type Page } from 'playwright';
import { sendChatMessage } from '../api';
import { BrowserManager } from './browserManager';
import type {
  ApiConfig,
  BrowserAgentAction,
  BrowserTaskParams,
  BrowserTaskResult,
  ChatMessage,
  PageElement,
  PageState,
} from '../types';

// ─── System Prompt for the Browser Sub-Agent ────────────────────────────────

const AGENT_SYSTEM_PROMPT = `你是一个**浏览器操作专家**。你的任务是通过一系列浏览器操作来完成用户交给你的任务。

## 可用操作

每次回复必须输出一个 JSON 对象（不要输出其他文字），格式如下：

### 执行操作
{
  "thought": "简要说明这一步要做什么以及为什么",
  "action": {
    "type": "<操作类型>",
    // 参数见下方
  }
}

### 任务完成（不再需要更多操作时）
{
  "thought": "简要总结完成情况",
  "summary": "给用户的一句话结果摘要",
  "done": true
}

### 操作类型及参数

1. **navigate** — 打开一个网页
   { "type": "navigate", "url": "https://..." }

2. **fill** — 在输入框中填入文本
   { "type": "fill", "selector": "CSS选择器", "text": "要填入的文字" }

3. **click** — 点击一个元素
   { "type": "click", "selector": "CSS选择器" }

4. **getText** — 获取当前页面或指定元素的文本
   { "type": "getText" }
   { "type": "getText", "selector": "CSS选择器" }

5. **getPageInfo** — 获取当前页面的完整状态（URL、标题、可交互元素、链接）
   { "type": "getPageInfo" }

6. **wait** — 等待指定毫秒数（页面加载/动画）
   { "type": "wait", "ms": 2000 }

7. **waitForSelector** — 等待某个元素出现
   { "type": "waitForSelector", "selector": "CSS选择器", "timeout": 10000 }

## 指导原则

1. **先规划后行动**：先使用 navigate 打开目标网站，然后观察页面结构（getPageInfo），再做下一步。
2. **使用正确的选择器**：通过 getPageInfo 获取页面元素后，使用其 selector 字段定位。
3. **优先使用语义选择器**：如 #id、input[name="xx"]、button[type="submit"] 等。
4. **中文网页优先**：对于百度等中文网站，使用中文关键词搜索。
5. **错误处理**：如果操作失败，尝试不同的选择器或方法，最多重试 2 次。
6. **完成任务后立即结束**：获取到所需信息后，输出 done:true 并给出 summary。
7. **不要过度浏览**：只做完成任务必需的操作，获取到目标信息就结束。
8. **当前页面可能没有所需信息**：如果你已经在一个页面上但内容不相关，先 navigate 到正确的 URL。

## 首次操作提示

- 如果用户给出了明确的 URL，先用 navigate 打开它。
- 如果用户只说了搜索内容没给 URL，默认使用百度 (https://www.baidu.com)。
- 如果用户明确提到其他搜索引擎，如 Google (https://www.google.com)、Bing (https://www.bing.com) 等，使用对应的搜索引擎。`;

// ─── Action Execution ───────────────────────────────────────────────────────

/** Execute a single BrowserAgentAction and return structured result. */
async function executeAction(
  action: BrowserAgentAction,
  page: Page,
  signal?: AbortSignal
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    signal?.throwIfAborted();

    switch (action.type) {
      case 'navigate': {
        await BrowserManager.navigate(action.url);
        return { success: true, data: { url: action.url } };
      }

      case 'fill': {
        try {
          await page.fill(action.selector, action.text, { timeout: 5000 });
        } catch {
          // Fallback: force fill (bypass visibility checks)
          await page.fill(action.selector, action.text, { force: true, timeout: 5000 });
        }
        return { success: true, data: { selector: action.selector, filled: action.text } };
      }

      case 'click': {
        try {
          await page.click(action.selector, { timeout: 5000 });
        } catch {
          // Force click if standard click fails (visibility issues)
          await page.click(action.selector, { force: true, timeout: 5000 });
        }
        // Small wait for any navigation triggered by click
        await page.waitForTimeout(1500);
        return { success: true, data: { selector: action.selector, clicked: true } };
      }

      case 'getText': {
        if (action.selector) {
          const el = await page.$(action.selector);
          if (!el) {
            return { success: false, error: `Element not found: ${action.selector}` };
          }
          const text = await el.textContent();
          return { success: true, data: { text: (text || '').trim() } };
        }
        const text = await page.evaluate(() => document.body?.innerText || '');
        return { success: true, data: { text: text.trim().slice(0, 10000) } };
      }

      case 'getPageInfo': {
        const state = await capturePageState(page);
        return { success: true, data: state };
      }

      case 'screenshot': {
        const dataUri = await BrowserManager.screenshot();
        return { success: true, data: { screenshot: dataUri } };
      }

      case 'wait': {
        await page.waitForTimeout(action.ms);
        return { success: true };
      }

      case 'waitForSelector': {
        await page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
        return { success: true, data: { selector: action.selector, appeared: true } };
      }

      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}` };
    }
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message?.includes('stopped by user')) {
      throw e; // Re-throw abort errors
    }
    return { success: false, error: e.message || String(e) };
  }
}

// ─── Page State Capture ─────────────────────────────────────────────────────

/** Extract interactive elements from the page. */
async function extractElements(page: Page): Promise<PageElement[]> {
  return page.evaluate(() => {
    const elements: PageElement[] = [];
    const seen = new Set<string>();

    // Generate a unique CSS selector for an element
    function getSelector(el: Element): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      // Try to use name/type attributes for inputs
      const htmlEl = el as HTMLElement;
      const tag = htmlEl.tagName.toLowerCase();
      if (tag === 'input' || tag === 'button' || tag === 'textarea') {
        const parts = [tag];
        const type = htmlEl.getAttribute('type');
        if (type) parts.push(`[type="${type}"]`);
        const name = htmlEl.getAttribute('name');
        if (name) parts.push(`[name="${CSS.escape(name)}"]`);
        const placeholder = htmlEl.getAttribute('placeholder');
        if (placeholder) parts.push(`[placeholder="${CSS.escape(placeholder)}"]`);
        // Add aria-label if available
        const ariaLabel = htmlEl.getAttribute('aria-label');
        if (ariaLabel) parts.push(`[aria-label="${CSS.escape(ariaLabel)}"]`);
        return parts.join('');
      }
      // For <a> tags with text content
      if (tag === 'a') {
        const text = (htmlEl.textContent || '').trim().slice(0, 30);
        if (text) return `a:has-text("${CSS.escape(text)}")`;
      }
      // Fallback: use tag + nth-child path (simplified)
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName
        );
        const idx = siblings.indexOf(el) + 1;
        return `${tag}:nth-child(${idx})`;
      }
      return tag;
    }

    const candidates = document.querySelectorAll(
      'input, button, textarea, select, a[href], [role="button"], [role="searchbox"], [contenteditable="true"]'
    );

    for (const el of Array.from(candidates)) {
      const htmlEl = el as HTMLElement;
      const tag = htmlEl.tagName.toLowerCase();
      const selector = getSelector(el);

      // Deduplicate by selector
      if (seen.has(selector)) continue;
      seen.add(selector);

      const elem: PageElement = {
        tag,
        type: htmlEl.getAttribute('type') || undefined,
        name: htmlEl.getAttribute('name') || undefined,
        id: el.id || undefined,
        placeholder: htmlEl.getAttribute('placeholder') || undefined,
        text: (htmlEl.textContent || '').trim().slice(0, 100) || undefined,
        href: htmlEl.getAttribute('href') || undefined,
        selector,
      };

      elements.push(elem);
      if (elements.length >= 50) break; // Limit to 50 elements
    }

    return elements;
  });
}

/** Extract links from the page. */
async function extractLinks(page: Page): Promise<Array<{ url: string; text: string }>> {
  return page.evaluate(() => {
    const links: Array<{ url: string; text: string }> = [];
    const seen = new Set<string>();
    const anchors = document.querySelectorAll('a[href]');
    for (const a of Array.from(anchors)) {
      const href = (a as HTMLAnchorElement).href?.trim();
      if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const text = (a.textContent || '').trim().slice(0, 100) || href;
      links.push({ url: href, text });
      if (links.length >= 100) break;
    }
    return links;
  });
}

/** Capture full page state. */
async function capturePageState(page: Page): Promise<PageState> {
  const url = page.url();
  const title = await page.title();
  const [elements, links] = await Promise.all([
    extractElements(page),
    extractLinks(page),
  ]);

  // Get plain text content
  let content = await page.evaluate(() => document.body?.innerText || '');
  content = content.trim().slice(0, 10000);

  return { url, title, content, elements, links };
}

// ─── LLM Call ───────────────────────────────────────────────────────────────

/** Call the LLM for one agent turn, return the raw JSON string response. */
async function callAgentLlm(
  messages: ChatMessage[],
  apiConfig: ApiConfig,
  signal?: AbortSignal
): Promise<string> {
  const res = await sendChatMessage(messages, apiConfig, undefined, signal, {
    timeoutMs: 120000,
  });
  return res.content?.trim() || '';
}

// ─── JSON Parsing ───────────────────────────────────────────────────────────

/** Extract the first JSON object from text (lenient parser). */
function extractJson(text: string): unknown {
  const t = text.trim();
  // Try direct parse first
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  // Try to find { ... } block
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error(`Failed to parse agent output as JSON: ${t.slice(0, 200)}`);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Run a browser sub-agent task.
 *
 * The agent uses its own LLM loop to plan and execute browser actions
 * (navigate, fill, click, getText, etc.) via Playwright, then returns
 * the final result along with a full action log.
 *
 * @param params    Task description and options.
 * @param apiConfig API configuration (same provider as the main LLM).
 * @param signal    Optional AbortSignal to cancel the task.
 * @returns         Structured result with action log and final page state.
 */
export async function runBrowserTask(
  params: BrowserTaskParams,
  apiConfig: ApiConfig,
  signal?: AbortSignal
): Promise<BrowserTaskResult> {
  const startTime = Date.now();
  const timeout = params.timeoutMs ?? 600_000;
  const maxSteps = params.maxSteps ?? 50;
  const actionLog: BrowserTaskResult['actionLog'] = [];

  // Build initial user message
  let userContent = `## 任务\n${params.task}\n`;
  if (params.url) {
    userContent += `\n## 起始URL\n${params.url}`;
  }
  userContent += '\n\n请开始执行。首先用 getPageInfo 查看初始页面状态，然后规划后续步骤。';

  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  try {
    for (let step = 0; step < maxSteps; step++) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        return {
          success: false,
          summary: '任务超时',
          pageState: await getCurrentPageStateSafe(),
          actionLog,
          error: `执行超过 ${timeout / 1000} 秒限制`,
        };
      }
      signal?.throwIfAborted();

      // Call LLM to decide next action
      const raw = await callAgentLlm(messages, apiConfig, signal);
      const parsed = extractJson(raw) as Record<string, unknown>;

      // Check for "done" signal
      if (parsed.done === true) {
        const summary = String(parsed.summary || parsed.thought || '任务完成');
        return {
          success: true,
          summary,
          pageState: await getCurrentPageStateSafe(),
          actionLog,
        };
      }

      // Parse action
      const actionRaw = parsed.action as Record<string, unknown> | undefined;
      if (!actionRaw || !actionRaw.type) {
        // Invalid response from LLM, ask it to retry
        messages.push({
          role: 'user',
          content: `你的回复无法解析为有效的操作。请严格按照格式输出 JSON，必须包含 "action" 对象且包含 "type" 字段。可用类型: navigate, fill, click, getText, getPageInfo, wait, waitForSelector`,
        });
        continue;
      }

      const action: BrowserAgentAction = actionRaw as BrowserAgentAction;

      // Execute the action
      const page = await BrowserManager.getPage();
      const result = await executeAction(action, page, signal);

      actionLog.push({
        action,
        result: result.success ? 'success' : 'error',
        data: result.data,
        error: result.error,
      });

      // Add assistant response + tool result to message history
      const assistantMsg = `## 步骤 ${step + 1}\n\n思考: ${parsed.thought || ''}\n\n操作: ${JSON.stringify(action)}`;
      messages.push({ role: 'assistant', content: assistantMsg });

      let resultMsg = `## 操作结果\n\n`;
      if (result.success) {
        resultMsg += `状态: 成功\n`;

        // For getPageInfo and getText, include the data in the message
        if (action.type === 'getPageInfo' && result.data) {
          const state = result.data as PageState;
          resultMsg += `URL: ${state.url}\n标题: ${state.title}\n\n`;

          if (state.elements.length > 0) {
            resultMsg += `### 可交互元素 (${state.elements.length}个)\n`;
            for (const el of state.elements.slice(0, 30)) {
              resultMsg += `- <${el.tag}`;
              if (el.type) resultMsg += ` type="${el.type}"`;
              if (el.name) resultMsg += ` name="${el.name}"`;
              if (el.id) resultMsg += ` id="${el.id}"`;
              if (el.placeholder) resultMsg += ` placeholder="${el.placeholder}"`;
              resultMsg += `>`;
              if (el.text) resultMsg += ` "${el.text.slice(0, 60)}"`;
              resultMsg += ` → 选择器: \`${el.selector}\`\n`;
            }
          }

          if (state.links.length > 0) {
            resultMsg += `\n### 链接 (${state.links.length}个)\n`;
            for (const link of state.links.slice(0, 15)) {
              resultMsg += `- [${link.text}](${link.url})\n`;
            }
          }

          if (state.content) {
            resultMsg += `\n### 页面内容\n${state.content.slice(0, 3000)}\n`;
          }
        } else if (action.type === 'getText' && result.data) {
          const d = result.data as { text: string };
          resultMsg += `\n${d.text.slice(0, 3000)}`;
        } else if (result.data) {
          resultMsg += `\n${JSON.stringify(result.data, null, 2).slice(0, 1000)}`;
        }
      } else {
        resultMsg += `状态: 失败\n错误: ${result.error}\n\n请尝试其他操作或选择器。`;
      }

      messages.push({ role: 'user', content: resultMsg });
    }

    // Max steps reached
    return {
      success: false,
      summary: `已达到最大步骤数 (${maxSteps})`,
      pageState: await getCurrentPageStateSafe(),
      actionLog,
      error: `已执行 ${maxSteps} 步但任务未完成`,
    };
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message?.includes('stopped by user')) {
      return {
        success: false,
        summary: '任务被用户中止',
        pageState: await getCurrentPageStateSafe(),
        actionLog,
        error: 'Operation stopped by user.',
      };
    }
    return {
      success: false,
      summary: '执行出错',
      pageState: await getCurrentPageStateSafe(),
      actionLog,
      error: e.message || String(e),
    };
  }
}

/** Safely get current page state, returning undefined if unavailable. */
async function getCurrentPageStateSafe(): Promise<PageState | undefined> {
  try {
    const page = await BrowserManager.getPage();
    if (page && !page.isClosed() && page.url() !== 'about:blank') {
      return await capturePageState(page);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
