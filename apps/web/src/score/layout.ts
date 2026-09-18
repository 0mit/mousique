// Where each event sits on screen, measured from the rendered SVG. Recomputed after every render,
// resize or zoom; the playhead reads it every animation frame.

export interface EventBox {
  /** Notehead centre, in pixels relative to the score container's content box. */
  x: number;
  systemIndex: number;
  top: number;
  height: number;
}

export interface SystemBox {
  left: number;
  right: number;
  top: number;
  height: number;
}

export interface Layout {
  events: Map<string, EventBox>;
  systems: SystemBox[];
}

export function measureLayout(container: HTMLElement, ids: Iterable<string>): Layout {
  const origin = container.getBoundingClientRect();
  const ox = origin.left - container.scrollLeft;
  const oy = origin.top - container.scrollTop;
  const systems: SystemBox[] = [];
  const systemIndex = new Map<Element, number>();
  container.querySelectorAll('g.system').forEach((g) => {
    // The staff, not the whole system group, so text above the staff does not stretch the playhead.
    const staff = g.querySelector('g.staff') ?? g;
    const r = staff.getBoundingClientRect();
    systemIndex.set(g, systems.length);
    systems.push({ left: r.left - ox, right: r.right - ox, top: r.top - oy, height: r.height });
  });

  const events = new Map<string, EventBox>();
  for (const id of ids) {
    const el = container.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!el) continue;
    const head = el.querySelector('.notehead') ?? el;
    const r = head.getBoundingClientRect();
    const sys = el.closest('g.system');
    const si = sys ? (systemIndex.get(sys) ?? 0) : 0;
    const s = systems[si];
    events.set(id, {
      x: r.left - ox + r.width / 2,
      systemIndex: si,
      top: s?.top ?? r.top - oy,
      height: s?.height ?? r.height,
    });
  }
  return { events, systems };
}
