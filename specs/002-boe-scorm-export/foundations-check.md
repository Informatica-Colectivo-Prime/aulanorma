# Comprobación de los cimientos con interfaz (fase 3)

**Fecha**: 2026-10-07 | **Tareas**: T013 a T030 | **Plan**: [plan.md](./plan.md)

Registro de cómo se comprobó el recorrido de entrar, ver el inicio y salir. Distingue lo que
cubren las pruebas automáticas de lo que se vio en un navegador real, y recoge los defectos que
solo aparecieron en el navegador.

## Qué puede hacer ya un usuario

- Entrar con una cuenta creada desde el servidor.
- Cambiar la contraseña inicial, que es obligatorio en la primera entrada.
- Ver el inicio, con su cuenta y sus perfiles.
- Cambiar su contraseña y salir.

No existe todavía ninguna función de documentos, interpretación, índice, temario, generación
ni exportación, y la interfaz lo dice.

## Pruebas automáticas

Forman parte de `npm run check:test` y no usan la red.

| Qué comprueban                                                                              | Dónde                                                     |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Persistencia, migraciones todas o ninguna, exclusión entre escritores, almacén de ficheros  | `tests/unit/platform/persistence.test.ts`                 |
| Auditoría de solo inserción, también frente a `INSERT OR REPLACE`                           | `tests/unit/platform/audit.test.ts`                       |
| Contraseñas, entrada, intentos repetidos, caducidad, revocación y permisos                  | `tests/unit/platform/identity.test.ts`                    |
| Entrada, sesión, CSRF, permisos en el servidor, caducidad y revocación, sobre las rutas reales | `tests/contract/session.contract.test.ts`              |
| Ninguna operación, con ningún perfil, modifica ni borra un evento                           | `tests/contract/audit-immutability.contract.test.ts`      |
| Lista cerrada de rutas, métodos y cuerpos; rechazos cerrados                                | `tests/unit/platform/http-boundary.test.ts`               |
| Cada ruta de producto se declara con su guarda; solo la entrada es accesible sin sesión     | `tests/architecture/public-routes.test.ts`                |
| Script de cuentas, sin imprimir ni guardar contraseñas                                      | `tests/unit/tools/admin-users.test.ts`                    |
| Configuración, registros y límites de importación ampliados                                 | `tests/unit/platform/`, `tests/architecture/`             |

La prueba de humo (`npm run check:build`) arranca el servidor real en producción y en
desarrollo y comprueba, además del contrato de `/api/health`, que las páginas sin sesión llevan
a la entrada, que la entrada es HTML completo sin rastro del framework y con las huellas de su
política de contenido, y que un envío sin origen se rechaza.

`npm run verify:negative` comprueba, entre otras cosas, que una ruta nueva sin declarar hace
fallar las pruebas.

Las pruebas de contrato usan el coste real de derivación de contraseñas. No ejercitan un
navegador.

## Verificación visual

**Cómo**: servidor compilado y arrancado con `npm start`, con el origen local por HTTP, y Chrome
154 sin interfaz gráfica, manejado por su protocolo de depuración con un script desechable. El
script navega, rellena y envía los formularios, pulsa teclas, hace capturas de pantalla y
recoge la consola y las peticiones de red. Las capturas se revisaron una a una y no se guardan
en el repositorio.

| Paso                                                     | Observado                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Abrir `/` sin sesión                                     | Lleva a la entrada                                                             |
| Entrar con una contraseña incorrecta                     | Vuelve a la entrada con un aviso de error, anunciado como alerta               |
| Entrar con la contraseña correcta, pulsando Intro        | Lleva al cambio de la contraseña inicial, con su aviso                         |
| Cambiar la contraseña                                    | Lo confirma y renueva la sesión                                                |
| Abrir el inicio                                          | Muestra la cuenta, el perfil y lo que todavía no está disponible               |
| Salir, con Intro sobre el botón                          | Lleva a la entrada con la confirmación                                         |
| Abrir `/` después de salir                               | Lleva a la entrada                                                             |
| Orden de tabulación en la entrada                        | Saltar al contenido, marca, usuario, contraseña, botón                         |
| Orden de tabulación en el inicio                         | Saltar al contenido, marca, inicio, contraseña, salir, y después el contenido  |
| Foco                                                     | Visible; el enlace para saltar al contenido aparece al recibirlo               |
| Estado de carga                                          | Al enviar, el botón se desactiva y cambia su texto («Entrando…»)               |
| Cookies                                                  | `HttpOnly` y `SameSite=Strict`; no son visibles para el código de la página    |
| Consola                                                  | Sin errores ni avisos de la política de contenido                              |
| Red                                                      | Solo peticiones al propio origen                                               |

## Defectos que solo aparecieron en el navegador

Las pruebas sin navegador pasaban. Los dos se corrigieron y tienen ahora una prueba que los
detecta.

1. **La política de contenido bloqueaba el estilo y el script.** El formateador había añadido
   espacios dentro de las etiquetas `<style>` y `<script>`, y las huellas de la política ya no
   coincidían con su contenido. La página se veía sin estilo. Ahora las dos etiquetas se
   construyen por concatenación, y una prueba de contrato y la prueba de humo calculan la
   huella del contenido real y la buscan en la política.
2. **La entrada se rechazaba con 403.** Con `Referrer-Policy: no-referrer`, el navegador envía
   `Origin: null` al enviar un formulario, y la comprobación de origen lo rechazaba. La
   política pasa a `same-origin`, que no envía nada a otros orígenes, y hay una prueba que lo
   fija.

Otros dos ajustes salieron de las capturas y de la consola: el botón de la entrada quedaba al
lado del campo en lugar de debajo, y el formulario de cambio de contraseña no llevaba el nombre
de la cuenta para los gestores de contraseñas.

Un tercer defecto lo encontró una prueba: `INSERT OR REPLACE` permitía sustituir un evento de
auditoría sin activar el disparador de borrado. Se añadió un disparador que lo impide.

## Lo que no se ha comprobado

- **HTTPS**. La verificación visual usó el origen local por HTTP. El prefijo `__Host-` y el
  atributo `Secure` de las cookies, que se emiten con un origen HTTPS, están cubiertos por las
  pruebas de contrato, pero no se han visto en un navegador. Queda para el despliegue (fase 8).
- **Otros navegadores**. Solo Chrome.
- **Lectores de pantalla**. La estructura es semántica (un `h1`, etiquetas, alertas, enlace
  para saltar), pero no se ha probado con ninguno. La lista de comprobación WCAG completa es la
  tarea T082.
- **Linux**. Todo lo anterior se ejecutó en macOS; la integración continua ejecuta las pruebas
  automáticas también en Linux.
- **Coste de `scrypt` en el servidor de destino**. En el equipo de desarrollo, una derivación
  tarda unas décimas de segundo.
