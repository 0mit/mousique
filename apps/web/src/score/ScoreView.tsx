import { eventIndexAt, scoreToMei, type Score, type Timeline } from '@mousique/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { measureLayout, type Layout } from './layout.ts';
import { loadVerovio } from './verovio.ts';

interface Props {
  score: Score;
  timeline: Timeline;
  /** Current score position in quarter notes, read every animation frame. */
  getQ: () => number;
  /** Zoom as a Verovio scale percentage. */
  zoom: number;
  onSeek: (q: number) => void;
}

const PLAYING_CLASS = 'm-playing';

export function ScoreView({ score, timeline, getQ, zoom, onSeek }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout>({ events: new Map(), systems: [] });
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | string>('loading');

  // Track the container width so the score reflows like text.
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render with Verovio whenever the score, width or zoom changes, then measure the layout.
  useEffect(() => {
    if (width === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const tk = await loadVerovio();
        if (cancelled) return;
        const pageWidth = Math.max(600, Math.round((width * 100) / zoom));
        tk.setOptions({
          scale: zoom,
          pageWidth,
          pageHeight: 60000,
          adjustPageHeight: true,
          breaks: 'auto',
          header: 'none',
          footer: 'none',
          pageMarginLeft: 40,
          pageMarginRight: 40,
          pageMarginTop: 40,
          pageMarginBottom: 40,
          svgViewBox: false,
        });
        tk.loadData(scoreToMei(score, { header: false }));
        const pages: string[] = [];
        const n = tk.getPageCount();
        for (let p = 1; p <= n; p++) pages.push(tk.renderToSVG(p));
        if (cancelled) return;
        pagesRef.current!.innerHTML = pages.map((svg) => `<div class="m-page">${svg}</div>`).join('');
        layoutRef.current = measureLayout(scrollRef.current!, timeline.byId.keys());
        setStatus('ready');
      } catch (err) {
        setStatus(`Renderer failed: ${String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [score, timeline, width, zoom]);

  // Cursor: highlight the sounding event and glide the playhead between onsets.
  useEffect(() => {
    let raf = 0;
    let lastId: string | undefined;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const q = getQ();
      const idx = eventIndexAt(timeline, q);
      const ev = timeline.events[idx];
      const head = headRef.current!;
      const root = pagesRef.current!;
      if (!ev) {
        head.style.opacity = '0';
        if (lastId) root.querySelector(`[id="${CSS.escape(lastId)}"]`)?.classList.remove(PLAYING_CLASS);
        lastId = undefined;
        return;
      }
      if (ev.id !== lastId) {
        if (lastId) root.querySelector(`[id="${CSS.escape(lastId)}"]`)?.classList.remove(PLAYING_CLASS);
        root.querySelector(`[id="${CSS.escape(ev.id)}"]`)?.classList.add(PLAYING_CLASS);
        lastId = ev.id;
      }
      const L = layoutRef.current;
      const box = L.events.get(ev.id);
      if (!box) return;
      let next = timeline.events[idx + 1];
      while (next && next.grace) next = timeline.events[timeline.events.indexOf(next) + 1];
      const nbox = next ? L.events.get(next.id) : undefined;
      const sys = L.systems[box.systemIndex];
      const endQ = next ? next.q : timeline.totalQ;
      const frac = endQ > ev.q ? Math.min(1, Math.max(0, (q - ev.q) / (endQ - ev.q))) : 0;
      const targetX = nbox && nbox.systemIndex === box.systemIndex ? nbox.x : (sys?.right ?? box.x);
      const x = box.x + (targetX - box.x) * frac;
      head.style.opacity = '1';
      head.style.transform = `translate(${x}px, ${box.top - 6}px)`;
      head.style.height = `${box.height + 12}px`;
      // Keep the playing system in view, turning slightly before the playhead reaches the edge.
      const scroller = scrollRef.current!;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      if (box.top < viewTop + 20 || box.top + box.height > viewBottom - 60) {
        scroller.scrollTo({ top: Math.max(0, box.top - scroller.clientHeight * 0.25), behavior: 'smooth' });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getQ, timeline]);

  const onClick = (e: React.MouseEvent) => {
    let el = e.target as Element | null;
    while (el && el !== pagesRef.current) {
      const id = el.getAttribute('id');
      // A chord's note ids are `<event>-n<i>`; the chord group itself carries the event id.
      if (id && timeline.byId.has(id)) {
        onSeek(timeline.byId.get(id)!.q);
        return;
      }
      el = el.parentElement;
    }
  };

  return (
    <div className="m-score" ref={scrollRef}>
      {status !== 'ready' && <div className="m-score-status">{status === 'loading' ? 'Loading the renderer…' : status}</div>}
      <div className="m-pages" ref={pagesRef} onClick={onClick} />
      <div className="m-playhead" ref={headRef} aria-hidden />
    </div>
  );
}
