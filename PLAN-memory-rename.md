# Memory 知识库文件迁移方案 · 跨领域问题分析

> 本文档记录将 `.OpenVibe/memory.md` 迁移到新文件名过程中的所有受影响的引用点、跨领域问题和开放讨论点。

---

## 一、范围清单（所有引用点）

### A. 源代码引用（需要修改）

| # | 文件 | 行号 | 引用形式 | 描述 |
|---|------|------|----------|------|
| 1 | `src/systemPrompt.ts` | 29 | 字符串 | `\.OpenVibe/memory.md\` bridges sessions |
| 2 | `src/systemPrompt.ts` | 38 | 字符串 | "Read memory before touching any source file." |
| 3 | `src/systemPrompt.ts` | 39 | 字符串 | "If memory contradicts code → trust the code." |
| 4 | `src/modules/MessageHandler.ts` | 211 | 注释 | `// task_complete：提示 AI 更新 .OpenVibe/memory.md 后结束` |
| 5 | `src/modules/MessageHandler.ts` | 222 | 字符串 | `'Task complete. Remember to update .OpenVibe/memory.md...'` |
| 6 | `src/modules/MessageHandler.ts` | 227 | 字符串 | `'Task marked complete. ' + memoryHint` |
| 7 | `src/modules/todolistReview.ts` | 113 | 硬编码路径 | `path.join(root, '.OpenVibe', 'memory.md')` |
| 8 | `src/modules/todolistReview.ts` | 115 | 错误消息 | `'(memory.md not found...)'` |
| 9 | `src/modules/todolistReview.ts` | 119 | 错误消息 | `'(could not read memory.md...)'` |
| 10 | `src/modules/todolistReview.ts` | 180 | review prompt | `"project_constraints / memory excerpt"` |
| 11 | `src/modules/todolistReview.ts` | 235 | review prompt | `"## Project constraints (memory excerpt)"` |
| 12 | `src/modules/todolistReview.ts` | 279 | review prompt | `"## Project constraints (memory excerpt)"` |

### B. 函数名引用（可能不需要改名）

| # | 文件 | 行号 | 引用形式 |
|---|------|------|----------|
| 13 | `src/modules/todolistReview.ts` | 107 | `export function loadMemoryExcerpt()` — 定义 |
| 14 | `src/modules/ToolExecutor.ts` | 32 | `loadMemoryExcerpt,` — import |
| 15 | `src/modules/ToolExecutor.ts` | 722 | `const memoryExcerpt = loadMemoryExcerpt();` — 调用 |

### C. memory.md 自引用（需要同步更新）

| # | 位置 | 行号 | 引用形式 |
|---|------|------|----------|
| 16 | `.OpenVibe/memory.md` L1 | 5 | 项目描述中提及 `.OpenVibe/memory.md` |
| 17 | `.OpenVibe/memory.md` L1 | 12 | 设计原则中提及 |
| 18 | `.OpenVibe/memory.md` L2 | 196-198 | Level 2 文件描述条目 |

### D. 未引用 memory.md 的模块（无需修改）

| 模块 | 原因 |
|------|------|
| `src/modules/codeEditReview.ts` | 不接收 memoryExcerpt |
| `src/modules/shellCommandReview.ts` | 不接收 memoryExcerpt |
| `src/modules/shellSecurity.ts` | 无引用 |
| `src/modules/SessionManager.ts` | 无引用 |
| `src/modules/UIManager.ts` | 无引用 |
| `src/modules/ConversationService.ts` | 无引用 |

---

## 二、跨领域问题清单

### Q1：文件名本身

**核心问题**：`.OpenVibe/memory.md` 应该改成什么？

- **选项 A**：保持英文但改得更明确 → `project-knowledge.md`
- **选项 B**：中文名 → `项目知识库.md`
- **选项 C**：英文和中文前缀均可 → `project-memory.md`

**影响**：文件名会出现在：
- system prompt 中（AI 看到后使用）
- 硬编码路径（`todolistReview.ts` 的 `loadMemoryExcerpt()`）
- error 消息文本
- memory.md 自身的自引用

### Q2：自引用一致性

memory.md 中多处引用了**自身文件名**（L1 和 L2），改名后这些自引用必须同步更新。由于 memory.md 本身是通过 `edit` 工具维护的，改名时需要确保：

1. 先改源代码中的路径引用
2. 创建新文件（新名称）
3. 更新新文件中的自引用文本
4. 删除旧文件（或保留一段过渡期）

### Q3：loadMemoryExcerpt() 函数名

函数名为 `loadMemoryExcerpt`，如果文件名改了但函数名不改，会形成"名不副实"。讨论：

- **不改**：函数是内部实现细节，名称不需要反映文件路径
- **改为** `loadProjectKnowledge()`：更准确但影响 3 处 import/调用点
- **改用常量**：`const KNOWLEDGE_FILE = '.OpenVibe/memory.md'` 然后在函数中引用，以后改文件名只需改常量

### Q4：review prompt 中的标签文本

todolistReview.ts 的 prompt 中使用了 `"Project constraints (memory excerpt)"` 标签。

- 如果改成中文文件名，这个英文标签是否保留？
- "memory excerpt" 作为功能描述词而非文件名，可能不需要改
- 但为了整体命名一致性，建议统一

### Q5：向后兼容策略

现有用户已有 `.OpenVibe/memory.md`，改名后：

**选项 A — 自动迁移**：
```typescript
// loadMemoryExcerpt 中：
const oldPath = path.join(root, '.OpenVibe', 'memory.md');
const newPath = path.join(root, '.OpenVibe', 'project-knowledge.md');
if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
  fs.renameSync(oldPath, newPath);  // 自动迁移
}
```

- 优点：用户无感
- 风险：rename 可能失败（权限、跨设备）

**选项 B — 兼容回退**：
- 先读新文件，不存在则回退到旧文件
- 保留一段过渡期后移除旧文件读取逻辑

**选项 C — 无兼容**：
- 直接改，用户如有旧文件需手动处理

### Q6：system prompt 中的通用引用

`systemPrompt.ts:38-39` 的内容：
```
- Read memory before touching any source file.
- If memory contradicts code → trust the code.
```

这里的 "memory" 是**通用概念描述**（指知识库），不是文件名。但为了明确性：
- 可改为 "Read the project knowledge base (knowledge file)" 
- 或保留 "memory" 作为语义概念名

### Q7：错误消息本地化

`todolistReview.ts` 中的错误消息包含文件名：
- `'(memory.md not found; no project_constraints extracted)'`
- `'(could not read memory.md — workspace may be closed)'`

如果文件改名，这些消息需要同步更新。

### Q8：常量提取（推荐重构）

当前路径 `.OpenVibe/memory.md` 直接硬编码在 `loadMemoryExcerpt()` 中。建议提取到共享常量模块，使得以后改名只需改一处：

```typescript
// src/constants.ts
export const PROJECT_KNOWLEDGE_FILE = '.OpenVibe/project-knowledge.md';
```

涉及改动：
- `src/constants.ts` — 新增常量
- `src/modules/todolistReview.ts` — 使用常量替换硬编码路径和错误消息字符串
- `src/systemPrompt.ts` — system prompt 中的路径字符串（不通过常量导入，需手动维护）
- `src/modules/MessageHandler.ts` — memoryHint 字符串

---

## 三、推荐方案（初步）

### 命名建议

> **`.OpenVibe/project-knowledge.md`**

理由：
- 保留英文，避免跨编辑器编码问题
- `project-knowledge` 比 `memory` 更清晰地描述用途
- 驼峰/横线风格统一

### 实施步骤

```
1. src/constants.ts → 新增 PROJECT_KNOWLEDGE_FILE 常量
2. src/modules/todolistReview.ts → loadMemoryExcerpt() 使用常量
3. src/systemPrompt.ts → 更新引用路径和提示文本
4. src/modules/MessageHandler.ts → 更新注释和 memoryHint 字符串
5. 创建 .OpenVibe/project-knowledge.md（从 memory.md 复制并更新自引用）
6. 添加向后兼容逻辑（loadMemoryExcerpt 回退到旧文件）
7. 删除 .OpenVibe/memory.md（或保留一个空 .gitkeep）
```

### 不需要改的

- `loadMemoryExcerpt` 函数名（内部名称，不影响外部行为）
- review prompt 中的 "memory excerpt" 标签（作为功能描述）
- 通用引用 "Read memory" / "trust the code"（作为语义概念）

---

## 四、开放讨论点

> ⚠️ **以下问题需要你的决策**：

1. **文件名**：`memory.md` → `project-knowledge.md`？还是其他名字？
2. **函数名**：`loadMemoryExcerpt` 是否需要同步改名？
3. **向后兼容**：自动迁移（rename file）还是兼容回退（fallback read）？
4. **自引用**：新文件中是否继续使用 "memory" 作为语义概念词，还是全面统一为新名称？
5. **review prompt**：`"Project constraints (memory excerpt)"` 中的 `memory excerpt` 要不要改成 `knowledge excerpt`？
6. **常量提取**：是否值得将路径提取到 `src/constants.ts`（增加一次额外改动，但长期维护更好）？

---

*本文档由 Vibe Coding Assistant 于会话中自动生成。*
