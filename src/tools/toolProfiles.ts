// ─── tools/toolProfiles.ts ──────────────────────────────────────────────────
// Cross-workspace tool profiles. Each profile is a JSON file in the global
// tool-profiles directory that lists tools to HIDE from the LLM. The default
// profile is "full" (nothing hidden). Changing vibe-coding.toolProfile
// re-applies the filter at runtime without reloading the extension.

import * as fs from 'fs';
import * as path from 'path';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import type { ToolDefinition } from '../types';

export const DEFAULT_TOOL_PROFILE = 'full';

/** Core tools that must stay visible so the agent loop can terminate. */
const PROTECTED_TOOLS = new Set(['task_complete']);

let profilesDir: string | null = null;
const hidden = new Set();
let currentProfile = DEFAULT_TOOL_PROFILE;
let disableReview = false;

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
  return { profile: currentProfile, hidden: getHiddenTools() };
}

/** Whether the active profile disables the independent edit review. */
export function isReviewDisabled(): boolean {
  return disableReview;
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
}

export interface ToolProfileDetail extends ToolProfileInfo {
  /** Tools hidden from the LLM by this profile. */
  hiddenTools: string[];
  /** Whether the profile disables the independent edit review. */
  disableReview: boolean;
}

/** List available tool profiles (mode presets) for the webview selector. */
export function listToolProfiles(): ToolProfileInfo[] {
  return listToolProfilesDetailed().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    hiddenCount: p.hiddenTools.length,
  }));
}

/** List available tool profiles with full details (including hiddenTools / disableReview). */
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
      },
    ];
  }
  try {
    const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const id = file.slice(0, -'.json'.length);
      const detail = readProfileDetail(id);
      profiles.push(
        detail ?? { id, name: id, description: '', hiddenTools: [], disableReview: false }
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
 */
export function saveToolProfile(
  id: string,
  data: { name: string; description: string; hiddenTools: string[]; disableReview: boolean }
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
  const payload: Record<string, unknown> = {
    name: String(data.name ?? '').trim() || safeId,
    description: String(data.description ?? ''),
    hiddenTools: Array.isArray(data.hiddenTools) ? data.hiddenTools.map((t) => String(t)) : [],
  };
  if (data.disableReview) {
    payload.disableReview = true;
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

const TOOL_PROFILES_README = `# Tool profiles

This directory holds OpenVibe tool profiles. Each profile is a JSON file
named PROFILE.json (for example minimal.json). A profile hides tools from the
LLM: hidden tools are removed from the request and refused if called.

"full" is the default profile (all tools visible).

Format of a profile file:

{
  "name": "minimal",
  "description": "Read-only + chat tools only",
  "hiddenTools": ["edit", "create_directory", "run_shell_command"]
}

- hiddenTools lists tool names to hide from the LLM. Leave it empty for all tools.
- task_complete is protected and cannot be hidden.

To switch profiles, set vibe-coding.toolProfile in settings to a profile name.
The change applies immediately (no restart required).
`;
