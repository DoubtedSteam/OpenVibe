import { setActivatedSkillsCallbacks } from '../tools';

/** Manages the lifecycle of activated skills and their persistence callbacks. */
export class ActivatedSkillsManager {
  private _activatedSkills: string[] = [];
  private _persistActivatedSkills: ((skills: string[]) => void) | null = null;

  /**
   * Register persistence callback so that activate/deactivate skill tools
   * can propagate changes to the current conversation session.
   */
  public registerActivatedSkillsPersister(
    getter: () => string[],
    setter: (skills: string[]) => void
  ): void {
    this._activatedSkills = getter();
    this._persistActivatedSkills = setter;
    // Wire up tools.ts callbacks so pure-tool calls inside tools.ts also work.
    setActivatedSkillsCallbacks(
      () => this._activatedSkills,
      (skills) => {
        this._activatedSkills = skills;
        this._persistActivatedSkills?.(skills);
      }
    );
  }

  /** Restore activated skills from session (extension reload). */
  public restore(skills: string[]): void {
    this._activatedSkills = skills;
    this._persistActivatedSkills?.(skills);
    setActivatedSkillsCallbacks(
      () => this._activatedSkills,
      (skills) => {
        this._activatedSkills = skills;
        this._persistActivatedSkills?.(skills);
      }
    );
  }

  /** Get current activated skills. */
  public getActivatedSkills(): string[] {
    return [...this._activatedSkills];
  }

  /** Get current activated skills (private helper — same as public for internal use). */
  private _getActivatedSkills(): string[] {
    return [...this._activatedSkills];
  }

  /** Set current activated skills and persist (called by ToolExecutor internals). */
  public setActivatedSkills(skills: string[]): void {
    this._activatedSkills = [...skills];
    this._persistActivatedSkills?.(this._activatedSkills);
  }
}
