import type { VerovioToolkit } from 'verovio/esm';

let toolkit: Promise<VerovioToolkit> | undefined;

/** One toolkit per page. The module is ~7 MB with its WebAssembly inlined, so it loads on first use. */
export function loadVerovio(): Promise<VerovioToolkit> {
  toolkit ??= (async () => {
    const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
      import('verovio/wasm'),
      import('verovio/esm'),
    ]);
    return new VerovioToolkit(await createVerovioModule());
  })();
  return toolkit;
}
