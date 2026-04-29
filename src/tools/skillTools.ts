import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/pathHelpers';
import {
  _skillSearchPaths,
  _findSkillAcrossPools,
  _listSkillsFromDir,
  _getActivatedSkills,
  _setActivatedSkills,
} from './helpers';

// ─── Frontmatter parser ──────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { attributes: Record<string, any>; body: string } {
  const lines = raw.split(/\x0d?\x0a/);
  const attrs: Record<string, any> = {};
  let bodyStart = 0;

  if (lines.length > 0 && lines[0].trim() === '---') {
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== -1) {
      for (let i = 1; i < endIdx; i++) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          let value: any = line.slice(colonIdx + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            const inner = value.slice(1, -1);
            value = inner.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          }
          attrs[key] = value;
        }
      }
      bodyStart = endIdx + 1;
    }
  }

  const body = lines.slice(bodyStart).join('\x0a').trim();
  return { attributes: attrs, body };
}

// ─── Skill functions ─────────────────────────────────────────────────────────

export function listSkillsTool(): string {
  try {
    const root = getWorkspaceRoot();
    const searchPaths = _skillSearchPaths(root);
    const seen = new Set<string>();
    const allSkills: string[] = [];

    for (const base of searchPaths) {
      const names = _listSkillsFromDir(base);
      for (const n of names) {
        if (!seen.has(n)) {
          seen.add(n);
          allSkills.push(n);
        }
      }
    }
    allSkills.sort();
    return JSON.stringify({ skills: allSkills, total: allSkills.length });
  } catch (e: any) {
    return JSON.stringify({ error: 'Failed to list skills: ' + e.message });
  }
}

export interface SkillLoadParams {
  name: string;
}

export function loadSkillTool(params: SkillLoadParams): string {
  try {
    const found = _findSkillAcrossPools(params.name);
    if (!found) {
      return JSON.stringify({
        error: 'Skill not found: ' + params.name + ' (not found in workspace or global skill pool)',
      });
    }
    const raw = fs.readFileSync(found.skillPath, 'utf-8');
    const { attributes, body } = parseFrontmatter(raw);

    const name = attributes.name ?? params.name;
    const description = attributes.description ?? '';
    const subSkills: string[] = Array.isArray(attributes.subSkills)
      ? attributes.subSkills
      : (typeof attributes.subSkills === 'string' ? [attributes.subSkills] : []);

    return JSON.stringify({
      name,
      description,
      instruction: body,
      subSkills,
      filePath: found.skillPath,
      pool: found.poolLabel,
    });
  } catch (e: any) {
    return JSON.stringify({ error: 'Failed to load skill: ' + e.message });
  }
}

export function activateSkillTool(params: { name: string }): string {
  try {
    const found = _findSkillAcrossPools(params.name);
    if (!found) {
      return JSON.stringify({
        error: 'Cannot activate: skill "' + params.name + '" not found in any skill pool. Use list_skills to see available skills.',
      });
    }

    const current = _getActivatedSkills();
    if (current.includes(params.name)) {
      return JSON.stringify({
        success: true,
        message: 'Skill "' + params.name + '" is already active.',
        activatedSkills: current,
      });
    }

    const updated = [...current, params.name];
    _setActivatedSkills(updated);
    return JSON.stringify({
      success: true,
      message: 'Skill "' + params.name + '" activated for this conversation.',
      activatedSkills: updated,
    });
  } catch (e: any) {
    return JSON.stringify({ error: 'Failed to activate skill: ' + e.message });
  }
}

export function deactivateSkillTool(params: { name: string }): string {
  try {
    const current = _getActivatedSkills();
    if (!current.includes(params.name)) {
      return JSON.stringify({
        success: true,
        message: 'Skill "' + params.name + '" is not active in this conversation.',
        activatedSkills: current,
      });
    }

    const updated = current.filter(s => s !== params.name);
    _setActivatedSkills(updated);
    return JSON.stringify({
      success: true,
      message: 'Skill "' + params.name + '" deactivated for this conversation.',
      activatedSkills: updated,
    });
  } catch (e: any) {
    return JSON.stringify({ error: 'Failed to deactivate skill: ' + e.message });
  }
}

export function listActivatedSkillsTool(): string {
  try {
    const skills = _getActivatedSkills();
    return JSON.stringify({
      activatedSkills: skills,
      total: skills.length,
    });
  } catch (e: any) {
    return JSON.stringify({ error: 'Failed to list activated skills: ' + e.message });
  }
}

export function loadActivatedSkillInstruction(name: string): string | null {
  try {
    const found = _findSkillAcrossPools(name);
    if (!found) return null;
    const raw = fs.readFileSync(found.skillPath, 'utf-8');
    const { body } = parseFrontmatter(raw);
    return body || null;
  } catch {
    return null;
  }
}
