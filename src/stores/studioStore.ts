import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StudioDraft {
  variationLevel: number;
  actorId: string | null;
  voiceId: string | null;
  emotionalIntensity: number;
  scenarioPrompt: string;
  productImageUrl: string | null;
}

interface StudioStore extends StudioDraft {
  setField: <K extends keyof StudioDraft>(key: K, value: StudioDraft[K]) => void;
  resetDraft: () => void;
}

const defaults: StudioDraft = {
  variationLevel: 2,
  actorId: null,
  voiceId: null,
  emotionalIntensity: 50,
  scenarioPrompt: "",
  productImageUrl: null,
};

export const useStudioStore = create<StudioStore>()(
  persist(
    (set) => ({
      ...defaults,
      setField: (key, value) => set({ [key]: value }),
      resetDraft: () => set(defaults),
    }),
    { name: "ugc-studio-draft" }
  )
);
