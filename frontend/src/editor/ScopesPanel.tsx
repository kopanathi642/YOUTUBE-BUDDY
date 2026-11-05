import { MutableRefObject, useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import type { Sampler } from "./Viewer";

const W = 200, H = 110;

/** Real scopes computed from the composited program frame (including the colour grade). */
export default function ScopesPanel({ samplerRef, tick }: { samplerRef: MutableRefObject<Sampler | null>; tick: number }) {
  const wf = useRef<HTMLCanvasElement>(null), pa = useRef<HTMLCanvasElement>(null), vs = useRef<HTMLCanvasElement>(null), hi = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(0);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 400); return () => clearInterval(t); }, []);

  useEffect(() => {
    const now = performance.now();
    if (now - last.current < 180) return;
    last.current = now;
    const s = samplerRef.current;
    if (!s) return;
    let data: ImageData;
    try {
      const cv = s(192);
      if (!cv) return;
      data = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height);
      setErr(null);
    } catch {
      setErr("Scopes need cross-origin access to media storage (bucket CORS).");
      return;
    }
    draw(data, wf.current!, pa.current!, vs.current!, hi.current!);
  });

  return (
    <section className="panel strip-panel" aria-label="Scopes">
      <div className="strip-head"><Activity size={15} /><b>Scopes</b><span className="dim" style={{ fontSize: 11, marginLeft: 6 }}>live from the program monitor</span></div>
      {err ? <div className="strip-empty">{err}</div> : (
        <div className="scopes">
          {[["Waveform", wf], ["RGB Parade", pa], ["Vectorscope", vs], ["Histogram", hi]].map(([l, r]: any) => (
            <figure key={l}><figcaption>{l}</figcaption><canvas ref={r} width={l === "Vectorscope" ? H : W} height={H} /></figure>
          ))}
        </div>
      )}
      <span hidden>{tick}</span>
    </section>
  );
}

function draw(d: ImageData, wf: HTMLCanvasElement, pa: HTMLCanvasElement, vs: HTMLCanvasElement, hi: HTMLCanvasElement) {
  const { width: w, height: h, data: px } = d;
  const acc = (cv: HTMLCanvasElement) => { const c = cv.getContext("2d")!; const img = c.createImageData(cv.width, cv.height); return { c, img, b: img.data }; };
  const A = acc(wf), P = acc(pa), V = acc(vs);
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const plot = (b: Uint8ClampedArray, cw: number, x: number, y: number, r: number, g: number, bl: number) => {
    const i = (y * cw + x) * 4; b[i] = Math.min(255, b[i] + r); b[i + 1] = Math.min(255, b[i + 1] + g); b[i + 2] = Math.min(255, b[i + 2] + bl); b[i + 3] = 255;
  };
  const third = Math.floor(W / 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hist[0][r]++; hist[1][g]++; hist[2][b]++;
    const X = Math.floor((x / w) * W);
    plot(A.b, W, X, H - 1 - Math.floor((Y / 255) * (H - 1)), 30, 60, 30);
    const px3 = Math.floor((x / w) * third);
    plot(P.b, W, px3, H - 1 - Math.floor((r / 255) * (H - 1)), 70, 10, 10);
    plot(P.b, W, third + px3, H - 1 - Math.floor((g / 255) * (H - 1)), 10, 70, 10);
    plot(P.b, W, 2 * third + px3, H - 1 - Math.floor((b / 255) * (H - 1)), 15, 25, 80);
    const cb = -0.1146 * r - 0.3854 * g + 0.5 * b, cr = 0.5 * r - 0.4542 * g - 0.0458 * b; // BT.709
    const vx = Math.floor(H / 2 + (cb / 128) * (H / 2 - 4)), vy = Math.floor(H / 2 - (cr / 128) * (H / 2 - 4));
    if (vx >= 0 && vx < H && vy >= 0 && vy < H) plot(V.b, H, vx, vy, 60, 60, 60);
  }
  for (const X of [A, P, V]) X.c.putImageData(X.img, 0, 0);
  // graticules
  const grid = (c: CanvasRenderingContext2D, cw: number) => { c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1; for (const v of [0.25, 0.5, 0.75]) { c.beginPath(); c.moveTo(0, H * v + 0.5); c.lineTo(cw, H * v + 0.5); c.stroke(); } };
  grid(A.c, W); grid(P.c, W);
  const vc = V.c; vc.strokeStyle = "rgba(255,255,255,.18)"; vc.beginPath(); vc.arc(H / 2, H / 2, H / 2 - 4, 0, Math.PI * 2); vc.moveTo(H / 2, 4); vc.lineTo(H / 2, H - 4); vc.moveTo(4, H / 2); vc.lineTo(H - 4, H / 2); vc.stroke();
  // histogram
  const hc = hi.getContext("2d")!; hc.clearRect(0, 0, W, H); hc.globalCompositeOperation = "lighter";
  const max = Math.max(1, ...hist.flatMap((a) => Array.from(a.slice(2, 254))));
  ["rgba(255,60,60,.65)", "rgba(60,255,90,.6)", "rgba(70,120,255,.7)"].forEach((col, ci) => {
    hc.fillStyle = col; hc.beginPath(); hc.moveTo(0, H);
    for (let v = 0; v < 256; v++) hc.lineTo((v / 255) * W, H - Math.min(H, (hist[ci][v] / max) * H));
    hc.lineTo(W, H); hc.closePath(); hc.fill();
  });
  hc.globalCompositeOperation = "source-over";
}
