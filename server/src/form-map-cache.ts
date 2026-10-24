import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FormMap } from '../../src/shared/contract.ts';

/**
 * Form-map cache, kept in memory and saved to disk so a server restart doesn't make every
 * form slow again. Form maps hold only a form's STRUCTURE turned into questions — never user
 * answers — so saving them is fine.
 *
 * File: FORM_MAP_CACHE_FILE (default server/.cache/form-maps.json). Set it to "" to disable.
 */
const MAX_ENTRIES = 300;
const DEFAULT_FILE = new URL('../.cache/form-maps.json', import.meta.url).pathname;

export class FormMapCache {
  private entries = new Map<string, FormMap>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly file: string | null) {
    this.load();
  }

  static fromEnv(): FormMapCache {
    const v = process.env.FORM_MAP_CACHE_FILE;
    return new FormMapCache(v === '' ? null : (v ?? DEFAULT_FILE));
  }

  get(key: string): FormMap | undefined {
    return this.entries.get(key);
  }

  set(key: string, map: FormMap) {
    this.entries.delete(key);
    this.entries.set(key, map);
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    this.scheduleSave();
  }

  /** All entries, oldest first. */
  all(): [string, FormMap][] {
    return [...this.entries];
  }

  clear() {
    this.entries.clear();
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as [string, FormMap][];
      for (const [k, v] of data) this.entries.set(k, v);
      console.log(`[form-map] loaded ${this.entries.size} cached form maps from ${this.file}`);
    } catch (err) {
      console.warn(`[form-map] could not read cache file (${String(err)}), starting empty`);
    }
  }

  private scheduleSave() {
    if (!this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 300);
    this.saveTimer.unref?.();
  }

  private save() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.all()));
      renameSync(tmp, this.file);
    } catch (err) {
      console.warn(`[form-map] could not save cache: ${String(err)}`);
    }
  }
}
