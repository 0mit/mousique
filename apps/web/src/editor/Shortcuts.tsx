const ROWS: Array<[string, string]> = [
  ['N', 'Write mode on/off: letters add new notes'],
  ['A – G', 'Note (Shift: add to a chord)'],
  ['R or 0', 'Rest'],
  ['1 – 7', 'Duration: 64th … whole (4 = eighth, 5 = quarter)'],
  ['.', 'Dot'],
  ['K / S', 'Koron / sori'],
  ['− / # / =', 'Flat / sharp / natural'],
  ['↑ ↓', 'Up / down a step'],
  ['Ctrl+↑ ↓', 'Up / down an octave'],
  ['← →', 'Previous / next note'],
  ['Ctrl+← →', 'Previous / next bar'],
  ['T', 'Tie'],
  ['/', 'Grace note'],
  ['Alt+3', 'Triplet'],
  ['Z', 'Riz (tremolo)'],
  ['Delete', 'Delete note'],
  ['Ctrl+B', 'Add a bar (Shift: before)'],
  ['Ctrl+Z', 'Undo (Shift: redo)'],
  ['Space', 'Play / pause'],
];

export function Shortcuts() {
  return (
    <details className="m-panel m-shortcuts">
      <summary>
        <h2>Keyboard</h2>
      </summary>
      <dl>
        {ROWS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
