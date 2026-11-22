import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { navigationLanguages, navigationPhrase } from "./interfacePhrases";

type Engine = { translate: (source: string) => Promise<string>; destroy: () => void };
type Pair = { sourceLanguage: string; targetLanguage: string };
type TranslatorApi = { availability: (pair: Pair) => Promise<string>; create: (pair: Pair) => Promise<Engine> };
const api = (globalThis as typeof globalThis & { Translator?: TranslatorApi }).Translator;
const pair = (targetLanguage: string): Pair => ({ sourceLanguage: "en", targetLanguage });
const storageKey = "cu.interface.language";
const candidates = "ar bg bn cs da de el es fi fr he hi hr hu id it ja kn ko lt mr nl no pl pt ro ru sk sl sv ta te th tr uk vi zh zh-Hant".split(" ");
const nativeName = (code: string) => new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
type Locale = { code: string; translate?: (source: string) => Promise<string> };
const Context = createContext<Locale>({ code: "en" });

export function InterfaceText({ source }: { source: string }) {
  const { code, translate } = useContext(Context);
  const text = source.trim();
  const local = navigationPhrase(code, text);
  const [result, setResult] = useState<{ code: string; text: string; value: string }>();
  useEffect(() => {
    if (local || !translate || !text) return;
    let current = true;
    translate(text).then((value) => { if (current) setResult({ code, text, value }); }).catch(() => {});
    return () => { current = false; };
  }, [code, translate, local, text]);
  const value = local ?? (result?.code === code && result.text === text ? result.value : undefined);
  return <>{value ? source.replace(text, () => value) : source}</>;
}

export function InterfaceLanguage({ children }: { children: ReactNode }) {
  const [code, setCode] = useState("en");
  const [engine, setEngine] = useState<Engine>();
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  async function choose(next: string, useModel: boolean) {
    const request = ++revision.current;
    setBusy(true);
    setNotice("");
    try {
      const translator = useModel && api ? await api.create(pair(next)) : undefined;
      if (request !== revision.current) { translator?.destroy(); return; }
      setEngine(translator);
      setCode(next);
      try { localStorage.setItem(storageKey, next); } catch { /* storage disabled */ }
    } catch {
      if (request === revision.current) setNotice("The language pack could not load. Select a language to try again.");
    } finally { if (request === revision.current) setBusy(false); }
  }
  useEffect(() => {
    let current = true;
    const startingRevision = revision.current;
    async function load() {
      let saved = "en";
      try { saved = localStorage.getItem(storageKey) ?? "en"; } catch { /* storage disabled */ }
      const supported = api ? (await Promise.all(candidates.map(async lang => {
        try { return [lang, await api.availability(pair(lang))] as const; }
        catch { return [lang, "unavailable"] as const; }
      }))).filter(([, state]) => state !== "unavailable") : [];
      if (!current) return;
      setAvailable(supported.map(([lang]) => lang));
      if (revision.current !== startingRevision || saved === "en") return;
      if (supported.some(([lang, state]) => lang === saved && state === "available")) await choose(saved, true);
      else if (navigationLanguages.includes(saved)) setCode(saved);
    }
    void load();
    return () => { current = false; };
  }, []);
  useEffect(() => () => engine?.destroy(), [engine]);
  const locale = useMemo<Locale>(() => {
    if (!engine) return { code };
    const cache = new Map<string, Promise<string>>();
    return { code, translate(source) {
      let pending = cache.get(source);
      if (!pending) {
        pending = engine.translate(source).catch((error) => { cache.delete(source); throw error; });
        cache.set(source, pending);
      }
      return pending;
    } };
  }, [code, engine]);
  useEffect(() => {
    document.documentElement.lang = engine ? code : "en";
    return () => { document.documentElement.lang = "en"; };
  }, [code, engine]);
  const options = [...new Set(["en", ...navigationLanguages, ...available])];
  return <Context.Provider value={locale}>
    <div className="site-language">
      <label><Languages size={15} /><InterfaceText source="Language" /> <select aria-label="Website language" value={code} disabled={busy}
        onChange={(e) => void choose(e.target.value, available.includes(e.target.value))}>
        {options.map((lang) => <option key={lang} value={lang} lang={lang}>{nativeName(lang)}</option>)}
      </select></label>
      <small role="status">{busy ? "Loading language pack…" : notice || (code !== "en" && !engine ? "Common navigation translated" : "")}</small>
    </div>
    {children}
  </Context.Provider>;
}
