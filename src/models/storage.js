import { ModelLibrary } from "./library.js";
export const LIBRARY_KEY = "pouch-model-library-v1";
export class LibraryStorage {
  constructor(storage, key = LIBRARY_KEY) {
    this.storage = storage;
    this.key = key;
    this.raw = null;
    this.blocked = false;
    this.error = "";
    this.library = new ModelLibrary();
    try {
      this.raw = storage.getItem(key);
      if (this.raw !== null)
        this.library = new ModelLibrary(JSON.parse(this.raw));
    } catch (e) {
      this.blocked = true;
      this.error = "보관함 읽기 실패 · 원본 보존 중: " + e.message;
    }
  }
  backups() {
    const keys = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(this.key + ".recovery.")) keys.push(key);
      }
    } catch {}
    return keys.sort();
  }
  backup(key) {
    if (!key?.startsWith(this.key + ".recovery."))
      throw Error("복구 백업 키 오류");
    return this.storage.getItem(key);
  }
  save(next) {
    if (this.blocked)
      throw Error(
        "손상 원본을 먼저 백업·복구해야 합니다. 현재 메모리와 원본은 유지됩니다.",
      );
    const candidate = new ModelLibrary(next.snapshot()),
      raw = JSON.stringify(candidate.snapshot());
    // Web Storage setItem is atomic. Do not publish the candidate on failure.
    try {
      this.storage.setItem(this.key, raw);
    } catch (e) {
      throw Error("보관함 저장 실패 · 기존 데이터 유지: " + e.message);
    }
    this.library = candidate;
    this.raw = raw;
    return candidate;
  }
  recover() {
    if (!this.blocked) throw Error("복구가 필요한 상태가 아닙니다");
    if (this.raw === null)
      throw Error("원본을 읽을 수 없습니다. 브라우저 저장 권한을 확인하세요.");
    const backupKey =
      this.key + ".recovery." + Date.now() + "." + crypto.randomUUID();
    this.storage.setItem(backupKey, this.raw);
    const empty = new ModelLibrary(),
      text = JSON.stringify(empty.snapshot());
    this.storage.setItem(this.key, text); // If this fails, the old main entry remains.
    this.library = empty;
    this.raw = text;
    this.blocked = false;
    this.error = "";
    return backupKey;
  }
}
