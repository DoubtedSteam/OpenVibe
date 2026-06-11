import type { AssistantTodoPersistedState } from '../types';
import type { TodoState } from './todolistReview';

/**
 * Manages todo list state and basic operations for the current conversation.
 * State manipulation is centralized here; control-flow logic (review loops,
 * LLM calls) remains in ToolExecutor.
 */
export class TodoListManager {
  private _todoList: { goal: string; items: { text: string; done: boolean }[] } | null = null;
  private _persist: ((state: TodoState | null) => void) | null = null;
  private _echo: ((content: string) => void) | null = null;

  /** Wire up persistence and UI-echo callbacks (called by ToolExecutor). */
  public wireCallbacks(
    persist: (state: TodoState | null) => void,
    echo: (content: string) => void,
  ): void {
    this._persist = persist;
    this._echo = echo;
  }

  // ── State accessors ──────────────────────────────────────────────────────

  /** Whether a todo list currently exists. */
  public hasList(): boolean {
    return this._todoList !== null;
  }

  /** Current todo list or null. */
  public getList(): { goal: string; items: { text: string; done: boolean }[] } | null {
    return this._todoList;
  }

  /** Restore todo state from workspace session file after extension / window reload. */
  public restorePersistedTodoState(state: AssistantTodoPersistedState | null): void {
    if (!state || typeof state.goal !== 'string' || !Array.isArray(state.items)) {
      this._todoList = null;
      return;
    }
    this._todoList = {
      goal: state.goal,
      items: state.items.map((i) => ({ text: String(i.text), done: !!i.done })),
    };
  }

  /** Clear the todo list and notify persistence. */
  public clearTodoList(): void {
    this._todoList = null;
    this._notifyPersisted();
  }

  /** Replace the todo list entirely (used by review-pass paths). */
  public setList(goal: string, items: { text: string; done: boolean }[]): void {
    this._todoList = { goal, items: items.map((i) => ({ text: i.text, done: !!i.done })) };
  }

  /** Expand at an index: replace one item with several new items. */
  public expandAt(index: number, newItems: string[]): void {
    if (!this._todoList) return;
    this._todoList.items.splice(index, 1, ...newItems.map((text) => ({ text, done: false })));
  }

  /** Mark an item as done by index. */
  public markDone(index: number): boolean {
    if (!this._todoList || index < 0 || index >= this._todoList.items.length) return false;
    this._todoList.items[index].done = true;
    return true;
  }

  // ── Lightweight info for main loop ───────────────────────────────────────

  /** Get the text of a specific todo item by index, or null if out of range. */
  public getItemText(index: number): string | null {
    if (!this._todoList || index < 0 || index >= this._todoList.items.length) return null;
    return this._todoList.items[index].text;
  }

  /** Returns null when no todo list exists. */
  public getControlInfo(): { goal: string; list: string; remaining: number; firstPendingIndex: number } | null {
    if (!this._todoList) return null;
    const { list, remaining } = TodoListManager.formatMarkdown(this._todoList.goal, this._todoList.items);
    const firstPendingIndex = this._todoList.items.findIndex(i => !i.done);
    return { goal: this._todoList.goal, list, remaining, firstPendingIndex };
  }

  // ── Markdown formatter (pure, static) ────────────────────────────────────

  public static formatMarkdown(
    goal: string,
    items: { text: string; done: boolean }[],
  ): { list: string; remaining: number } {
    const list = items.map((item, i) => `${i + 1}. [${item.done ? 'x' : ' '}] ${item.text}`).join('\n');
    const remaining = items.filter((i) => !i.done).length;
    return { list, remaining };
  }

  public static displayList(
    goal: string,
    items: { text: string; done: boolean }[],
  ): { list: string; remaining: number } {
    return TodoListManager.formatMarkdown(goal, items);
  }

  // ── Clone for review baseline ────────────────────────────────────────────

  public cloneState(): TodoState | null {
    if (!this._todoList) return null;
    return {
      goal: this._todoList.goal,
      items: this._todoList.items.map((i) => ({ ...i })),
    };
  }

  // ── UI display helpers ───────────────────────────────────────────────────

  /** Post a display message for created or expanded todo lists. */
  public postDisplay(kind: 'created' | 'expanded', goal: string, items: { text: string; done: boolean }[]): void {
    const { list, remaining } = TodoListManager.formatMarkdown(goal, items);
    if (kind === 'expanded') {
      this._echo?.(`Todo list expanded:\n\n**Goal**: ${goal}\n\n**Items**:\n${list}\n\n**Remaining**: ${remaining} item(s)`);
    } else {
      this._echo?.(`Todo list created:\n\n**Goal**: ${goal}\n\n**Items**:\n${list}`);
    }
  }

  /** Post updated todo list display after item completion. */
  public postUpdateDisplay(items: { text: string; done: boolean }[]): string {
    const { list, remaining } = TodoListManager.formatMarkdown('', items);
    const display = `Todo list updated:\n\n**Items**:\n${list}\n\n**Remaining**: ${remaining} item(s)`;
    this._echo?.(display);
    return list;
  }

  // ── Legacy path when todolist review is disabled ─────────────────────────

  public createWithoutReview(
    goal: string,
    items: string[],
    expandIndex: number | undefined,
  ): string {
    if (this._todoList && expandIndex !== undefined) {
      if (expandIndex < 0 || expandIndex >= this._todoList.items.length) {
        return JSON.stringify({
          error: `Expand index ${expandIndex} is out of range (0–${this._todoList.items.length - 1}).`,
        });
      }
      this.expandAt(expandIndex, items);
      const { list, remaining } = TodoListManager.formatMarkdown(this._todoList.goal, this._todoList.items);
      const result = JSON.stringify({
        success: true,
        message: `Todo list expanded at index ${expandIndex} with ${items.length} items.`,
        goal: this._todoList.goal,
        items: list,
        remaining,
      });
      this.postDisplay('expanded', this._todoList.goal, this._todoList.items);
      this._notifyPersisted();
      return result;
    }

    this._todoList = { goal, items: items.map((text) => ({ text, done: false })) };
    const { list } = TodoListManager.formatMarkdown(goal, this._todoList.items);
    const result = JSON.stringify({
      success: true,
      message: `Todo list created with ${items.length} items.`,
      goal,
      items: list,
    });
    this.postDisplay('created', goal, this._todoList.items);
    this._notifyPersisted();
    return result;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /** Notify the persistence callback of the current state. */
  public _notifyPersisted(): void {
    if (!this._persist) return;
    const cloned = this.cloneState();
    this._persist(cloned);
  }
}
