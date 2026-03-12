// ---------------------------------------------------------------------------
// Mission Control -- Zustand store
// ---------------------------------------------------------------------------

import { create } from 'zustand';

import type {
  ActivityEntry,
  Asset,
  Card,
  Category,
  ColumnId,
  Priority,
  Project,
  View,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Resilient fetch -- retries once on 500 / network errors (handles Turbopack
// recompile windows where the server briefly returns broken responses).
// ---------------------------------------------------------------------------

async function resilientFetch(url: string, init?: RequestInit): Promise<Response> {
  const attempt = async () => {
    const res = await fetch(url, init);
    if (res.status >= 500) throw new Error(`${res.status}`);
    return res;
  };
  try {
    return await attempt();
  } catch {
    // Wait briefly for the recompile to finish, then retry once
    await new Promise((r) => setTimeout(r, 2000));
    return attempt();
  }
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface MissionControlState {
  // ---- Data -----------------------------------------------------------------
  cards: Card[];
  categories: Category[];
  activity: ActivityEntry[];
  projects: Project[];
  assets: Asset[];

  // ---- UI state -------------------------------------------------------------
  activeView: View;
  selectedCardId: string | null;
  selectedAssetId: string | null;
  isQuickAddOpen: boolean;
  isCommandPaletteOpen: boolean;
  isNewProjectDialogOpen: boolean;
  isNewAssetDialogOpen: boolean;

  // ---- Bulk selection -------------------------------------------------------
  bulkSelectedCardIds: string[];

  // ---- Filters --------------------------------------------------------------
  filterCategory: string;              // '' means "show all" (backward compat)
  filterPriority: Priority | '';       // '' means "show all"
  filterProjectId: string | '';        // '' means "show all" -- primary filter
  activeProjectId: string | null;      // currently focused project (null = all)

  // ---- Data actions ---------------------------------------------------------
  fetchCards: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchActivity: () => Promise<void>;
  createCard: (data: Partial<Card>) => Promise<void>;
  updateCard: (id: string, data: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (cardId: string, targetColumn: ColumnId, newIndex: number) => Promise<void>;

  // ---- Bulk actions ---------------------------------------------------------
  toggleBulkSelect: (cardId: string) => void;
  clearBulkSelection: () => void;
  selectAllInColumn: (columnId: string) => void;
  bulkMoveCards: (columnId: ColumnId) => Promise<void>;
  bulkArchiveCards: () => Promise<void>;

  // ---- Project actions (async) ----------------------------------------------
  fetchProjects: () => Promise<void>;
  createProject: (data: Partial<Project>) => Promise<void>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  reorderProjects: (projectIds: string[]) => Promise<void>;

  // ---- Asset actions (async) ------------------------------------------------
  fetchAssets: (projectId?: string) => Promise<void>;
  createAsset: (data: Partial<Asset>) => Promise<void>;
  updateAsset: (id: string, data: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  linkAssetToCard: (assetId: string, cardId: string) => Promise<void>;
  unlinkAssetFromCard: (assetId: string, cardId: string) => Promise<void>;

  // ---- UI actions -----------------------------------------------------------
  setActiveView: (view: View) => void;
  setSelectedCardId: (id: string | null) => void;
  setSelectedAssetId: (id: string | null) => void;
  toggleQuickAdd: () => void;
  toggleCommandPalette: () => void;
  setFilterCategory: (category: string) => void;
  setFilterPriority: (priority: Priority | '') => void;
  setFilterProjectId: (projectId: string | '') => void;
  setActiveProjectId: (id: string | null) => void;
  navigateToProject: (projectId: string) => void;
  toggleNewProjectDialog: () => void;
  toggleNewAssetDialog: () => void;

  // ---- Computed helpers (derive from current state) -------------------------
  getCardsByColumn: (columnId: ColumnId) => Card[];
  getFilteredCards: () => Card[];
  getActiveProject: () => Project | null;
  getProjectCards: (projectId: string) => Card[];
  getProjectAssets: (projectId: string) => Asset[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply the active project, category, and priority filters to a list of cards.
 * Only non-archived cards are returned.
 *
 * `filterProjectId` is the primary filter; `filterCategory` is kept for
 * backward compatibility and still respected when set.
 */
function applyFilters(
  cards: Card[],
  filterProjectId: string | '',
  filterCategory: string,
  filterPriority: Priority | '',
): Card[] {
  return cards.filter((card) => {
    if (card.archived) return false;
    if (filterProjectId && card.project_id !== filterProjectId) return false;
    if (filterCategory && card.category !== filterCategory) return false;
    if (filterPriority && card.priority !== filterPriority) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<MissionControlState>()((set, get) => ({
  // ---- Initial data ---------------------------------------------------------
  cards: [],
  categories: [],
  activity: [],
  projects: [],
  assets: [],

  // ---- Initial UI state -----------------------------------------------------
  activeView: 'dashboard',
  selectedCardId: null,
  selectedAssetId: null,
  isQuickAddOpen: false,
  isCommandPaletteOpen: false,
  isNewProjectDialogOpen: false,
  isNewAssetDialogOpen: false,

  // ---- Initial bulk selection ------------------------------------------------
  bulkSelectedCardIds: [],

  // ---- Initial filters ------------------------------------------------------
  filterCategory: '',
  filterPriority: '',
  filterProjectId: '',
  activeProjectId: null,

  // --------------------------------------------------------------------------
  // Data actions
  // --------------------------------------------------------------------------

  fetchCards: async () => {
    try {
      const res = await resilientFetch('/api/cards');
      if (!res.ok) throw new Error(`GET /api/cards failed: ${res.status}`);
      const json = await res.json();
      // API returns { cards: [...] }, map archived from 0/1 to boolean
      const cards: Card[] = (json.cards ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        archived: Boolean(c.archived),
      }));
      set({ cards });
    } catch (error) {
      console.error('[store] fetchCards:', error);
    }
  },

  fetchCategories: async () => {
    try {
      const res = await resilientFetch('/api/categories');
      if (!res.ok) throw new Error(`GET /api/categories failed: ${res.status}`);
      const json = await res.json();
      set({ categories: json.categories ?? [] });
    } catch (error) {
      console.error('[store] fetchCategories:', error);
    }
  },

  fetchActivity: async () => {
    try {
      const res = await resilientFetch('/api/activity');
      if (!res.ok) throw new Error(`GET /api/activity failed: ${res.status}`);
      const json = await res.json();
      set({ activity: json.entries ?? [] });
    } catch (error) {
      console.error('[store] fetchActivity:', error);
    }
  },

  createCard: async (data) => {
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`POST /api/cards failed: ${res.status}`);

      // Refetch cards and activity to stay in sync with the server.
      await Promise.all([get().fetchCards(), get().fetchActivity()]);
    } catch (error) {
      console.error('[store] createCard:', error);
    }
  },

  updateCard: async (id, data) => {
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PATCH /api/cards/${id} failed: ${res.status}`);

      await Promise.all([get().fetchCards(), get().fetchActivity()]);
    } catch (error) {
      console.error('[store] updateCard:', error);
    }
  },

  deleteCard: async (id) => {
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE /api/cards/${id} failed: ${res.status}`);

      // If the deleted card was selected, clear the selection.
      if (get().selectedCardId === id) {
        set({ selectedCardId: null });
      }

      await Promise.all([get().fetchCards(), get().fetchActivity()]);
    } catch (error) {
      console.error('[store] deleteCard:', error);
    }
  },

  moveCard: async (cardId, targetColumn, newIndex) => {
    // Optimistic update: move the card in local state immediately so the UI
    // feels responsive while the network request is in-flight.
    const prev = get().cards;
    const cardIndex = prev.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    const card = prev[cardIndex];
    const withoutCard = prev.filter((c) => c.id !== cardId);

    // Determine cards currently in the target column (sorted).
    const columnCards = withoutCard
      .filter((c) => c.column_id === targetColumn)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Build a new sort_order for the moved card.
    let newSortOrder: number;
    if (columnCards.length === 0) {
      newSortOrder = 0;
    } else if (newIndex <= 0) {
      newSortOrder = columnCards[0].sort_order - 1;
    } else if (newIndex >= columnCards.length) {
      newSortOrder = columnCards[columnCards.length - 1].sort_order + 1;
    } else {
      newSortOrder =
        (columnCards[newIndex - 1].sort_order + columnCards[newIndex].sort_order) / 2;
    }

    const updatedCard: Card = {
      ...card,
      column_id: targetColumn,
      sort_order: newSortOrder,
    };

    set({ cards: [...withoutCard, updatedCard] });

    try {
      const res = await fetch('/api/cards/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, targetColumn, newIndex }),
      });
      if (!res.ok) throw new Error(`POST /api/cards/reorder failed: ${res.status}`);

      // Refetch to reconcile with server-assigned sort_order values.
      await get().fetchCards();
    } catch (error) {
      console.error('[store] moveCard:', error);
      // Rollback to the previous state on failure.
      set({ cards: prev });
    }
  },

  // --------------------------------------------------------------------------
  // Bulk actions
  // --------------------------------------------------------------------------

  toggleBulkSelect: (cardId) =>
    set((state) => {
      const ids = state.bulkSelectedCardIds;
      const exists = ids.includes(cardId);
      return {
        bulkSelectedCardIds: exists
          ? ids.filter((id) => id !== cardId)
          : [...ids, cardId],
      };
    }),

  clearBulkSelection: () => set({ bulkSelectedCardIds: [] }),

  selectAllInColumn: (columnId) => {
    const { cards, filterProjectId, filterCategory, filterPriority, bulkSelectedCardIds } = get();
    const columnCardIds = applyFilters(cards, filterProjectId, filterCategory, filterPriority)
      .filter((c) => c.column_id === columnId)
      .map((c) => c.id);

    // Merge with existing selection (avoid duplicates)
    const merged = new Set([...bulkSelectedCardIds, ...columnCardIds]);
    set({ bulkSelectedCardIds: Array.from(merged) });
  },

  bulkMoveCards: async (columnId) => {
    const { bulkSelectedCardIds, cards } = get();
    if (bulkSelectedCardIds.length === 0) return;

    // Optimistic update: move selected cards to the target column locally
    const prev = cards;
    const updated = cards.map((c) =>
      bulkSelectedCardIds.includes(c.id)
        ? { ...c, column_id: columnId }
        : c
    );
    set({ cards: updated, bulkSelectedCardIds: [] });

    try {
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_ids: bulkSelectedCardIds,
          action: 'move',
          column_id: columnId,
        }),
      });
      if (!res.ok) throw new Error(`POST /api/cards/bulk failed: ${res.status}`);

      // Reconcile with server
      await Promise.all([get().fetchCards(), get().fetchActivity()]);
    } catch (error) {
      console.error('[store] bulkMoveCards:', error);
      set({ cards: prev });
    }
  },

  bulkArchiveCards: async () => {
    const { bulkSelectedCardIds, cards } = get();
    if (bulkSelectedCardIds.length === 0) return;

    // Optimistic update: mark selected cards as archived locally
    const prev = cards;
    const updated = cards.map((c) =>
      bulkSelectedCardIds.includes(c.id)
        ? { ...c, archived: true }
        : c
    );
    set({ cards: updated, bulkSelectedCardIds: [] });

    try {
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_ids: bulkSelectedCardIds,
          action: 'archive',
        }),
      });
      if (!res.ok) throw new Error(`POST /api/cards/bulk failed: ${res.status}`);

      // Reconcile with server
      await Promise.all([get().fetchCards(), get().fetchActivity()]);
    } catch (error) {
      console.error('[store] bulkArchiveCards:', error);
      set({ cards: prev });
    }
  },

  // --------------------------------------------------------------------------
  // Project actions (async)
  // --------------------------------------------------------------------------

  fetchProjects: async () => {
    try {
      const res = await resilientFetch('/api/projects');
      if (!res.ok) throw new Error(`GET /api/projects failed: ${res.status}`);
      const json = await res.json();
      set({ projects: json.projects ?? [] });
    } catch (error) {
      console.error('[store] fetchProjects:', error);
    }
  },

  createProject: async (data) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`POST /api/projects failed: ${res.status}`);

      await get().fetchProjects();
    } catch (error) {
      console.error('[store] createProject:', error);
    }
  },

  updateProject: async (id, data) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PATCH /api/projects/${id} failed: ${res.status}`);

      await get().fetchProjects();
    } catch (error) {
      console.error('[store] updateProject:', error);
    }
  },

  archiveProject: async (id) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE /api/projects/${id} failed: ${res.status}`);

      // Clear activeProjectId if the archived project was the active one.
      if (get().activeProjectId === id) {
        set({ activeProjectId: null });
      }

      await get().fetchProjects();
    } catch (error) {
      console.error('[store] archiveProject:', error);
    }
  },

  reorderProjects: async (projectIds) => {
    // Optimistic update: reorder local projects array to match the new order
    // immediately so the sidebar feels responsive.
    const prev = get().projects;

    const idToProject = new Map(prev.map((p) => [p.id, p]));
    const reordered = projectIds
      .map((id, index) => {
        const project = idToProject.get(id);
        if (!project) return null;
        return { ...project, sort_order: index };
      })
      .filter((p): p is Project => p !== null);

    // Merge: keep projects not in the reordered list (e.g. non-active) unchanged.
    const reorderedIds = new Set(projectIds);
    const unchanged = prev.filter((p) => !reorderedIds.has(p.id));
    set({ projects: [...reordered, ...unchanged] });

    try {
      // Fire PATCH requests in parallel to update each project's sort_order.
      await Promise.all(
        projectIds.map((id, index) =>
          fetch(`/api/projects/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: index }),
          }).then((res) => {
            if (!res.ok)
              throw new Error(`PATCH /api/projects/${id} failed: ${res.status}`);
          }),
        ),
      );

      // Refetch to reconcile with server state.
      await get().fetchProjects();
    } catch (error) {
      console.error('[store] reorderProjects:', error);
      // Rollback to the previous state on failure.
      set({ projects: prev });
    }
  },

  // --------------------------------------------------------------------------
  // Asset actions (async)
  // --------------------------------------------------------------------------

  fetchAssets: async (projectId?: string) => {
    try {
      const url = projectId
        ? `/api/assets?project_id=${encodeURIComponent(projectId)}`
        : '/api/assets';
      const res = await resilientFetch(url);
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      const json = await res.json();
      set({ assets: json.assets ?? [] });
    } catch (error) {
      console.error('[store] fetchAssets:', error);
    }
  },

  createAsset: async (data) => {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`POST /api/assets failed: ${res.status}`);

      await get().fetchAssets();
    } catch (error) {
      console.error('[store] createAsset:', error);
    }
  },

  updateAsset: async (id, data) => {
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PATCH /api/assets/${id} failed: ${res.status}`);

      await get().fetchAssets();
    } catch (error) {
      console.error('[store] updateAsset:', error);
    }
  },

  deleteAsset: async (id) => {
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE /api/assets/${id} failed: ${res.status}`);

      // Clear selectedAssetId if the deleted asset was selected.
      if (get().selectedAssetId === id) {
        set({ selectedAssetId: null });
      }

      await get().fetchAssets();
    } catch (error) {
      console.error('[store] deleteAsset:', error);
    }
  },

  linkAssetToCard: async (assetId, cardId) => {
    try {
      const res = await fetch(`/api/assets/${assetId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId }),
      });
      if (!res.ok)
        throw new Error(`POST /api/assets/${assetId}/links failed: ${res.status}`);
    } catch (error) {
      console.error('[store] linkAssetToCard:', error);
    }
  },

  unlinkAssetFromCard: async (assetId, cardId) => {
    try {
      const res = await fetch(`/api/assets/${assetId}/links/${cardId}`, {
        method: 'DELETE',
      });
      if (!res.ok)
        throw new Error(
          `DELETE /api/assets/${assetId}/links/${cardId} failed: ${res.status}`,
        );
    } catch (error) {
      console.error('[store] unlinkAssetFromCard:', error);
    }
  },

  // --------------------------------------------------------------------------
  // UI actions
  // --------------------------------------------------------------------------

  setActiveView: (view) => set({ activeView: view }),

  setSelectedCardId: (id) => set({ selectedCardId: id }),

  setSelectedAssetId: (id) => set({ selectedAssetId: id }),

  toggleQuickAdd: () => set((state) => ({ isQuickAddOpen: !state.isQuickAddOpen })),

  toggleCommandPalette: () =>
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),

  setFilterCategory: (category) => set({ filterCategory: category }),

  setFilterPriority: (priority) => set({ filterPriority: priority }),

  setFilterProjectId: (projectId) => set({ filterProjectId: projectId }),

  setActiveProjectId: (id) => set({ activeProjectId: id }),

  navigateToProject: (projectId) =>
    set({ activeProjectId: projectId, activeView: 'project_detail' }),

  toggleNewProjectDialog: () =>
    set((state) => ({ isNewProjectDialogOpen: !state.isNewProjectDialogOpen })),

  toggleNewAssetDialog: () =>
    set((state) => ({ isNewAssetDialogOpen: !state.isNewAssetDialogOpen })),

  // --------------------------------------------------------------------------
  // Computed helpers
  // --------------------------------------------------------------------------

  getCardsByColumn: (columnId) => {
    const { cards, filterProjectId, filterCategory, filterPriority } = get();
    return applyFilters(cards, filterProjectId, filterCategory, filterPriority)
      .filter((card) => card.column_id === columnId)
      .sort((a, b) => a.sort_order - b.sort_order);
  },

  getFilteredCards: () => {
    const { cards, filterProjectId, filterCategory, filterPriority } = get();
    return applyFilters(cards, filterProjectId, filterCategory, filterPriority);
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    if (!activeProjectId) return null;
    return projects.find((p) => p.id === activeProjectId) ?? null;
  },

  getProjectCards: (projectId) => {
    const { cards } = get();
    return cards.filter((c) => !c.archived && c.project_id === projectId);
  },

  getProjectAssets: (projectId) => {
    const { assets } = get();
    return assets.filter((a) => a.project_id === projectId);
  },
}));
