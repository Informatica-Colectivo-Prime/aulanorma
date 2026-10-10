# ADR 0005: Empaquetado en contenedor para el despliegue de pruebas en Easypanel

**Estado**: Propuesto. No hay ninguna imagen construida ni ningún despliegue hecho. Puede
corregirse si la revisión o el primer despliegue descubren que la decisión no es viable.

**Fecha**: 2026-10-10

**Contexto de origen**: el mantenedor confirmó el 2026-10-09 que el despliegue de pruebas
del piloto será un VPS con Easypanel (tarea T074 de `002-boe-scorm-export`).

## Contexto

Easypanel ejecuta cada servicio como un contenedor y pone delante su propio proxy inverso,
que termina TLS y llega al contenedor por una red interna de Docker.

El ADR 0001, decisión 8, fija que `server.mjs` escucha en `127.0.0.1:3000`, sin leer
`HOSTNAME`, `PORT` ni claves nuevas, y una prueba de arquitectura impone que ningún otro
fichero operativo del repositorio cree un servidor ni escuche. Dentro de un contenedor, esa
dirección solo es alcanzable desde el propio contenedor: el proxy de Easypanel no llega a
ella, y publicar el puerto tampoco lo resuelve, porque Docker reenvía a la dirección de red
del contenedor y no a su interfaz local.

El procedimiento de [`deployment.md`](../engineering/deployment.md) describe un servicio de
systemd con un proxy en el mismo servidor. No cubre este caso.

## Decisión

1. **Una imagen de contenedor propia**, definida por el `Dockerfile` de la raíz, que sigue
   la instalación de `deployment.md`: la base oficial de Node.js en la versión de
   `.node-version`, fijada por su huella; `npm ci`, que no ejecuta scripts de instalación;
   qpdf verificado por su huella; y `npm run build`.
2. **El servicio no cambia.** Arranca con `npm start`, su única entrada de producción, y
   sigue escuchando en `127.0.0.1:3000`. El ADR 0001 no se modifica.
3. **Un reenvío de conexiones dentro del contenedor.** `socat` acepta en el puerto 8080 del
   contenedor y reenvía cada conexión, sin leerla ni modificarla, a `127.0.0.1:3000`. No
   interpreta HTTP: la frontera HTTP de la aplicación sigue decidiendo cada petición. Es un
   paquete del sistema de la imagen, no código del repositorio.
4. **El puerto 8080 no se publica en el servidor.** Solo lo alcanza el proxy de Easypanel
   por la red interna. Es la condición equivalente a la escucha local del ADR 0001: el
   proceso no queda expuesto sin el proxy que termina TLS.
5. **Sin configuración ni secretos en la imagen.** Llegan como variables de entorno del
   servicio, en ejecución. La imagen no declara argumentos de construcción.
6. **Cuenta sin privilegios y un único directorio con escritura**, el de datos, montado como
   volumen en disco local.

## Alternativas consideradas

- **Hacer configurable la dirección de escucha.** Es el cambio más pequeño en ejecución,
  pero sustituye una decisión aceptada del ADR 0001 y abre la posibilidad de exponer el
  proceso sin proxy por un error de configuración. Queda como alternativa si el reenvío da
  problemas: exigiría un ADR que sustituya esa parte del 0001.
- **Un reenvío escrito en el repositorio.** Contradice la regla de que solo `server.mjs`
  escucha, y añade código de red propio que mantener y probar.
- **Desplegar sin contenedor en el mismo VPS**, con systemd y el procedimiento ya escrito.
  Es viable y no necesita este ADR, pero deja el servicio fuera de lo que Easypanel
  gestiona: dominio, certificado, variables, registros y reinicios.
- **Red del servidor para el contenedor** (`host`). Easypanel no la ofrece para sus
  servicios y eliminaría el aislamiento de red.
- **Paquetes de construcción automáticos** (Nixpacks o Buildpacks). No garantizan la
  versión exacta de Node.js ni el procedimiento de instalación verificado.

## Consecuencias

- Hay un segundo proceso en el contenedor. Si el reenvío termina, el servicio sigue vivo
  pero inalcanzable: la comprobación de estado de la imagen pasa por el reenvío para que el
  orquestador sustituya el contenedor.
- El servicio ve todas las conexiones como locales. No usa la dirección del cliente para
  nada: el control de intentos de entrada es por cuenta.
- `socat` y `tini` se instalan del repositorio de paquetes de la imagen base, sin versión
  fijada. La base sí está fijada por su huella. Es una dependencia que el control de
  dependencias del repositorio no cubre.
- La imagen no se construye ni se analiza en la integración continua. Añadirlo sería un
  control nuevo y otro ADR.
- La garantía del punto 4 depende de cómo se configure el servicio en Easypanel, no del
  repositorio: forma parte de las comprobaciones del despliegue.
- Este ADR pasa a Aceptado, o se corrige, con el primer despliegue comprobado (T074).
