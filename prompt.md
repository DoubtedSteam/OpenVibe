# OpenVibe Prompt 构成详解

> 基于 OpenVibe v0.5.5 源码分析（`src/systemPrompt.ts`、`src/modules/ConversationService.ts`、`src/modules/MessageHandler.ts`、`src/modules/ToolExecutor.ts`、`src/agentRuntimeContext.ts`、`src/api.ts`）

---

## 一、整体结构：最终发给 LLM 的消息数组

组装点位于 `ConversationService.ts:111` 的 `buildMessagesForLlm()` 方法。最终发往 API（`sendChatMessage`）的消息数组是一个**纯数组**：

```
[
  system,              ← 位置 0：增强后的系统提示（system prompt）
  (system_nudge),      ← 位置 1（可选）：todo nudge，仅在有活跃 todo 时插入
  visibleMessages...   ← 位置 1 或 2+：过滤后的历史对话
]
```

---

## 二、[system] 的详细构成

在 `MessageHandler.ts:133` 实际组装为：

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
- **Edit Permission** 移至 `agentRuntimeContext.ts` 运行时块，接受 `editPermissionEnabled` 参数动态显示 🔓/🔒 状态
- **`<edit-content>` Tag Protocol** 从独立章节移入 `edit` 和 `run_shell_command` 的工具描述中
- **Configuration** 整章删除（仅 language 信息保留并移入 `_buildLanguageInstruction()`，以自然语言呈现）

### ❷ 运行时上下文（`getAgentRuntimeContextBlock()`）

定义在 `agentRuntimeContext.ts:52`，**每次调用动态生成**，接受可选参数 `editPermissionEnabled?: boolean`。输出示例：

```
## Host environment (OpenVibe)
- **OS**: Windows_NT — platform `win32`, x64, release 10.0.26200
- **Paths**: separator `\`; prefer workspace-relative paths with forward slashes
- **Line endings**: Tools create **new** workspace files with CRLF by default...
- **Shell**: Terminal commands run via Node `exec` with cmd.exe...

## Active Editor (实时追踪)
- **Active editor**: `src/modules/ConversationService.ts` (typescript) — cursor at line 111, column 3, 509 lines total

## Edit Permission         ← 仅在传入了 editPermissionEnabled 参数时出现
🔓 **ON (write tools available)**
```

当 `editPermissionEnabled` 为 `undefined` 时（如 review agent、compact 等），不输出 `## Edit Permission` 块，保持 cache 稳定。**完整数据流：** Webview 锁按钮 → `postMessage({ type: 'setEditPermission', enabled })` → `ChatViewProvider.onDidReceiveMessage` → `UIManager.setEditPermissionEnabled()` → `MessageHandler.ts:134` 传入 `getAgentRuntimeContextBlock(editPermissionEnabled)` → AI 感知当前权限状态。

### ❸ 语言指令（`langInstr`）

在 `MessageHandler.ts:132` 由 `_buildLanguageInstruction()` 生成，追加到 system 消息尾部：

- `zh-CN` → `请以简体中文与用户进行沟通。`
- `en` → `Please communicate with the user in English.`
- `auto` → 由 `getApiConfig()` 解析为 `zh-CN` 或 `en` 后对应生成

### ❹ 激活的 Skill（条件追加）

在 `ConversationService.buildMessagesForLlm()` 第 116-133 行，如果当前会话激活了技能：

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

### 4.1 内部 nudge（不展示给用户）

在 `MessageHandler.ts:117-136`：

```typescript
const todoInfo = this._context.getTodoControlInfo();
if (todoInfo && todoInfo.remaining > 0) {
  pendingNudge = '\n\n[INTERNAL NUDGE]\n如有需要，请变更todo list。\n[END INTERNAL NUDGE]\n';
}

// 将 nudge 作为独立的 system 消息插入到位置 1
allMessages.splice(1, 0, { role: 'system', content: pendingNudge });
```

**有 todo 且还有未完成项时**，消息数组变成：

```
[
  system,          ← 主系统提示（含 Host environment + 语言指令 + skills）
  system,          ← [INTERNAL NUDGE] — 提醒 AI 更新 todo（不展示给用户）
  user,
  assistant,
  tool,
  ...
]
```

> 使用独立的 `role: 'system'` 消息而不是追加到主 system prompt，目的是**保持 prompt cache 前缀稳定**，减少每次 API 调用的计算成本。

### 4.2 Todo 完成后的 nudge 清除

在 `MessageHandler.ts:153`：
```typescript
if (response.toolCalls && response.toolCalls.length > 0) {
  pendingNudge = '';  // AI 开始使用工具后，nudge 被消费掉
}
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

---

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
    ├─ 2. getTodoControlInfo()              ← 检查 todo 状态
    │   └─ 有未完成项 → pendingNudge = [INTERNAL NUDGE]
    │
    ├─ 3. buildMessagesForLlm(SYSTEM_PROMPT)
    │   ├─ system = SYSTEM_PROMPT + hostContext + langInstr
    │   ├─ 有激活 skills → 追加到 system 尾部
    │   ├─ 过滤 hiddenFromLlm 和 role==='event'
    │   └─ 返回 [system, user1, assistant1, tool1, ...]
    │
    ├─ 4. 有 pendingNudge → allMessages.splice(1, 0, system_nudge)
    │
    ├─ 5. sendChatMessage(messages, tools)  ← API 调用
    │
    ├─ 6. 循环处理工具调用（最多 20 轮）
    │   ├─ 解析 AI 回复中的 tool_calls
    │   ├─ 逐一执行工具（可并行）
    │   ├─ 将 tool 结果加入消息列表
    │   └─ 新一轮 LLM 调用（含新的 tool 结果）
    │
    ├─ 7. 检查是否需要自动 compact
    │   └─ prompt_tokens > 1,000,000 → 自动触发 compact
    │
    └─ 8. 循环结束 → 等待下一条用户输入
```

---

## 七、关键源码文件索引

| 文件 | 作用 |
|------|------|
| `src/systemPrompt.ts` | 固定系统提示模板（v0.5.5 重构后 **75 行**，原 224 行） |
| `src/agentRuntimeContext.ts` | 动态生成 Host environment + Active Editor + Edit Permission（接受 `editPermissionEnabled` 参数） |
| `src/modules/ConversationService.ts` | `buildMessagesForLlm()` 组装、`compactHistory()` 压缩 |
| `src/modules/MessageHandler.ts` | 主循环：nudge 注入、tool call 执行循环、compact 触发 |
| `src/modules/ToolExecutor.ts` | Todo 状态管理、工具调度、shell review |
| `src/modules/ChatViewProvider.ts` | UI 消息持久化（`persistAssistantUiEcho` 的 `hiddenFromLlm` 逻辑） |
| `src/api.ts` | API 调用封装（`sendChatMessage`） |
| `src/types.ts` | `ChatMessage`、`ToolCall`、`ChatSession` 等类型定义 |
| `src/constants.ts` | `COMPACT_RESERVE_TOKENS = 20_000`、`AUTO_COMPACT_TOKEN_THRESHOLD = 1_000_000` |
| `src/toolDefinitions.ts` | 工具的 JSON Schema 定义（526 行） |
