import type { Clip, ColorGrade } from "../timeline";
import { NEUTRAL } from "../grade";

const sliders = [
  { key: "exposure", label: "Exposure", min: -2, max: 2, step: 0.05 },
  { key: "contrast", label: "Contrast", min: 0.5, max: 2, step: 0.01 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
] as const;

export default function QuickAdjustments({ clip, disabled, onChange }: {
  clip?: Clip; disabled: boolean; onChange: (grade: ColorGrade, key: string) => void;
}) {
  const grade = { ...NEUTRAL, ...clip?.color };
  return <div className="bin-list asset-adjustments">
    {disabled && <p className="dim">Select an editable clip with a picture to adjust its color.</p>}
    {sliders.map(({ key, label, ...range }) => <label key={key}>
      <span>{label} <output>{grade[key].toFixed(2)}</output></span>
      <input type="range" {...range} value={grade[key]} disabled={disabled}
        onChange={(e) => onChange({ ...grade, enabled: true, [key]: Number(e.target.value) }, key)} />
    </label>)}
  </div>;
}
