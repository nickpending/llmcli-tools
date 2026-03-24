// Core operations
export {
  init,
  add,
  use,
  remove,
  list,
  get,
  search,
  sync,
  push,
  status,
} from "./lib/core";

// Types
export type {
  ResourceType,
  CatalogEntry,
  Catalog,
  InstalledEntry,
  KitState,
  KitConfig,
  ListOptions,
  ListResult,
  GetResult,
  SearchResult,
  UseResult,
  RemoveResult,
  AddResult,
  InitResult,
  SyncResult,
  PushResult,
  StatusResult,
} from "./lib/types";

// Config utilities
export { getConfig, resetConfig } from "./lib/config";

// Catalog utilities (for advanced use)
export { loadCatalog, saveCatalog, findEntry } from "./lib/catalog";

// State utilities (for advanced use)
export { loadState, isInstalled, getInstalled } from "./lib/state";

// Path utilities
export { xdg, files, getInstallPath } from "./lib/paths";
