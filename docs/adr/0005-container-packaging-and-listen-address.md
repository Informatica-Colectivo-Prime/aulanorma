# ADR 0005: Empaquetado en contenedor y dirección de escucha configurable

**Estado**: Propuesto. La imagen se ha construido y ejecutado en un ensayo local; no hay
ningún despliegue hecho. Puede corregirse si la revisión o el primer despliegue descubren que
la decisión no es viable.

**Fecha**: 2026-10-10

**Contexto de origen**: el mantenedor confirmó el 2026-10-09 que el despliegue de pruebas
del piloto será un VPS con Easypanel (tarea T074 de `002-boe-scorm-export`), y el 2026-10-10
eligió la dirección de escucha configurable frente a un reenvío dentro del contenedor.

**Sustitución parcial del ADR 0001**: este ADR sustituye un único elemento de su decisión 8,
descrito en «Relación con el ADR 0001».

## Contexto

Easypanel ejecuta cada servicio como un contenedor y pone delante su propio proxy inverso,
que termina TLS y llega al contenedor por una red interna de Docker.

El ADR 0001, decisión 8, fija que `server.mjs` escucha en `127.0.0.1:3000`, sin leer
`HOSTNAME`, `PORT` ni claves nuevas. Dentro de un contenedor, esa dirección solo es
alcanzable desde el propio contenedor: el proxy de Easypanel no llega a ella, y publicar el
puerto tampoco lo resuelve, porque Docker reenvía a la dirección de red del contenedor y no
a su interfaz local. El ensayo local lo confirma: con `127.0.0.1`, otro contenedor de la
misma red recibe una conexión rechazada.

El procedimiento de [`deployment.md`](../engineering/deployment.md) describe un servicio de
systemd con un proxy en el mismo servidor. No cubre este caso.

## Decisión

1. **La dirección de escucha es configurable, con dos valores.** La clave opcional
   `AULANORMA_LISTEN_HOST` admite `127.0.0.1` y `0.0.0.0`, y nada más. Sin ella, o vacía, el
   servicio escucha en `127.0.0.1`, como hasta ahora. Cualquier otro valor es un error de
   configuración y el servicio no arranca.
2. **El puerto sigue fijo en 3000** y no es configurable. Hay un único puerto.
3. **`0.0.0.0` solo se indica de forma explícita y solo para un contenedor**, cuya red es
   propia. Lo fija la imagen. Fuera de un contenedor no debe usarse: expondría el proceso en
   todas las interfaces del servidor, sin el proxy que termina TLS.
4. **Una imagen de contenedor propia**, definida por el `Dockerfile` de la raíz, que sigue
   la instalación de `deployment.md`: la base oficial de Node.js en la versión de
   `.node-version`, fijada por su huella; `npm ci`, que no ejecuta scripts de instalación;
   qpdf verificado por su huella; y `npm run build`.
5. **El servicio arranca con `npm start`**, su única entrada de producción, bajo `tini`, que
   reparte las señales y recoge los procesos terminados. No hay ningún otro proceso ni
   ningún reenvío.
6. **El puerto no se publica en el servidor.** Solo lo alcanza el proxy de Easypanel por la
   red interna. Es la condición equivalente a la escucha local: el proceso no queda expuesto
   sin el proxy.
7. **Sin secretos ni configuración del servicio en la imagen.** Llegan como variables de
   entorno, en ejecución. La imagen no declara argumentos de construcción y solo fija lo que
   depende de ser un contenedor: el modo y la dirección de escucha.
8. **Cuenta sin privilegios y un único directorio con escritura**, el de datos, montado como
   volumen en disco local.

## Relación con el ADR 0001

De la decisión 8 del ADR 0001, «`server.mjs` es un adaptador mínimo […] que escucha en
`127.0.0.1:3000`, fijos, sin leer `HOSTNAME`, `PORT` ni claves nuevas», este ADR sustituye
**solo esto**:

- la dirección deja de ser fija: es `127.0.0.1` por defecto y puede ser `0.0.0.0`;
- existe una clave nueva, `AULANORMA_LISTEN_HOST`, que la decide.

**Sigue vigente, sin cambios**:

- el puerto 3000, fijo;
- `server.mjs` no lee `HOSTNAME` ni `PORT`, y de `process.env` solo lee `NODE_ENV`: la
  dirección le llega de la configuración validada, como el resto;
- `src/platform/config` sigue siendo el único módulo que lee el entorno;
- `server.mjs` sigue siendo el único fichero operativo que crea un servidor y escucha;
- la frontera HTTP decide cada petición antes de Next.js, con las mismas reglas;
- el resto de la decisión 8 y de las demás decisiones.

El contrato de la ruta de estado de `001-engineering-baseline` y la documentación que decían
que la dirección era fija se actualizan con este cambio.

## Alternativas consideradas

- **Un reenvío de conexiones dentro del contenedor** (`socat`), que era la propuesta inicial
  de este ADR. No tocaba el ADR 0001, pero añadía un segundo proceso, un segundo puerto y un
  paquete del sistema sin versión fijada, y dejaba el servicio inalcanzable si el reenvío
  moría. Descartada por el mantenedor.
- **Cualquier dirección configurable**, o el puerto. Más de lo que hace falta: dos valores
  cerrados bastan y no dejan sitio a una dirección equivocada.
- **Un reenvío escrito en el repositorio.** Contradice la regla de que solo `server.mjs`
  escucha, y añade código de red propio.
- **Desplegar sin contenedor en el mismo VPS**, con systemd y el procedimiento ya escrito.
  Viable y sin este ADR, pero fuera de lo que Easypanel gestiona.
- **Red del servidor para el contenedor** (`host`). Eliminaría el aislamiento de red y
  ocuparía el puerto 3000 del VPS, que pertenece a servicios existentes.
- **Paquetes de construcción automáticos** (Nixpacks o Buildpacks). No garantizan la
  versión exacta de Node.js ni el procedimiento de instalación verificado.

## Consecuencias

- La garantía de que el proceso no queda expuesto ya no la da solo el código: con
  `0.0.0.0`, depende de que el contenedor no publique el puerto. Forma parte de las
  comprobaciones del despliegue.
- Un valor equivocado de la clave no puede abrir otra dirección: solo hay dos, y el valor
  por defecto es el cerrado.
- El servicio no trata `SIGTERM` de forma propia: termina de inmediato, con el código 143.
  Las peticiones en curso se cortan. Los datos confirmados no se pierden: SQLite los tiene
  en disco.
- `tini` se instala del repositorio de paquetes de la imagen base, sin versión fijada. La
  base sí está fijada por su huella.
- La imagen no se construye ni se analiza en la integración continua. Añadirlo sería un
  control nuevo y otro ADR.
- Este ADR pasa a Aceptado, o se corrige, con el primer despliegue comprobado (T074).
