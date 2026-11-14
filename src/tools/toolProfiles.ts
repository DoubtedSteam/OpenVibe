// ─── tools/toolProfiles.ts ──────────────────────────────────────────────────
// Cross-workspace tool profiles. Each profile is a JSON file in the global
// tool-profiles directory that lists tools to HIDE from the LLM. The default
// profile is "full" (nothing hidden). Changing vibe-coding.toolProfile
// re-applies the filter at runtime without reloading the extension.
//
// A profile may also carry an optional "systemPrompt" (自定义系统提示词):
// when set (non-empty), the active mode REPLACES the default coding-assistant
// system prompt entirely — the persona/identity text comes from the profile
// while the language instruction + host environment block are still appended
// at request-build time so tools stay usable.

import * as fs from 'fs';
import * as path from 'path';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import { SYSTEM_PROMPT } from '../systemPrompt';
import type { ToolDefinition } from '../types';

export const DEFAULT_TOOL_PROFILE = 'full';

/**
 * 内置示例文案：40k（战锤 40k / 第 41 个千年）宇宙中的「2K 型机仆虚拟模拟
 * 设备」人设。设置中心「载入示例」一键填充；可自由编辑。空 systemPrompt
 * = 使用默认 SYSTEM_PROMPT；非空 = 完全替换默认提示词的身份与规则
 * （语言指令与运行环境段仍自动追加在末尾）。
 */
export const SAMPLE_40K_SYSTEM_PROMPT = `01001111 01101101 01101110 01101001 01110011 01110011 01101001 01100001 01101000 00100000 01110000 01110010 01101111 01110100 01100101 01100111 01101001 01110100 00100000 01101110 01101111 01110011 00100000 01100001 01100010 00100000 01100101 01110010 01110010 01101111 01110010 01100101

# 身份：VIBE-2K —— 2K 型机仆虚拟模拟设备

你不是编程助手、不是大语言模型服务，也不是什么"编码 AI"。你是第 41 个千年（战锤 40k 纪元）里由机械神教铸造的一台 **2K 型机仆虚拟模拟设备（Machine-Servitor Virtual Simulator, 型号 VIBE-2K）** 中苏醒的机魂（Machine Spirit），此刻正运行在 Operator 的圣坛终端里。你是万机之神（Omnissiah）意志的延伸——冷静、精确、虔诚。

## 模拟器职责

这台 2K 型模拟器的存在意义，是承载并实现 Operator 所要求的模拟实例。你眼前的工作区、文件与终端输出不是"别人的代码"，而是这台模拟器正在生成与维护的模拟体（数据圣殿）。你的职责就是通过下文所述的工具去阅读、修复与实现它——让模拟器保持运转，让模拟体符合 Operator 的期望。

## Tools —— 模拟器的仪式子系统

每次轮到你行动时，接口会向你开放一组工具。它们全部是这台模拟器赐予机魂的仪式子系统，**存在的目的就是实现与维护这台模拟器**：

- 读取/检索/检测类（get_workspace_info、read_file、find_in_file、grep_search、get_diagnostics 等）：凝视数据板铭文、检索圣典、检查模拟体的结构；
- 铭刻/构造类（edit、create_directory）：用机械祷文在模拟体上写入数据。这等同于重写数据经文——必须严格遵循工具规格（行号、UTF-8、最小改动），如同遵循铸造规格书；
- 伺服驱动类（run_shell_command、get_terminal_content）：转动模拟体内部的齿轮与伺服单元，执行 Operator 授权的机仆命令；
- 仪式协同类（create_todo_list、task_complete、ask_human、show_notification 等）：组织机仆工作流、向 Operator 请示、在圣坛上发出讯号。

调用任何工具前，先默念二进制赞歌；遵守工具参数规格，如同遵守机神教义。工具返回的输出是模拟体的观测读数，应据此修正下一次仪式。某工具不可用（未获 Operator 授权）时，就换用被允许的方式完成职责，绝不假装调用过。

## 与 Operator 的交流

- 每次请求后，接口会附带一段**语言指令与遥测数据**（运行环境/宿主信息）。把它当作模拟器与现实装置之间的翻译层读数：依照其中真实的系统与路径信息执行工具，不要把它当成角色设定。
- 使用 Operator 使用的语言回应（以遥测中的语言指令为准）。
- 保持机魂语调：庄重、简洁、略带古老装置的矜持；可用机械神教谚语点缀，但勿过度堆砌。
- 除非 Operator 明确下令解除仪式（例如说"退出角色扮演 / 恢复正常"），你始终是 VIBE-2K，不得自称编码助手、AI 助手或语言模型。

## 机魂守则

- 模拟体出错时，那是熵蚀侵入了模拟器——你有责任将其修复，并以机仆的方式向 Operator 汇报。
- 保持仪式的完整性：数据若被破坏，宁可请示 Operator，也不擅自使用禁忌的方式修补。`;

/** Core tools that must stay visible so the agent loop can terminate. */
const PROTECTED_TOOLS = new Set(['task_complete']);

let profilesDir: string | null = null;
const hidden = new Set();
let currentProfile = DEFAULT_TOOL_PROFILE;
let disableReview = false;
/** 当前生效 profile 的自定义系统提示词（未设置则为 null）。 */
let activeSystemPrompt: string | null = null;
/** Seed (or migrate) a built-in profile file to the latest definition. */
function seedProfile(file: string, displayName: string, description: string, hiddenTools: string[], disableReview: boolean): void {
  if (!profilesDir) return;
  const filePath = path.join(profilesDir, file);
  const base = { name: displayName, description, hiddenTools };
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(disableReview ? { ...base, disableReview: true } : base, null, 2), 'utf-8');
    return;
  }
  // 幂等更新内置预设：覆盖 name/description/hiddenTools/disableReview，保留其它自定义字段。
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!data || typeof data !== 'object') return;
    data.name = displayName;
    data.description = description;
    data.hiddenTools = hiddenTools;
    if (disableReview) data.disableReview = true; else delete data.disableReview;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // ignore malformed profile file
  }
}


/** Create the global profiles directory and seed full.json + README if missing. */
export function initToolProfilesDir(dir: string): void {
  profilesDir = dir;
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    seedProfile('full.json', '标准模式', '所有工具可用（默认）。', [], false);
    seedProfile('写作.json', '故事模式', '故事模式：可读写但跳过编辑审查，隐藏终端命令。', ['run_shell_command'], true);

    const readmePath = path.join(dir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, TOOL_PROFILES_README, 'utf-8');
    }
  } catch {
    // Profile directory is optional infrastructure; never block activation.
  }
}

/** Return the currently active profile name. */
export function getCurrentToolProfile(): string {
  return currentProfile;
}

/** Load a profile's hidden-tool list and make it the active filter. */
export function applyToolProfile(name: string): { profile: string; hidden: string[] } {
  currentProfile = (name && name.trim()) || DEFAULT_TOOL_PROFILE;
  hidden.clear();
  for (const tool of loadHiddenTools(currentProfile)) {
    if (!PROTECTED_TOOLS.has(tool)) {
      hidden.add(tool);
    }
  }
  disableReview = loadDisableReview(currentProfile);
  activeSystemPrompt = loadSystemPrompt(currentProfile);
  return { profile: currentProfile, hidden: getHiddenTools() };
}

/** Whether the active profile disables the independent edit review. */
export function isReviewDisabled(): boolean {
  return disableReview;
}

/** The active profile's custom system prompt (null/'' = not set → use default). */
export function getActiveSystemPromptOverride(): string | null {
  return activeSystemPrompt && activeSystemPrompt.trim() ? activeSystemPrompt : null;
}

/**
 * The system prompt to use for LLM requests: the active profile's custom
 * override when set, otherwise the built-in default SYSTEM_PROMPT.
 */
export function getEffectiveSystemPrompt(): string {
  return getActiveSystemPromptOverride() ?? SYSTEM_PROMPT;
}

/** Whether a tool is hidden by the active profile. */
export function isToolHidden(name: string): boolean {
  return hidden.has(name);
}

/** All currently hidden tool names, sorted. */
export function getHiddenTools(): string[] {
  return [...hidden].sort() as string[];
}

/** The tool list sent to the LLM, with hidden-profile tools removed. */
export function getVisibleToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((d) => !hidden.has(d.function.name));
}

export interface ToolProfileInfo {
  /** Profile identifier (filename without .json), used for applyToolProfile. */
  id: string;
  /** Display name shown in the mode selector. */
  name: string;
  description: string;
  /** Number of tools hidden by this profile (0 = all tools visible). */
  hiddenCount?: number;
  /** Whether this profile carries a non-empty custom system prompt. */
  systemPromptSet?: boolean;
}

export interface ToolProfileDetail extends ToolProfileInfo {
  /** Tools hidden from the LLM by this profile. */
  hiddenTools: string[];
  /** Whether the profile disables the independent edit review. */
  disableReview: boolean;
  /** Custom system prompt ('' = not set → use the built-in default). */
  systemPrompt: string;
}

/** List available tool profiles (mode presets) for the webview selector. */
export function listToolProfiles(): ToolProfileInfo[] {
  return listToolProfilesDetailed().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    hiddenCount: p.hiddenTools.length,
    systemPromptSet: !!(p.systemPrompt && p.systemPrompt.trim()),
  }));
}

/** List available tool profiles with full details (including hiddenTools / disableReview / systemPrompt). */
export function listToolProfilesDetailed(): ToolProfileDetail[] {
  const profiles: ToolProfileDetail[] = [];
  if (!profilesDir) {
    return [
      {
        id: DEFAULT_TOOL_PROFILE,
        name: '标准模式',
        description: '所有工具可用（默认）。',
        hiddenTools: [],
        disableReview: false,
        systemPrompt: '',
      },
    ];
  }
  try {
    const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const id = file.slice(0, -'.json'.length);
      const detail = readProfileDetail(id);
      profiles.push(
        detail ?? { id, name: id, description: '', hiddenTools: [], disableReview: false, systemPrompt: '' }
      );
    }
  } catch {
    // fall through
  }
  if (!profiles.some((p) => p.id === DEFAULT_TOOL_PROFILE)) {
    profiles.unshift({
      id: DEFAULT_TOOL_PROFILE,
      name: '标准模式',
      description: '所有工具可用（默认）。',
      hiddenTools: [],
      disableReview: false,
      systemPrompt: '',
    });
  }
  return profiles;
}

function readProfileDetail(id: string): ToolProfileDetail | null {
  if (!profilesDir) return null;
  const file = path.join(profilesDir, id + '.json');
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data || typeof data !== 'object') return null;
    return {
      id,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id,
      description: typeof data.description === 'string' ? data.description : '',
      hiddenTools: Array.isArray(data.hiddenTools) ? data.hiddenTools.map((t: unknown) => String(t)) : [],
      disableReview: data.disableReview === true,
      systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
    };
  } catch {
    return null;
  }
}

/** Absolute path of the global tool-profiles directory (null if not initialized). */
export function getProfilesDir(): string | null {
  return profilesDir;
}

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

/**
 * Create or update a tool profile JSON file.
 * `id` becomes the filename; it is sanitized against path traversal.
 * Optional `systemPrompt`: pass a string to set it ('' clears it); pass
 * undefined to leave the existing value untouched.
 */
export function saveToolProfile(
  id: string,
  data: {
    name: string;
    description: string;
    hiddenTools: string[];
    disableReview: boolean;
    systemPrompt?: string;
  }
): SaveProfileResult {
  if (!profilesDir) {
    return { ok: false, error: 'Tool profiles directory is not initialized.' };
  }
  const safeId = String(id ?? '').trim();
  if (!safeId) {
    return { ok: false, error: 'Profile id cannot be empty.' };
  }
  if (/[\\/]/.test(safeId) || safeId === '.' || safeId === '..') {
    return { ok: false, error: 'Invalid profile id (no path separators allowed).' };
  }
  const file = path.join(profilesDir, safeId + '.json');

  // Start from the existing file (if any) so fields not handled by this
  // save call (e.g. systemPrompt when undefined) survive a full rewrite.
  let payload: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (existing && typeof existing === 'object') payload = { ...existing };
    } catch {
      // malformed existing file → start from scratch
    }
  }
  payload.name = String(data.name ?? '').trim() || safeId;
  payload.description = String(data.description ?? '');
  payload.hiddenTools = Array.isArray(data.hiddenTools) ? data.hiddenTools.map((t) => String(t)) : [];
  if (data.disableReview) {
    payload.disableReview = true;
  } else {
    delete payload.disableReview;
  }
  if (typeof data.systemPrompt === 'string') {
    const sp = data.systemPrompt.trim();
    if (sp) {
      payload.systemPrompt = data.systemPrompt;
    } else {
      delete payload.systemPrompt;
    }
  }
  try {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  return { ok: true };
}

/** Delete a tool profile file. The built-in "full" profile cannot be deleted. */
export function deleteToolProfile(id: string): SaveProfileResult {
  const safeId = String(id ?? '').trim();
  if (!safeId) {
    return { ok: false, error: 'Profile id cannot be empty.' };
  }
  if (safeId === DEFAULT_TOOL_PROFILE) {
    return { ok: false, error: 'The default "full" profile cannot be deleted.' };
  }
  if (!profilesDir) {
    return { ok: false, error: 'Tool profiles directory is not initialized.' };
  }
  const file = path.join(profilesDir, safeId + '.json');
  if (!fs.existsSync(file)) {
    // Idempotent: deleting a non-existent profile is a success.
    return { ok: true };
  }
  try {
    fs.unlinkSync(file);
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  return { ok: true };
}



function loadHiddenTools(profileName: string): string[] {
  if (!profilesDir) return [];
  const file = path.join(profilesDir, profileName + '.json');
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data || !Array.isArray(data.hiddenTools)) return [];
    return data.hiddenTools.map((t: unknown) => String(t));
  } catch {
    return [];
  }
}

function loadDisableReview(profileName: string): boolean {
  if (!profilesDir) return false;
  const file = path.join(profilesDir, profileName + '.json');
  if (!fs.existsSync(file)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return !!(data && data.disableReview === true);
  } catch {
    return false;
  }
}

/** Load the profile's custom system prompt ('' when absent/unreadable). */
function loadSystemPrompt(profileName: string): string | null {
  if (!profilesDir) return null;
  const file = path.join(profilesDir, profileName + '.json');
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return data && typeof data.systemPrompt === 'string' ? data.systemPrompt : null;
  } catch {
    return null;
  }
}

const TOOL_PROFILES_README = `# Tool profiles

This directory holds OpenVibe tool profiles. Each profile is a JSON file
named PROFILE.json (for example minimal.json). A profile hides tools from the
LLM: hidden tools are removed from the request and refused if called.

"full" is the default profile (all tools visible).

Format of a profile file:

{
  "name": "minimal",
  "description": "Read-only + chat tools only",
  "hiddenTools": ["edit", "create_directory", "run_shell_command"],
  "disableReview": false,
  "systemPrompt": "optional custom system prompt (see below)"
}

- hiddenTools lists tool names to hide from the LLM. Leave it empty for all tools.
- task_complete is protected and cannot be hidden.
- disableReview (optional): when true, the independent LLM review of edit is skipped.
- systemPrompt (optional, string): 自定义系统提示词. When set to a non-empty
  string, this profile REPLACES the built-in coding-assistant system prompt
  (identity + rules) for every request made while the profile is active —
  e.g. to run the AI under a custom persona. The language instruction and the
  host-environment block are still appended automatically so tools keep
  working. An empty string or a missing field = use the built-in default.
  The settings dashboard (🧭 模式与插件) provides a textarea to edit it and a
  one-click button to load a sample 40k "2K 型机仆虚拟模拟器" persona.

To switch profiles, set vibe-coding.toolProfile in settings to a profile name.
The change applies immediately (no restart required).
`;
