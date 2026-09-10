import * as fs from "node:fs";
import * as path from "node:path";
import type { SddProfileManager } from "./manager.js";
import { reconcileProfileWithFile } from "./sync.js";
import type { Profile } from "./types.js";

export interface ReconcileEvent {
  filePath: string;
  profile: Profile;
  scope: "global" | "project";
}

export interface WatcherOptions {
  manager: SddProfileManager;
  debounceMs?: number;
  onReconciled?: (event: ReconcileEvent) => void;
  onError?: (error: unknown) => void;
}

export class SubagentsConfigWatcher {
  private manager: SddProfileManager;
  private debounceMs: number;
  private onReconciled?: (event: ReconcileEvent) => void;
  private onError?: (error: unknown) => void;
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private isReconciling = false;
  private stopped = false;

  constructor(options: WatcherOptions) {
    this.manager = options.manager;
    this.debounceMs = options.debounceMs ?? 200;
    this.onReconciled = options.onReconciled;
    this.onError = options.onError;
  }

  start(): void {
    if (this.stopped) return;
    this.watchTarget(this.manager.globalSubagentsPath, "global");
    this.watchTarget(this.manager.projectSubagentsPath, "project");
  }

  private watchTarget(targetPath: string, scope: "global" | "project"): void {
    const dir = path.dirname(targetPath);
    const targetFile = path.basename(targetPath);

    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        this.onError?.(err);
        return;
      }
    }

    try {
      const watcher = fs.watch(dir, (_eventType, filename) => {
        if (this.stopped || this.isReconciling) return;
        // filename can be null or buffer depending on platform, normalize to string
        const nameStr = filename ? String(filename) : undefined;
        if (!nameStr || nameStr === targetFile) {
          this.scheduleReconciliation(targetPath, scope);
        }
      });

      watcher.on("error", (err) => {
        this.onError?.(err);
      });

      this.watchers.push(watcher);
    } catch (err) {
      this.onError?.(err);
    }
  }

  scheduleReconciliation(targetPath: string, scope: "global" | "project"): void {
    if (this.stopped) return;

    const existingTimer = this.debounceTimers.get(targetPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(targetPath);
      this.reconcile(targetPath, scope);
    }, this.debounceMs);

    this.debounceTimers.set(targetPath, timer);
  }

  reconcile(targetPath: string, scope: "global" | "project"): boolean {
    if (this.stopped || this.isReconciling) return false;

    const activeProfileName = this.manager.getActiveProfileName();
    if (!activeProfileName) return false;

    const profile = this.manager.getProfile(activeProfileName);
    if (!profile) return false;

    this.isReconciling = true;
    try {
      const { updated } = reconcileProfileWithFile(targetPath, profile);
      if (updated) {
        this.onReconciled?.({ filePath: targetPath, profile, scope });
      }
      return updated;
    } catch (err) {
      this.onError?.(err);
      return false;
    } finally {
      this.isReconciling = false;
    }
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {}
    }
    this.watchers = [];
  }
}
