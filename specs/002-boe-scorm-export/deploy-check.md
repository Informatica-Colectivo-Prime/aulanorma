# Comprobación de la preparación del despliegue (T070 a T073)

Fecha: 2026-10-08. Rama `feat/002-backup-restore`.

Qué se ha comprobado de la copia de seguridad y de la restauración, y qué no. **Nada de esto
se ha ejecutado en un servidor**: no hay dominio ni destino decididos, y T074 sigue
bloqueada. Los datos usados son sintéticos o de ensayo, y las cuentas, de prueba.

## Qué se entrega

| Tarea | Entrega                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------- |
| T070  | `scripts/ops/backup.mjs` y la copia verificada en `src/platform/persistence`                         |
| T071  | `scripts/ops/verify-restore.mjs`, con la revocación de sesiones y la regla de las generaciones       |
| T072  | `tests/integration/backup-restore.test.ts` y `tests/integration/publication-order.test.ts`           |
| T073  | [`docs/engineering/deployment.md`](../../docs/engineering/deployment.md)                             |

Además, una corrección que el diseño exigía y faltaba: el paquete exportado se sincroniza a
disco, y su directorio también, antes de confirmar la fila que lo referencia (R11, regla 1).

## Pruebas automáticas

`tests/integration/backup-restore.test.ts` monta un directorio de datos real en disco, con un
documento publicado, una exportación hecha por el camino real, una sesión abierta, una sesión
de entrada y tres generaciones: liquidada, enviada sin liquidar y reservada sin enviar.

| Caso                                                                   | Resultado esperado                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Copia normal                                                           | Marcada como buena; registro con fecha, tamaño y huella; ficheros privados; sin auxiliares de SQLite |
| Fichero publicado sin referencia y temporales de publicaciones a medias | No hacen fallar la copia; el primero se copia y se cuenta, los temporales no se copian               |
| Copia mientras el servicio exporta otro paquete                        | Coherente y restaurable; el servicio sigue con su exportación                                        |
| Falta un fichero referenciado, o tiene otro contenido                  | La copia queda marcada como fallida y no se restaura                                                 |
| Copia sobre otra ya existente, o sin base de datos                     | Rechazada                                                                                            |
| `backup.mjs` con la configuración del servicio                         | Copia buena; rechaza un destino dentro del directorio de datos; código 1 si la copia falla           |
| Restauración en un directorio limpio (SC-040)                          | Integridad, 100 % de referencias con su huella, sesiones revocadas, la enviada queda incierta        |
| Destino no vacío, incluido el directorio de datos del servicio         | Rechazado sin modificarlo                                                                            |
| Copia alterada, incompleta, con ficheros de más o con registro retocado | Rechazada sin restaurar nada                                                                         |
| Referencia sin fichero en un directorio restaurado                     | Detectada                                                                                            |

La restauración se prueba con el script real, en otro proceso. Después se comprueba sobre el
directorio restaurado que la sesión anterior y la de entrada no sirven, que la cuenta puede
volver a entrar, que la generación enviada figura como incierta y sigue contando contra el
presupuesto, que la reservada sin enviar se libera y que la liquidada no cambia. También, que
ni el directorio de datos de origen ni la copia se modifican.

## Ensayo local

En macOS arm64, con Node.js 24.21.0, sobre el directorio de datos del ensayo de la historia 4
([`us4-check.md`](./us4-check.md)): un documento, dos exportaciones, tres sesiones abiertas y
ninguna generación en curso. El servidor de aquel ensayo se había detenido sin cierre
ordenado.

| Paso                                                      | Resultado                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `backup.mjs`                                              | Copia buena: 4 ficheros, 3 referencias, ninguna sin referencia, unos 21 MB |
| `verify-restore.mjs` en un directorio limpio              | Integridad y claves ajenas correctas, 3 referencias, 3 sesiones revocadas |
| `npm run dev` sobre el directorio restaurado              | `/api/health` responde 200 y la página de entrada, 200                    |
| Página de un paquete, sin sesión                          | Redirige a la entrada                                                     |

Es un ensayo: no usa `npm start`, HTTPS, proxy ni una cuenta de sistema, y no había ninguna
generación en curso, así que ese caso solo lo cubren las pruebas automáticas.

## Revisión de las garantías (2026-10-08)

Antes de integrar se revisaron las garantías de la copia y de la restauración. Se
encontraron y corrigieron tres defectos:

| Defecto                                                                                                              | Corrección                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Al publicar el primer fichero, el directorio recién creado no se sincronizaba en el que lo contiene                   | Cada nivel que se crea se sincroniza en su directorio, para documentos y para paquetes                        |
| Un fichero que ya existía se daba por publicado sin más, aunque un proceso anterior no hubiera llegado a sincronizar | Se sincroniza de nuevo, con su directorio, antes de darlo por publicado                                       |
| Una restauración que fallaba tras copiar los ficheros dejaba en el destino una base de datos con apariencia válida   | Se trabaja en un directorio interno y el contenido solo pasa al destino si todo pasa; si no, no queda nada |

El tercero alcanzaba también a los pasos de sesiones y generaciones, que se hacían con el
directorio ya en su sitio. Ahora forman parte de la restauración y se hacen antes.

Pruebas añadidas:

- **Orden de publicación** (`tests/integration/publication-order.test.ts`, 4): observa las
  llamadas al sistema de ficheros de un documento y de un paquete, y que ninguna ve todavía
  la fila. Se comprobó que la prueba falla si se quita una sincronización.
- **Restauración fallida** (5 casos): falta un fichero o tiene otro contenido en una copia
  cuyo registro cuadra, base de datos dañada, y reglas de las operaciones en curso que
  devuelven un problema o fallan a medias. En todos, el destino queda sin crear o vacío. Un
  directorio de trabajo abandonado impide abrir la base de datos.
- **Reglas aplicadas directamente** (2): la revocación de todas las sesiones y el paso a
  incierto de lo enviado sin liquidar, sobre el directorio de datos de la prueba y sin pasar
  por el script. El script comprueba además cada sesión y cada reserva, fila a fila.

El ensayo local se repitió con el script corregido; su tabla, arriba, recoge ese resultado.

## Entorno `production`

`AULANORMA_ENVIRONMENT` admite ahora `production`, el valor del piloto desplegado. Sus usos
son dos, y los dos solo anotan el campo `environment` de los registros: el registrador del
arranque y el de los eventos de producto. Ningún permiso, ruta ni comportamiento depende de
él. Las exigencias de HTTPS y de cookies seguras dependen del origen público y del modo de
arranque, y no cambian; con `production`, además, un origen HTTP local se rechaza también en
modo desarrollo. Lo cubren las pruebas de configuración y cinco pruebas de contrato de la
sesión con ese entorno.

## Qué no está comprobado

- **La resistencia a una caída completa de la máquina.** Las pruebas comprueban el orden de
  las llamadas de sincronización, no lo que queda en el disco tras un corte de corriente.
- El procedimiento de despliegue: cuenta de sistema, servicio, proxy inverso, TLS, HSTS,
  redirección y acceso desde otro equipo. Los ejemplos de systemd y nginx no se han probado.
- El arranque con `npm start` sobre un directorio restaurado y con origen HTTPS.
- El coste de `scrypt` en el destino.
- Una copia y una restauración en el servidor de destino, con sus permisos y su disco.
- El traslado de la copia fuera del servidor, su frecuencia y su conservación, que están por
  decidir.
- El comportamiento con una generación real en curso: no hay proveedor seleccionado.

SC-040 no se da por cumplido: exige que el servicio arranque en un entorno limpio, y eso se
acredita en T074.
