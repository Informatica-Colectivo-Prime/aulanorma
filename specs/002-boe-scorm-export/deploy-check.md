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
| T072  | `tests/integration/backup-restore.test.ts`, 12 pruebas                                               |
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

## Qué no está comprobado

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
