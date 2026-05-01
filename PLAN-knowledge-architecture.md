# 知识库三级架构泛化方案

> 目标：将 `memory.md` 从 OpenVibe 项目专用知识库改造为**任何项目可用的通用知识库系统**，同时优化 API cache 命中率。

---

## 一、现状 vs 目标

| 维度 | 现状 | 目标 |
|------|------|------|
| 文件 | 单个 `.OpenVibe/memory.md` | `.OpenVibe/memory/` 目录，三个独立文件 |
| 结构 | 中文描述，OpenVibe 特定 | 通用化命名，语言中立（英文） |
| 访问 | AI 在 session 起始 `read_file` 一次 | L1 自动注入 system prompt；L2/L3 按需 `read_file` |
| 缓存 | 单个文件 → 改 L3 使全部 cache 失效 | 三文件独立 → 改 L3 不影响 L1/L2 缓存 |
| 初始化 | 人工手动创建 | AI 自动 bootstrap |

---

## 二、文件拆分

```
.OpenVibe/
├── memory/
│   ├── L1-purpose.md      # 项目目的（稳定，自动注入）
│   ├── L2-inventory.md    # 文件清单（中等变化）
│   └── L3-roles.md        # 组件角色（高频变化）
└── memory.md              # ❌ 移除（迁移到 memory/ 目录）
```

### 各层定义（通用化，不绑定任何技术栈或项目类型）

| 层级 | 文件名 | 稳定度 | 内容 | 适用场景 |
|------|--------|--------|------|----------|
| **L1** | `L1-purpose.md` | ★★★ 极少变 | 一句话项目定义、核心目标、设计原则、技术栈概览、数据流简图 | **始终可用**，自动注入到每次 LLM 调用的 system prompt |
| **L2** | `L2-inventory.md` | ★★☆ 中等 | 目录树、每个文件的一行描述、导入导出关系、删除影响 | 探索不熟悉的文件时按需读取 |
| **L3** | `L3-roles.md` | ★☆☆ 经常变 | 模块/类/组件的职责、关键字段（名称·类型·用途）、生命周期 | 修改代码前读取，修改后立即更新 |

**为什么这样分？**
- **L1 稳定** → 适合嵌入 system prompt，API 的 prefix caching 可命中
- **L2 中等** → 文件增删时才改，不频繁
- **L3 高频** → 每次代码改动都伴随 L3 更新，放在独立文件中不影响其他层缓存

---

## 三、System Prompt 泛化

当前（OpenVibe 专用）：
```
## Project Context & Memory

`.OpenVibe/memory.md` bridges sessions — read it at session start, update it per-file after edits.

**Three-level structure:**
- **L1 — Project**: purpose, design principles, tech stack, data-flow.
- **L2 — Files**: directory tree; each file's purpose, imports/exports, impact if deleted.
- **L3 — Classes**: responsibility, key fields (name·type·purpose), lifecycle, inheritance.

**Rules:**
- Read memory before touching any source file.
- If memory contradicts code → trust the code.
- Update L3 immediately after modifying a file's classes or fields.
- Update L1 only after all files are done.
```

改造后（通用化）：
```
## Project Knowledge (.OpenVibe/memory/)

The project stores structured knowledge in `.OpenVibe/memory/` with three
independent levels. **L1 is always available** (auto-injected into every
LLM call). Load L2/L3 on demand via `read_file`.

**L1-purpose.md** — Project overview (auto-injected into every prompt).
  - What is this project for? Core goals, design principles, tech stack,
    data flow diagram, key architectural decisions.
  - Read: always available, no need to `read_file`.
  - Update: only when the project's high-level direction changes.

**L2-inventory.md** — File directory inventory.
  - Directory tree, each file's one-line purpose, imports/exports,
    impact if deleted. Think of it as a project map.
  - Read: when exploring unfamiliar files or deciding where to place new code.
  - Update: when files are added, removed, or significantly reorganized.

**L3-roles.md** — Component/module/class roles.
  - Each key component's responsibility, key fields (name·type·purpose),
    lifecycle, and inheritance/relationships.
  - Read: **before** modifying any component's source code.
  - Update: **immediately after** modifying a component's structure or fields.

**Rules:**
- If knowledge contradicts code → **trust the code** and update the file.
- Do NOT read all three levels at once — only read what you need.
- When creating a new component: add it to L3.
- When adding a new file: add it to L2.
```

### 关键变化

| 项目 | 原来 | 现在 |
|------|------|------|
| 文件引用 | 具体路径 `.OpenVibe/memory.md` | 目录 `.OpenVibe/memory/` |
| 描述语言 | OpenVibe 特定（Classes, Fields） | 通用（Component roles, responsibilities） |
| 访问方式 | "read at session start" | L1 自动注入；L2/L3 按需加载 |
| 读取规则 | "Read before touching" | "Only read what you need" — 减少不必要的 read_file |
| 批量读取 | 隐含一次性读全部 | 明确禁止一次性读全部 |

---

## 四、L1 自动注入机制（实现方案）

### 原理

当前架构中，`getAgentRuntimeContextBlock()`（主机环境信息）已通过 `MessageHandler.ts:128` 注入到每次 LLM 调用的 system prompt：

```typescript
// MessageHandler.ts — 每次 LLM 调用时构建 messages
const allMessages = this._context.buildMessagesForLlm(
  SYSTEM_PROMPT + '\n\n\n' + getAgentRuntimeContextBlock() + langInstr
);
```

L1 的自动注入可沿同一管道实现：

### 方案 A：MessageHandler 层注入

```typescript
// 新增: src/agentRuntimeContext.ts
export function getProjectPurposeBlock(): string {
  // 读取 .OpenVibe/memory/L1-purpose.md（缓存，避免每次读盘）
  // 如果文件不存在，返回空字符串
}
```

然后在 MessageHandler.ts 中：
```typescript
const allMessages = this._context.buildMessagesForLlm(
  SYSTEM_PROMPT + '\n\n\n' + getAgentRuntimeContextBlock() + '\n\n' + getProjectPurposeBlock() + langInstr
);
```

### 方案 B：ConversationService 层注入

在 `buildMessagesForLlm()` 内部自动拼接 L1 内容：

```typescript
buildMessagesForLlm(systemPrompt: string): ChatMessage[] {
  let enrichedPrompt = systemPrompt;
  const l1 = getProjectPurposeBlock();  // 从 disk 读取
  if (l1) {
    enrichedPrompt += '\n\n---\n' + l1;
  }
  // ... skill instructions ...
  return [{ role: 'system', content: enrichedPrompt }, ...visible];
}
```

### 推荐：方案 B

理由：
- `buildMessagesForLlm()` 是**所有** LLM 调用的统一入口（主助手、review 代理等）
- 不需要在每个调用点手动添加
- 与 skill 注入逻辑并列，架构一致

### 缓存策略

L1 文件很少变化，但每次都读盘仍有开销。可加入简单的内存缓存：

```typescript
let _l1Cache: { content: string; mtime: number } | null = null;

export function getProjectPurposeBlock(): string {
  const p = path.join(root, '.OpenVibe', 'memory', 'L1-purpose.md');
  const stat = fs.statSync(p);
  if (_l1Cache && _l1Cache.mtime === stat.mtimeMs) {
    return _l1Cache.content;
  }
  const content = fs.readFileSync(p, 'utf-8');
  _l1Cache = { content, mtime: stat.mtimeMs };
  return content;
}
```

这样 session 内只读一次盘，后续均为内存命中。

---

## 五、初始化 Bootstrap 流程

当 AI 检测到 `.OpenVibe/memory/` 目录**不存在**时，应自动触发建库流程：

### 触发器

检测时机：每次 session 开始，AI 尝试 `read_file` L1-purpose.md 失败时。

但更好的做法是：**在 system prompt 中告诉 AI 去检查并创建**。

```typescript
// systemPrompt.ts 新增行为描述
"- If .OpenVibe/memory/ does not exist: create the directory, then scan the project (README, package.json, directory structure, key source files) to generate initial L1/L2/L3 content."
```

### Bootstrap 步骤

```
Step 1: create_directory .OpenVibe/memory/
Step 2: read README.md + package.json → 生成 L1-purpose.md
Step 3: get_workspace_info → 扫描目录树 → 生成 L2-inventory.md（初稿）
Step 4: 读取关键源文件头部 → 提取导出/类定义 → 生成 L3-roles.md（初稿）
Step 5: ask_human "知识库已建好，请 review 确认"
```

### L1 生成模板

```markdown
# Project Purpose

## One-line description
{从 README/package.json 提取}

## Core goals
- {goal 1}
- {goal 2}

## Technology stack
- Language: {lang}
- Framework: {framework}
- Key dependencies: {deps}

## Architecture
{简单数据流或架构描述}
```

### L2 生成模板

```markdown
# File Inventory

```
{目录树}
```

| Path | Purpose | Key exports | Deletion impact |
|------|---------|-------------|-----------------|
| src/index.ts | 入口文件 | activate(), deactivate() | 项目无法启动 |
| ... | ... | ... | ... |
```

### L3 生成模板

```markdown
# Component Roles

## {模块/类名}
**Responsibility**: {一句话职责}

**Key fields**:
- `{field}` · {type} · {purpose}

**Lifecycle**: {创建/初始化/销毁}
**Relationships**: {依赖/继承关系}
```

---

## 六、API Cache 命中率分析

### 当前（单文件 memory.md）

```
每次修改：
  ├─ memory.md 内容变化 → 文件 mtime 变更
  ├─ AI 重新 read_file → 新内容进入 conversation
  └─ API 侧：system prompt 未变 ✅ | conversation 中 memory 内容变了 ❌
```

API 级别的 prefix caching：system prompt 不变 → **可以 cache**。但 conversation 中 memory 内容变了 → 后续消息的 kv cache 失效。

### 改造后（三文件 + L1 自动注入）

```
L1（注入 system prompt）：
  ├─ 很少变化
  ├─ 每次请求都出现在 system prompt 的固定位置
  └─ API prefix caching ✅✅✅ 几乎始终命中

L2（按需 read_file）：
  ├─ 中等变化频率
  ├─ 仅在需要时读取，加入 conversation
  └─ 不影响 system prompt cache ✅

L3（按需 read_file + 频繁更新）：
  ├─ 经常变化
  ├─ 修改后 conversation 中 L3 内容更新
  └─ 但 system prompt 不受影响 ✅（只有当前轮次的 assistant message 变化）
```

### 关键收益

| 场景 | 单文件 memory.md | 三文件拆分 |
|------|-----------------|-----------|
| 修改 L3（最常见） | memory.md 全量变化 → 所有 cache 失效 | 仅 L3 变化 → L1 system prompt cache ✅, L2 不变 ✅ |
| 修改 L2 | 同上 | 仅 L2 变化 |
| 连续相同 L1 请求 | conversation 中已缓存 | system prompt prefix caching ✅ 更高效 |
| 跨 session 相同 L1 | 每次 session 重新 read | 自动注入，system prompt 一致 → 跨 session cache 可能 |

---

## 七、实现步骤

### Phase 1：文件拆分布局

| # | 操作 | 文件 |
|---|------|------|
| 1 | 创建 `.OpenVibe/memory/` 目录 | — |
| 2 | 从 `memory.md` 提取 L1 内容 → 写入 `L1-purpose.md` | `.OpenVibe/memory/L1-purpose.md` |
| 3 | 从 `memory.md` 提取 L2 内容 → 写入 `L2-inventory.md` | `.OpenVibe/memory/L2-inventory.md` |
| 4 | 从 `memory.md` 提取 L3 内容 → 写入 `L3-roles.md` | `.OpenVibe/memory/L3-roles.md` |
| 5 | 删除 `memory.md` | — |

### Phase 2：代码改动

| # | 操作 | 文件 |
|---|------|------|
| 6 | 新增 `getProjectPurposeBlock()` 函数 | `src/agentRuntimeContext.ts` |
| 7 | 在 `buildMessagesForLlm()` 中注入 L1（方案 B） | `src/modules/ConversationService.ts` |
| 8 | 更新 system prompt 为泛化版本 | `src/systemPrompt.ts` |
| 9 | 更新 `loadMemoryExcerpt()` 改为读取 `memory/` 目录 | `src/modules/todolistReview.ts` |
| 10 | 更新 `memory.md` 自引用（如果还有） | — |

### Phase 3：文档

| # | 操作 |
|---|------|
| 11 | 更新 PLAN-memory-rename.md 记录新方向 |
| 12 | 添加 bootstrap 流程说明到 README 或 system prompt |

---

## 八、开放问题

1. **L1 自动注入的 token 成本**：L1 每次请求都作为 system prompt 的一部分发送，增加 token 消耗。如果 L1 很大（>500 tokens），是否值得？
   - 权衡：增加的 token 成本 vs 减少的 `read_file` 调用和更好的 cache 命中
   - 建议：L1 控制在 200-400 tokens 以内

2. **bootstrap 触发时机**：AI 在首次检测到缺失时自动创建，还是通过一个专门的命令（如 `/init-knowledge`）？
   - 建议：AI 自动检测 + 自动创建，ask_human 确认

3. **L1 的 mtime 缓存**：每次 API 调用都检查 stat 仍有 I/O 开销，是否有必要？
   - 建议：简单加内存缓存，session 内只 stat 一次

4. **向后兼容**：现有用户的 `memory.md` 如何处理？
   - 方案：`loadMemoryExcerpt()` 先读 `memory/L1-purpose.md`，不存在则回退到 `memory.md`
   - 过渡期后移除回退逻辑

5. **文件命名风格**：`L1-purpose.md` vs `purpose.md` vs `1-purpose.md`？
   - 建议：`L1-purpose.md`，层级前缀 + 语义名，排序友好、语义清晰
