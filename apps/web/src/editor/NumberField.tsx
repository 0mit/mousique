// A number box that can be typed into. A controlled <input type="number"> that clamps on every keystroke
// cannot: clearing it to type "90" gives 0, which clamps to the minimum before the 9 arrives. Here the text
// is the user's while they type; a value is passed on as soon as it is a number within range, and the box
// settles (clamped, or back to the last value) on Enter or when it loses focus. Escape drops an unfinished or
// out-of-range entry.
import { useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
}

export function NumberField({ value, onChange, min = -Infinity, max = Infinity, step = 1, title }: Props) {
  const [draft, setDraft] = useState<string>();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const settle = () => {
    if (draft === undefined) return;
    const v = parseFloat(draft);
    if (Number.isFinite(v) && clamp(v) !== value) onChange(clamp(v));
    setDraft(undefined);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      step={step}
      title={title}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const v = parseFloat(text);
        if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
      }}
      onBlur={settle}
      onKeyDown={(e) => {
        if (e.key === 'Enter') settle();
        if (e.key === 'Escape') setDraft(undefined);
      }}
    />
  );
}
