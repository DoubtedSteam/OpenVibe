---
name: skill-authoring-guide
description: 技能创建规范（权威指南）：SKILL.md frontmatter 子集与解析器限制、加载/激活的真实行为、完整示例与验证清单。创建、修改或规范任何技能文件前必须先加载本技能
---

# 技能创建指南（Skill Authoring Guide）

本指南是创建 openvibe 技能的权威规范，基于当前实现逐条核实（2026-08-27）。**创建、修改或规范技能文件（`SKILL.md` / `reference.md`）之前，必须先加载本技能**，并严格遵守下文 frontmatter 限制，否则技能可能解析错乱或无法加载。

## 1. 技能是什么

技能 = 一个目录 + 一份 `SKILL.md`，为 AI 助手预设角色、行为模式和专业知识。对话中助手通过 `load_skill` 工具读取指令后按技能工作。

- `list_skills`：列出所有可用技能名（目录名数组）
- `load_skill(name)`：读取指定技能的 `SKILL.md`，返回结构化内容

## 2. 目录结构

```text
<技能池>/
└── <skill-name>/          # 目录名 = 技能标识（供 list_skills / load_skill 使用）
    ├── SKILL.md           # 必需：frontmatter + 指令正文
    └── reference.md       # 可选：补充材料（不会被自动加载，需在正文中指示助手 read_file）
```

**命名规则**：目录名即技能标识，使用小写字母、数字、连字符（如 `paper-revision-router`）。避免空格与中文。

## 3. SKILL.md 格式

```markdown
---
name: <显示名>
description: <一句话描述，单行>
subSkills: [skill-a, skill-b]   # 可选
---

# 技能指令

（Markdown 正文，加载后作为 instruction 返回）
```

### 3.1 frontmatter 字段

| 字段 | 必需 | 说明 |
|---|---|---|
| `name` | 否 | 技能显示名；缺省回退为目录名 |
| `description` | 强烈建议 | 一句话描述。LLM 靠它判断何时加载该技能（list_skills 只返回目录名，不含描述） |
| `subSkills` | 否 | 单行内联数组 `[a, b]`，声明关联技能；当前仅作为字段返回，不会自动递归加载 |

### 3.2 解析器限制（必须遵守，违反会解析错乱）

当前解析器（`src/tools/skillTools.ts`）**不是完整 YAML 解析器**，只支持：

- 扁平 `key: value` 键值对（值中可含半角冒号，按第一个冒号切分）
- 值可用双引号或单引号包裹（会剥除引号）
- 数组只能是**单行** `[a, b]` 形式

**禁止的写法**：

| 禁止写法 | 后果 |
|---|---|
| 多行描述 `description: \|` 块 | 首行被当成 description，后续行全部丢失 |
| 多行数组（subSkills 换行缩进列表） | 不被识别为数组 |
| 嵌套对象 / 列表项 `- item` | 整行被当成 key: value 或丢弃 |
| 注释行含半角冒号（如 `# 注意: xxx`） | `# 注意` 被误解析为属性名 |

> 无冒号的纯注释行（如 `# comment`）会被安全跳过。正文部分没有任何限制，任意 Markdown 均可。

## 4. 加载与激活的真实行为

```text
1. list_skills                    ← 发现可用技能
2. load_skill(name="xxx")         ← 加载目标技能（返回 JSON）
3. 提出你的需求                    ← 助手按技能指令响应
```

`load_skill` 返回：`{ name, description, instruction, subSkills, filePath, pool }`。

**重要事实**：当前没有"激活 API"——所谓激活 = 助手调用 `load_skill` 并把 `instruction` 纳入当前回合上下文。**指令不会持久注入系统提示**：一旦历史被 compact 压缩或工具结果滚出上下文窗口，技能指令即丢失，需重新 `load_skill`。`reference.md` 不会被自动加载，必须在正文中明确指示助手用 `read_file` 读取；`subSkills` 不会自动递归加载，依赖其他技能时在正文中写明"需要时调用 `load_skill(name="xxx")`"。

## 5. 完整示例

```markdown
---
name: 代码审查员
description: 专门负责 Pull Request 代码审查，重点关注安全性和性能
---

# 技能指令

你是一个经验丰富的代码审查员。审查代码时请重点关注：
- **安全性**：SQL 注入、XSS、权限泄露
- **性能**：不必要的循环、内存泄漏
- **可维护性**：命名规范、模块耦合度

请始终以表格形式输出审查结果。
```

正文写作建议：写清何时使用（适用场景、触发条件）；写清必须遵守的规则（语气、输出格式、验收标准）；有补充材料时在正文写明 `详见 [reference.md](reference.md)` 并指示助手 read_file。

## 6. 创建后验证清单

- 目录名小写连字符，位于技能池下
- `SKILL.md` 以 `---` 开头，以 `---` 结束 frontmatter
- `description` 为单行文本，未使用 `|` 多行块
- 若声明 `subSkills`：单行 `[a, b]` 形式
- 对话中调用 `list_skills` 能看到该技能
- 对话中调用 `load_skill(name="...")` 能返回完整 instruction
- 若引用了 `reference.md`：正文里明确要求助手 read_file 读取

## 7. 技能池

| 池 | 位置 | 说明 |
|---|---|---|
| workspace（优先） | `.OpenVibe/skills/` | 跟随当前工作区，随仓库分发 |
| global | VS Code 全局存储 `globalStorageUri/skills/` | 跨工作区共享；本指南技能由扩展自动部署到此池 |

同名技能：workspace 优先于 global，`load_skill` 返回的 `pool` 字段标明来源。
