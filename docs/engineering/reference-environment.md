# Entorno de referencia

El entorno de desarrollo de referencia es el equipo macOS arm64 del mantenedor. En él se miden:

- **SC-001**: el arranque desde un clon limpio hasta que `/api/health` responde 200, en menos de
  30 minutos;
- **SC-002**: los comandos de calidad locales, con el agregado `npm run check` en menos de
  10 minutos.

Esas mediciones se hacen durante la aceptación, sobre el commit que se acepta, y se registran
allí. Este documento solo describe el equipo; no contiene resultados de ninguna medición.

## Características

Datos comprobados en el propio equipo el 30 de septiembre de 2026.

| Característica    | Valor                                                    | Comprobación                                               |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Sistema operativo | macOS 27.0 (compilación 26A428)                          | `sw_vers`                                                  |
| Arquitectura      | arm64 (nativa, sin Rosetta)                              | `uname -m`                                                 |
| Procesador        | Apple M3, 8 núcleos (4 de rendimiento y 4 de eficiencia) | `sysctl -n machdep.cpu.brand_string` y `sysctl -n hw.ncpu` |
| Memoria           | 16 GB                                                    | `sysctl -n hw.memsize`                                     |
| Git               | 2.54.0 (Apple Git-157)                                   | `git --version`                                            |
| Node.js           | 24.21.0 (arm64)                                          | `node --version`                                           |
| npm               | 11.19.0, incluido con Node.js 24.21.0                    | `npm --version`                                            |
| curl              | 8.7.1                                                    | `curl --version`                                           |

Node.js 24.21.0 es la versión de `.node-version`. Es obligatoria en la aceptación, aunque para
desarrollar sirve cualquier versión del rango `>=24.21.0 <25`.

## Perfiles verificados

Hay exactamente dos perfiles verificados:

- **macOS arm64**: este equipo de referencia;
- **Linux x64**: el otro perfil verificado. Se verifica en la integración continua y en la
  aceptación, no en este equipo. No es entorno de referencia: en él SC-001 se repite sin el
  límite de 30 minutos y SC-002 no se mide.

Otras arquitecturas de macOS y Linux pueden funcionar, pero no se declaran verificadas. En
Windows solo se admite WSL, sin verificación.
