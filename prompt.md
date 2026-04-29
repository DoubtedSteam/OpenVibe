# OpenVibe Prompt 构成详解

> 基于 OpenVibe v0.5.5 源码分析（`src/systemPrompt.ts`、`src/modules/ConversationService.ts`、`src/modules/MessageHandler.ts`、`src/modules/ToolExecutor.ts`、`src/agentRuntimeContext.ts`、`src/api.ts`）

---

## 一、整体结构：最终发给 LLM 的消息数组

组装点位于 `ConversationService.ts:111` 的 `buildMessagesForLlm()` 方法。最终发往 API（`sendChatMessage`）的消息数组是一个**纯数组**：

```
[
  system,              ← 位置 0：增强后的系统提示（SYSTEM_PROMPT + Host env + langInstr + skills）
  visibleMessages...   ← 位置 1+：过滤后的历史对话（含用户消息上下文块）
]
```

---

## 二、[system] 的详细构成

在 `MessageHandler.ts:132` 实际组装为：

```typescript
SYSTEM_PROMPT + '\n\n\n' + getAgentRuntimeContextBlock() + langInstr
```

展开后依次为以下四大部分：

### ❶ 固定系统提示（`SYSTEM_PROMPT`）

定义在 `systemPrompt.ts`，从 v0.5.5 重构后为 **75 行**（原 224 行），按顺序包含 4 个章节：

| 区块 | 内容 |
|------|------|
| **Tools** | 15 个工具的一行描述（详细定义在 `toolDefinitions.ts` 的 JSON Schema 中） |
| **Project Context & Memory** | `.OpenVibe/memory.md` 的四层结构（L1 Project → L2 Files → L3 Classes → L4 Functions）及使用规则 |
| **Task Planning** | `create_todo_list` / `complete_todo_item` 规范、Bug 异常处理 |
| **Workflow** | 读→改→验核心循环 + 通用规则（行号偏移、`tsc --noEmit`、错误处理）+ 输出/完成规范 |

**重构要点（v0.5.5）：**
- 删除 `Recent updates`（开发历史日志）
- 合并 `Editing workflow` + `编辑经验总结` + `会话节奏控制` + `Error handling` + `Important rules` + `Output after modifications` + `Completion` → 统一为 **Workflow** 章节
- 工具描述从 21 行精简为 15 行
- Memory 从 38 行精简为 15 行
- 全英文统一，去除中英混杂
- **Edit Permission** 嵌入用户消息上下文（`MessageHandler.ts:95`），以 `🔓 Edit: ON/OFF` 形式动态显示 🔓/🔒 状态
- **`<edit-content>` Tag Protocol** 从独立章节移入 `edit` 和 `run_shell_command` 的工具描述中
- **Configuration** 整章删除（仅 language 信息保留并移入 `_buildLanguageInstruction()`，以自然语言呈现）

### ❷ 运行时上下文（`getAgentRuntimeContextBlock()`）

定义在 `agentRuntimeContext.ts:49`，**每次调用动态生成**。输出示例：

```
## Host environment (OpenVibe)
- **OS**: Windows_NT — platform `win32`, x64, release 10.0.26200
- **Paths**: separator `\`; prefer workspace-relative paths with forward slashes
- **Line endings**: Tools create **new** workspace files with CRLF by default...
- **Shell**: Terminal commands run via Node `exec` with cmd.exe...

## Active Editor (实时追踪)
- **Active editor**: `src/modules/ConversationService.ts` (typescript) — cursor at line 111, column 3, 509 lines total
```

如果用户当前没有打开文件编辑器，`Active Editor` 区块不会出现。

### 附：运行时上下文 → 嵌入用户消息（`MessageHandler.ts:94-104`）

Edit Permission 和 Todo 状态不再作为独立消息，而是**嵌入用户消息正文开头**：

```
─── Context ───
🔓 Edit: ON
📋 Todo: 2 item(s) remaining
────────────────

[用户的实际输入]
```

**设计理由：** 用户消息每轮必定变化（输入不同），带上上下文不额外增加 LLM 的消息数，也不破坏前缀缓存。数据流：

```
Webview 锁按钮
  → postMessage({ type: 'setEditPermission', enabled })
  → ChatViewProvider.onDidReceiveMessage
  → UIManager.setEditPermissionEnabled()
  → MessageHandler.ts 构建用户消息时读取状态 → 嵌入上下文块
```
### ❸ 语言指令（`langInstr`）

在 `MessageHandler.ts:130` 由 `_buildLanguageInstruction()` 生成，追加到 system 消息尾部：

- `zh-CN` → `请以简体中文与用户进行沟通。`
- `en` → `Please communicate with the user in English.`
- `auto` → 由 `getApiConfig()` 解析为 `zh-CN` 或 `en` 后对应生成

### ❹ 激活的 Skill（条件追加）

在 `ConversationService.buildMessagesForLlm()` 第 116-136 行，如果当前会话激活了技能：

```
---
## Activated Skills
The following skills are currently active in this conversation. Follow their instructions carefully.

## Activated skill: xxx-skill
[SKILL.md 的完整指令内容]
```

---

## 三、历史消息的过滤规则

在 `ConversationService.ts:112`：

```typescript
const visible = this.getCurrentMessages().filter(
  (m) => !m.hiddenFromLlm && m.role !== 'event'
);
```

| `role` | `hiddenFromLlm` | 是否发给 LLM | 用途 |
|--------|----------------|-------------|------|
| `system` | — | ✅ | 系统的固定/动态提示 |
| `user` | — | ✅ | 用户的输入文字 |
| `assistant` | `false` / `undefined` | ✅ | AI 的文本回复 + `tool_calls` |
| `assistant` | `true` | ❌ **过滤** | UI 气泡（如 todo 创建提示），不进入 LLM 上下文 |
| `tool` | — | ✅ | 工具执行结果（JSON 字符串） |
| `event` | — | ❌ **过滤** | 仅 UI 展示的轻量事件通知 |

### 一个典型的多轮工具调用序列

```
[user]        ← "帮我修改 xx 文件的配置"
[assistant]   ← "我来看看当前代码" + tool_calls: [read_file, read_file]
[tool]        ← read_file("src/config.ts") 的结果
[tool]        ← read_file("src/types.ts") 的结果
[assistant]   ← "找到了，现在修改" + tool_calls: [edit]
[tool]        ← edit 的结果（success/failure）
[assistant]   ← "修改完成"（无 tool_calls，纯文本回复）
```

每个 `[assistant]` 的消息类型为 `ChatMessage`，结构：

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'event';
  content: string | null;
  tool_calls?: ToolCall[];      // assistant 消息特有
  tool_call_id?: string;        // tool 消息特有
  reasoning_content?: string | null;  // DeepSeek 推理模型
  hiddenFromLlm?: boolean;      // UI 专用标记
}
```

---

## 四、有 Todo List 时的特殊处理

### 4.1 Todo 状态嵌入用户消息上下文

在 v0.5.5 中，todo 状态不再作为独立的 system nudge 消息，而是**嵌入用户消息的 `─── Context ───` 块**（`MessageHandler.ts:94-101`）：

```typescript
const ctxLines: string[] = [];
ctxLines.push(`🔓 Edit: ${editPermission ? 'ON' : 'OFF'}`);
const todoInfo = this._context.getTodoControlInfo();
if (todoInfo && todoInfo.remaining > 0) {
  ctxLines.push(`📋 Todo: ${todoInfo.remaining} item(s) remaining`);
}
const ctxBlock = `─── Context ───\n${ctxLines.join('\n')}\n────────────────\n\n`;
const enrichedText = ctxBlock + text;
```

**设计理由：** 用户消息每轮必定变化（输入不同），带上上下文不额外增加 LLM 的消息数，也不破坏前缀缓存。

AI 每次收到用户消息时，都能看到当前待办事项的数量。当 AI 调用 `create_todo_list` 或 `complete_todo_item` 后，更新后的状态会在下一条用户消息中自动反映。

### 4.2 默认消息结构（无 todo 或 todo 已完成时）

```
[
  system,          ← 主系统提示（SYSTEM_PROMPT + Host env + langInstr + skills）
  user,            ← 用户消息（含 ─── Context ─── 块，仅显示 Edit 状态）
  assistant,
  tool,
  ...
]
```

### 4.3 UI 上的 todo 展示（`hiddenFromLlm`）

当 AI 调用 `create_todo_list` 时，ToolExecutor 内部：

1. 保存 todo 状态到 `_todoList`
2. 调用 `_postTodoDisplay()` → `persistAssistantUiEcho()`
3. `persistAssistantUiEcho` 在 `ChatViewProvider.ts:42` 实现：
   ```typescript
   // 添加一条仅在 UI 显示、不发给 LLM 的消息
   this._conversation.addMessage({
     role: 'assistant',
     content: 'Todo list created:\n\n**Goal**: ...\n\n**Items**:\n1. [ ] 第一步...',
     hiddenFromLlm: true
   });
   this._uiManager.post({ type: 'addMessage', message: { role: 'assistant', content: '...' } });
   ```

### 4.4 Todo 状态的持久化

ToolExecutor 内部 `_todoList` 结构：

```typescript
interface TodoState {
  goal: string;
  items: { text: string; done: boolean }[];
}
```

通过 `persistAssistantTodoState` 保存到 `ChatSession.assistantTodoState`，**窗口重载后可恢复**。

## 五、Compact 前后的对比

Compact 由 `ConversationService.compactHistory()` 实现。

### 5.1 Compact 前的消息结构

```
[system]      ← 完整系统提示
[user1]       ← "帮我添加用户登录功能"
[assistant1]  ← AI 回复 + read_file 调用
[tool]        ← read_file 结果
[assistant1]  ← AI 回复 + edit 调用
[tool]        ← edit 结果
[user2]       ← "再加个注册页面"
[assistant2]  ← AI 回复 + read_file 调用
[tool]        ← read_file 结果
[assistant2]  ← AI 回复 + edit 调用
[tool]        ← edit 结果
[assistant2]  ← AI 最终回复
[user3]       ← 当前最新消息
```

### 5.2 Compact 的执行过程

**步骤 1** — 找到保留窗口起点

```typescript
const COMPACT_RESERVE_TOKENS = 20_000;  // constants.ts:13

// 从后往前扫描，累计 token 数，保留最近约 20K token
const reserveStart = this._findReserveWindowStart(messages);
// 约 5-10 轮对话
```

**步骤 2** — 将旧消息压缩为摘要

```typescript
const toCompress = messages.slice(0, reserveStart);   // 要压缩的旧消息
const toKeep = messages.slice(reserveStart);            // 保留的最近消息
```

旧消息被格式化为纯文本：

```
[User]
帮我添加用户登录功能

[Assistant]
[Reasoning]
...AI 的 chain-of-thought 推理...
[/Reasoning]
AI 的文本回复

[Tool result]
read_file 的结果内容
```

由另一个轻量 LLM 调用生成摘要，prompt 包含语言指令：

```
You are a conversation summarizer...
Rules:
- Keep: all files created/modified, decisions made, goals, current task state
- Omit: verbose tool output, repetitive reasoning
- Write in third-person present tense
- End with a "## Current State" section
```

**步骤 3** — 替换消息列表

```typescript
const summaryMessage: ChatMessage = {
  role: 'user',  // 注意：用 user role
  content: '📋 **[Conversation history compacted]**\n\n[摘要内容]\n\n> 💡 *N recent messages preserved; M older messages archived.*'
};

this._session.setCurrentMessages([summaryMessage, ...toKeep]);
```

原始消息被归档到 `ChatSession.compressedArchives`。

### 5.3 Compact 后的消息结构

```
[system]      ← 完整系统提示（不变）
[user]        ← 📋 [Conversation history compacted]  ← 角色是 user 但内容是摘要
                  ...摘要内容...
                  > 💡 *8 recent messages preserved; 12 older messages archived.*
[user3]       ← 保留窗口内的用户消息
[assistant3]  ← 保留窗口内的 AI 回复
[tool]        ← 保留窗口内的工具结果
[assistant3]  ← 保留窗口内的 AI 最终回复
[user4]       ← 当前最新用户消息
```

### 5.4 对比总结

| 方面 | Compact 前 | Compact 后 |
|------|-----------|-----------|
| Token 数 | 可能上百万 | 约 20K + 摘要 token |
| 旧消息细节 | 完整保留 | 丢失（归档到 `compressedArchives`） |
| 最近对话 | 完整保留 | 完整保留 |
| 对 AI 的影响 | 完整上下文 → 更精确 | 摘要丢失细节 → 可能不够准确 |
| UI 展示 | 不变 | 不变（compact 对用户透明） |
| 触发方式 | 手动 `/compact` 或自动（token > 100 万） | 同左 |

---

## 六、完整请求流程图

```
用户输入
    │
    ▼
MessageHandler.handleUserMessage()
    │
    ├─ 1. sanitizeIncompleteToolCalls()    ← 清理未完成的 tool call
    │
    ├─ 2. 构建用户消息上下文
    │   ├─ 读取 Edit Permission 状态
    │   ├─ getTodoControlInfo()            ← 检查 todo 状态（如有则显示 📋）
    │   └─ 嵌入 ─── Context ─── 块到用户消息正文开头
    │
    ├─ 3. buildMessagesForLlm(SYSTEM_PROMPT)
    │   ├─ system = SYSTEM_PROMPT + hostContext + langInstr
    │   ├─ 有激活 skills → 追加到 system 尾部
    │   ├─ 过滤 hiddenFromLlm 和 role==='event'
    │   └─ 返回 [system, user1, assistant1, tool1, ...]
    │
    ├─ 4. sendChatMessage(messages, tools)  ← API 调用
    │
    ├─ 5. 循环处理工具调用（最多 20 轮）
    │   ├─ 解析 AI 回复中的 tool_calls
    │   ├─ 逐一执行工具（可并行）
    │   ├─ 将 tool 结果加入消息列表
    │   └─ 新一轮 LLM 调用（含新的 tool 结果）
    │
    ├─ 6. 检查是否需要自动 compact
    │   └─ prompt_tokens > 1,000,000 → 自动触发 compact
    │
    └─ 7. 循环结束 → 等待下一条用户输入
```

---

## 七、关键源码文件索引

| 文件 | 作用 |
|------|------|
| `src/systemPrompt.ts` | 固定系统提示模板（v0.5.5 重构后 **75 行**，原 224 行） |
| `src/agentRuntimeContext.ts` | 动态生成 Host environment + Active Editor（运行时上下文，拼接在 system 中） |
| `src/modules/ConversationService.ts` | `buildMessagesForLlm()` 组装、`compactHistory()` 压缩 |
| `src/modules/MessageHandler.ts` | 主循环：运行时上下文注入用户消息、tool call 执行循环、compact 触发 |
| `src/modules/ToolExecutor.ts` | Todo 状态管理、工具调度、shell review |
| `src/modules/ChatViewProvider.ts` | UI 消息持久化（`persistAssistantUiEcho` 的 `hiddenFromLlm` 逻辑） |
| `src/api.ts` | API 调用封装（`sendChatMessage`） |
| `src/types.ts` | `ChatMessage`、`ToolCall`、`ChatSession` 等类型定义 |
| `src/constants.ts` | `COMPACT_RESERVE_TOKENS = 20_000`、`AUTO_COMPACT_TOKEN_THRESHOLD = 1_000_000` |
| `src/toolDefinitions.ts` | 工具的 JSON Schema 定义（526 行） |
| `src/mmOutput.ts` | `<edit-content>` / `<shell-content>` XML 标签提取与占位符替换 |
| `src/operationController.ts` | 操作中止控制（`AbortController` 封装） |
| `src/tools/index.ts` | 统一 re-export 所有工具实现（49 行） |
| `src/tools/replaceLinesTool.ts` | `edit` 工具核心实现（行替换 + LLM 审查） |
| `src/tools/readFileTool.ts` | `read_file` 工具实现 |
| `src/tools/findInFileTool.ts` | `find_in_file` 工具实现 |
| `src/tools/shellTool.ts` | `run_shell_command` 工具实现 |
| `src/tools/webFetchTool.ts` | `web_fetch` 工具实现（HTML 解析） |
| `src/tools/workspaceTools.ts` | `get_workspace_info` / `create_directory` / `get_diagnostics` / `get_file_info` |
| `src/tools/notificationTools.ts` | `show_notification` / `ask_human` 工具实现 |
| `src/tools/gitTools.ts` | Git 快照与历史管理 |
| `src/tools/skillTools.ts` | 技能系统（`list_skills` / `load_skill` / `activate_skill` 等） |
| `src/tools/grepSearchTool.ts` | `grep_search` 工具实现 |
| `src/tools/helpers.ts` | 全局技能池变量 + 激活回调设置 |
| `src/utils/pathHelpers.ts` | 路径工具函数（`resolveWorkspacePath`、`readLines`、`writeLines` 等） |
| `src/utils/htmlParser.ts` | HTML 转纯文本（`htmlToPlainText`、提取标题/链接/描述） |
| `src/modules/UIManager.ts` | UI 状态管理（Edit Permission、Webview 通信） |
| `src/modules/SessionManager.ts` | 会话持久化（消息、快照、技能、压缩档案） |
| `src/modules/todolistReview.ts` | Todo 清单独立审查（LLM 代理） |
| `src/modules/codeEditReview.ts` | 代码编辑独立审查（LLM 代理） |
| `src/modules/shellCommandReview.ts` | Shell 命令编辑代理 + 安全审查 |
| `src/modules/shellSecurity.ts` | Shell 安全检测（文件操作绕过、上下文采集检测） |