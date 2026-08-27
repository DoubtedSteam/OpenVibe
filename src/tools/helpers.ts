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

export {
  getOrCreateGlobalSkillsDir,
  ensureGlobalSkillSeeds,
  _skillSearchPaths,
  _findSkillAcrossPools,
  _listSkillsFromDir,
};

// ─── Seed bundled guide skill into the global pool ──────────────────────────
const GUIDE_SKILL_NAME = 'skill-authoring-guide';

/**
 * Deploys the bundled `skill-authoring-guide` SKILL.md (shipped under
 * <extension>/media/skill-authoring-guide/) into the global skills pool so the
 * authoring guide is readable from ANY workspace (list_skills / load_skill).
 *
 * Copies only when the target is missing or its content differs, so it both
 * self-heals fresh installs and syncs guide updates on extension upgrade.
 * Failures are silent — the skills pool must never block extension startup.
 */
function ensureGlobalSkillSeeds(extensionRootFsPath: string): void {
  if (!_globalSkillsDir) return;
  try {
    const seedSrc = path.join(extensionRootFsPath, 'media', GUIDE_SKILL_NAME, 'SKILL.md');
    if (!fs.existsSync(seedSrc)) return; // seed stripped (e.g. custom packaging) → skip

    const destDir = path.join(_globalSkillsDir, GUIDE_SKILL_NAME);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const dest = path.join(destDir, 'SKILL.md');
    const srcContent = fs.readFileSync(seedSrc, 'utf-8');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf-8') !== srcContent) {
      fs.writeFileSync(dest, srcContent, 'utf-8');
    }
  } catch {
    // ignore — never block startup
  }
}