import * as path from 'path';
import * as fs from 'fs';
import { getWorkspaceRoot } from '../utils/pathHelpers';

// ─── Global skills pool ──────────────────────────────────────────────────────
let _globalSkillsDir: string | null = null;

export function setGlobalSkillsDir(dir: string): void {
  _globalSkillsDir = dir;
}

function getOrCreateGlobalSkillsDir(): string | null {
  if (!_globalSkillsDir) return null;
  try {
    if (!fs.existsSync(_globalSkillsDir)) {
      fs.mkdirSync(_globalSkillsDir, { recursive: true });
    }
    return _globalSkillsDir;
  } catch {
    return null;
  }
}

// ─── Skill pool lookup helpers ────────────────────────────────────────────────
function _skillSearchPaths(workspaceRoot: string): string[] {
  const paths: string[] = [];
  const local = path.join(workspaceRoot, '.OpenVibe', 'skills');
  paths.push(local);
  if (_globalSkillsDir) {
    paths.push(_globalSkillsDir);
  }
  return paths;
}

function _findSkillAcrossPools(name: string): { skillPath: string; poolLabel: string } | null {
  try {
    const root = getWorkspaceRoot();
    const searchPaths = _skillSearchPaths(root);
    for (const base of searchPaths) {
      const sp = path.join(base, name, 'SKILL.md');
      if (fs.existsSync(sp)) {
        const poolLabel = base === searchPaths[0] ? 'workspace' : 'global';
        return { skillPath: sp, poolLabel };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function _listSkillsFromDir(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

// ─── Session-level skill activation callbacks ─────────────────────────────────
let _getActivatedSkills: () => string[] = () => [];
let _setActivatedSkills: (skills: string[]) => void = () => {};

export function setActivatedSkillsCallbacks(
  getter: () => string[],
  setter: (skills: string[]) => void
): void {
  _getActivatedSkills = getter;
  _setActivatedSkills = setter;
}

export {
  getOrCreateGlobalSkillsDir,
  _skillSearchPaths,
  _findSkillAcrossPools,
  _listSkillsFromDir,
  _getActivatedSkills,
  _setActivatedSkills,
};