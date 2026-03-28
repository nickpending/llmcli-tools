/**
 * lib/types.ts — Kit type definitions
 */

export type ResourceType = "skill" | "command" | "tool" | "agent";

export interface CatalogEntry {
  name: string;
  repo: string;
  path: string;
  type: ResourceType;
  domain: string[];
  tags: string[];
  description?: string;
}

export interface Catalog {
  entries: CatalogEntry[];
}

export interface InstalledEntry {
  name: string;
  type: ResourceType;
  installPath: string;
  sourceRepo: string;
  sourcePath: string;
  installedAt: string;
  lastSync?: string;
}

export interface KitState {
  installed: InstalledEntry[];
}

export interface KitConfig {
  catalog: {
    repo: string;
  };
  source?: {
    repo?: string;
  };
  paths?: {
    skills?: string;
    commands?: string;
    tools?: string;
    agents?: string;
  };
}

export interface ListOptions {
  installed?: boolean;
  available?: boolean;
  type?: ResourceType;
  domain?: string;
  tags?: string[];
}

export interface ListResult {
  success: boolean;
  entries: (CatalogEntry & { installed: boolean; installPath?: string })[];
  count: number;
}

export interface GetResult {
  success: boolean;
  entry?: CatalogEntry & { installed: boolean; installPath?: string };
  error?: string;
}

export interface SearchResult {
  success: boolean;
  entries: (CatalogEntry & { installed: boolean })[];
  count: number;
  query: string;
}

export interface UseResult {
  success: boolean;
  name?: string;
  type?: ResourceType;
  installPath?: string;
  error?: string;
}

export interface RemoveResult {
  success: boolean;
  name?: string;
  removed?: "local" | "catalog";
  error?: string;
}

export interface AddResult {
  success: boolean;
  name?: string;
  error?: string;
}

export interface UpdateOptions {
  domain?: string[];
  tags?: string[];
  description?: string;
}

export interface UpdateResult {
  success: boolean;
  name?: string;
  error?: string;
}

export interface InitResult {
  success: boolean;
  catalogPath?: string;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  updated: number;
  failed: number;
  errors: string[];
}

export interface PushResult {
  success: boolean;
  name?: string;
  error?: string;
}

export interface StatusResult {
  success: boolean;
  initialized: boolean;
  catalogRepo?: string;
  installedCount: number;
  entries: {
    name: string;
    type: ResourceType;
    installPath: string;
    lastSync?: string;
    exists: boolean;
  }[];
}

export interface CheckEntry {
  name: string;
  type: ResourceType;
  repo: string;
  path: string;
}

export interface CheckResult {
  success: boolean;
  healthy: CheckEntry[];
  broken: CheckEntry[];
  healthyCount: number;
  brokenCount: number;
  errors: string[];
}
