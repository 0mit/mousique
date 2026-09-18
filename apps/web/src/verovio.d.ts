// Verovio ships no type declarations; this covers the calls the app makes.
declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}
declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getLog(): string;
    getPageCount(): number;
    renderToSVG(page?: number): string;
    renderToTimemap(options?: Record<string, unknown>): unknown;
  }
}
