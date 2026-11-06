export type UniverseId = "editor" | "ai" | "super";
export type Universe = { id: UniverseId; route: string; title: string; subtitle: string; description: string; cta: string; hue: string; c1: string; c2: string; c3: string; locked?: boolean };

export const UNIVERSES: Universe[] = [
  { id: "editor", route: "/editor", title: "EDITOR UNIVERSE", subtitle: "Professional Editing & Post-Production",
    description: "Professional video editing, AI editing, magic editing, VFX, animation, audio, colour grading and rendering.",
    cta: "ENTER EDITOR UNIVERSE", hue: "blue", c1: "#2563eb", c2: "#22d3ee", c3: "#60a5fa" },
  { id: "ai", route: "/ai-generator", title: "AI GENERATOR UNIVERSE", subtitle: "AI Generation & Creative Intelligence",
    description: "120 generator tools in 12 studios: video, image, animation, music, voice, writing, localization and automation — powered by Veo, Kling, FLUX and our own cloud engines.",
    cta: "ENTER AI GENERATOR UNIVERSE", hue: "violet", c1: "#7c3aed", c2: "#d946ef", c3: "#a78bfa" },
  { id: "super", route: "/super", title: "SUPER UNIVERSE", subtitle: "Ultimate AI Creative Command Center",
    description: "Unified command center: every project, job, model and teammate across universes — with orchestration and automation on the roadmap.",
    cta: "ENTER SUPER UNIVERSE", hue: "emerald", c1: "#10b981", c2: "#06b6d4", c3: "#f59e0b",
    locked: true },  // opens in a later release; set to false to unlock
];
export const universeById = (id: UniverseId) => UNIVERSES.find((u) => u.id === id)!;
