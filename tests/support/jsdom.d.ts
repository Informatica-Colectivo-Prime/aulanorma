// Tipos mínimos de `jsdom`, que no publica los suyos: solo lo que usa la
// prueba de contrato del seguimiento del paquete.
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html: string,
      options?: { readonly runScripts?: "outside-only" },
    );
    readonly window: Window & typeof globalThis;
  }
}
