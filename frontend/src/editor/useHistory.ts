import { useCallback, useRef, useState } from "react";

/** Undo/redo stack. `coalesce` merges rapid edits of the same control (e.g. dragging a slider) into one undo step. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback((next: T, coalesce?: string) => {
    setState((s) => {
      if (next === s.present) return s;
      const now = Date.now();
      const merge = coalesce && last.current && last.current.key === coalesce && now - last.current.at < 1200;
      last.current = coalesce ? { key: coalesce, at: now } : null;
      return merge ? { ...s, present: next, future: [] } : { past: [...s.past, s.present].slice(-200), present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setState((s) => s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s), []);
  const redo = useCallback(() => setState((s) => s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s), []);
  const reset = useCallback((v: T) => { last.current = null; setState({ past: [], present: v, future: [] }); }, []);
  /** Change the present without an undo step (e.g. a generated background got its file). */
  const replace = useCallback((f: (v: T) => T) => setState((s) => ({ ...s, present: f(s.present) })), []);

  return { value: state.present, commit, undo, redo, reset, replace, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
