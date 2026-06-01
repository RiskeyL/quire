// update-notifier@7 ships no type declarations of its own (its package `exports` is a
// bare "./index.js"). Declare just the surface Quire uses: updateNotifier({ pkg }).notify().
declare module "update-notifier" {
  interface UpdateNotifier {
    notify(options?: { defer?: boolean; message?: string; isGlobal?: boolean }): UpdateNotifier;
  }
  interface Settings {
    pkg: { name: string; version: string };
    updateCheckInterval?: number;
    shouldNotifyInNpmScript?: boolean;
  }
  export default function updateNotifier(settings: Settings): UpdateNotifier;
}
