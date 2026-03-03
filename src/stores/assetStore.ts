import { create } from "zustand";
import type { Tables } from "@/integrations/supabase/types";

type Asset = Tables<"assets">;
type Blueprint = Tables<"blueprints">;

interface AssetStore {
  /** Currently selected asset (for detail views) */
  currentAsset: Asset | null;
  currentBlueprint: Blueprint | null;

  setCurrentAsset: (asset: Asset | null) => void;
  setCurrentBlueprint: (blueprint: Blueprint | null) => void;
  clearCurrent: () => void;
}

export const useAssetStore = create<AssetStore>((set) => ({
  currentAsset: null,
  currentBlueprint: null,

  setCurrentAsset: (asset) => set({ currentAsset: asset }),
  setCurrentBlueprint: (blueprint) => set({ currentBlueprint: blueprint }),
  clearCurrent: () => set({ currentAsset: null, currentBlueprint: null }),
}));
