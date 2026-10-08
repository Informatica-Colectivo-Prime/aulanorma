// Tipos mínimos de `jsdom`, que no publica los suyos: solo lo que usan las
// pruebas de contrato del seguimiento del paquete y del aviso de sesión.
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html: string,
      options?: {
        readonly runScripts?: "outside-only";
        readonly url?: string;
      },
    );
    readonly window: Window & typeof globalThis;
  }
}
