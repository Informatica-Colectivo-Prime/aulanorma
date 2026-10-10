# Despliegue de pruebas en Easypanel: preparación

Cómo llevar el piloto a un servicio de Easypanel en el VPS de pruebas. Complementa a
[`deployment.md`](deployment.md), que sigue valiendo para todo lo que no depende del
contenedor: cuentas, comprobaciones, copia de seguridad, restauración y límites. La decisión
de empaquetado es el [ADR 0005](../adr/0005-container-packaging-and-listen-address.md), Propuesto.

## Estado

**No se ha desplegado nada.** Este documento prepara el despliegue (tarea T074, que sigue
abierta); no lo registra. La imagen sí se ha construido y ejecutado en un ensayo local.

| Qué                                                                              | Comprobado                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Construcción de la imagen con el contexto real de Docker                         | Sí, en el ensayo local                                     |
| Versiones, cuenta, qpdf, acceso por la red interna, estado, persistencia, parada | Sí, en el ensayo local. Ver «Ensayo local con Docker»      |
| Reglas del `Dockerfile`: base fijada, sin secretos, cuenta sin privilegios       | Prueba automática (`tests/architecture/container.test.ts`) |
| La imagen para `linux/amd64`, la arquitectura del VPS                            | Sí, emulada en el equipo de desarrollo. Ver más abajo      |
| La imagen en un procesador x86_64 real                                           | **No**                                                     |
| Subida de un PDF por la interfaz, con sesión, dentro del contenedor              | **No**. qpdf se probó llamando al análisis, sin la web     |
| Easypanel: dominio, certificado, proxy, volumen, variables y consola             | **No**. Los pasos de abajo no se han ejecutado             |

Los nombres de los apartados de Easypanel son orientativos: se anota el nombre real al
ejecutar cada paso.

## Ensayo local con Docker

El 2026-10-10, en el equipo de desarrollo (macOS arm64, Docker 28.1.1, contenedores
`linux/arm64`), con una imagen, una red, un volumen y contenedores creados solo para el
ensayo y eliminados al terminar. Datos sintéticos y una cuenta desechable. Ningún puerto
publicado, ningún servidor remoto y ninguna llamada de pago: el adaptador era el
determinista y el presupuesto, cero.

| Comprobación                           | Resultado                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Construcción                           | Correcta. Contexto de 1,34 MB; `npm ci`, qpdf verificado y `npm run build` dentro de la imagen                 |
| Versiones                              | Node.js 24.21.0 y npm 11.19.0, dentro de los rangos exigidos; Debian 12; tini 0.19.0; qpdf 12.4.2              |
| Contenido                              | Sin `.git`, ficheros `.env` locales, pruebas ni documentación. De las herramientas, solo qpdf                  |
| Cuenta                                 | Todos los procesos como `node` (uid 1000), sin privilegios. No puede escribir en `/opt/aulanorma`              |
| Directorio de datos                    | `/var/lib/aulanorma`, de `node`, con permisos `0700`, también sobre un volumen con nombre                      |
| qpdf con PDF válidos                   | Los 9 PDF sintéticos que deben aceptarse, aceptados, con sus páginas y el campo de firma                       |
| qpdf con PDF rechazables               | Los 17 que deben rechazarse, rechazados, cada uno por su motivo: cifrado, dañado, contenido activo…            |
| Acceso desde otro contenedor de la red | `/api/health`, 200; `/login`, 200; `/documents` sin sesión, redirige a `/login`                                |
| Acceso desde un contenedor de otra red | No alcanzable                                                                                                  |
| Puertos publicados en el equipo        | Ninguno                                                                                                        |
| Comprobación de estado de la imagen    | `healthy` a la primera                                                                                         |
| Persistencia                           | Tras eliminar el contenedor y crear otro sobre el mismo volumen, la cuenta creada sigue ahí                    |
| Parada con `SIGTERM`                   | Termina en menos de un segundo, con el código 143. La base de datos pasa después la comprobación de integridad |
| Con `AULANORMA_LISTEN_HOST=127.0.0.1`  | Responde dentro del contenedor y otro contenedor de la red recibe una conexión rechazada                       |
| Con una dirección no admitida          | No arranca: `startup.config_invalid` nombra la clave, sin su valor, y el código es 1                           |

Lo que el ensayo **no** acredita:

- Nada de Easypanel ni de su proxy: ni TLS, ni la redirección, ni `Strict-Transport-Security`.
- La imagen en x64: ese ensayo fue en arm64. El de `linux/amd64` está en el apartado
  siguiente.
- La subida de un PDF por la interfaz. El análisis se llamó directamente dentro de la
  imagen, con qpdf y sus procesos reales, sin pasar por la web ni por una sesión.
- Una parada ordenada. El servicio no trata `SIGTERM`: termina de inmediato y las peticiones
  en curso se cortan.
- El comportamiento con carga, con el disco del VPS o tras un corte de corriente.

## Ensayo local para `linux/amd64`

El VPS es x86_64. El 2026-10-10, tras integrar la preparación, la imagen se construyó para
`linux/amd64` desde el commit integrado, `a0158c6`, y se ejecutó en el mismo equipo de
desarrollo (macOS arm64, Docker 29.8.2), **emulada**. Recursos exclusivos del ensayo,
eliminados al terminar; datos sintéticos y una cuenta desechable; ningún puerto publicado.

| Comprobación                           | Resultado                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Construcción para `linux/amd64`        | Correcta: `npm ci`, qpdf verificado y `npm run build` dentro de la imagen                              |
| Arquitectura y versiones               | `x86_64`; Node.js 24.21.0 y npm 11.19.0; tini 0.19.0; qpdf 12.4.2; cuenta `node` (uid 1000)            |
| qpdf                                   | 9 PDF sintéticos aceptados y 17 rechazados: el mismo resultado que en arm64, fichero a fichero         |
| Arranque                               | `startup.completed` a los 3,3 s de crear el contenedor                                                 |
| Acceso desde otro contenedor de la red | `/api/health`, 200; `/login`, 200. Ningún puerto publicado                                             |
| Comprobación de estado de la imagen    | `healthy`, sin fallos                                                                                  |
| Parada (`docker stop`, `SIGTERM`)      | Termina en 0,14 s, con el código 143                                                                   |
| Integridad de SQLite tras la parada    | `integrity_check`: `ok`; `foreign_key_check`: sin filas; modo WAL; 10 migraciones; la cuenta, presente |
| Persistencia                           | Un contenedor nuevo sobre el mismo volumen arranca y lista la cuenta creada antes                      |
| Integridad tras una segunda parada     | La misma: `ok`, sin filas en las claves ajenas, la cuenta presente                                     |

Al parar, la cuenta recién creada estaba todavía en el fichero WAL, sin volcar a la base de
datos: la parada inmediata no hace ese volcado. SQLite la recuperó al abrir, que es lo que
la comprobación de integridad acredita.

Lo que este ensayo **no** acredita: la imagen en un procesador x86_64 real, con sus tiempos
y su disco. La emulación ejecuta el mismo código de la imagen, incluido el binario de qpdf
para x86_64, pero no es el VPS.

## Datos que faltan

- El dominio del piloto y quién gestiona su DNS.
- La versión de Easypanel. La arquitectura del VPS es x86_64.
- Dónde se guardan las copias fuera del servidor, con qué frecuencia y cuánto tiempo.

## Qué se configura y qué no

Este despliegue es el del **adaptador determinista**: respuestas grabadas, sin llamadas
externas ni coste.

- **No** se define `AULANORMA_GENERATION_PROVIDER` ni ninguna clave `AULANORMA_OPENAI_*`.
- **No** se introduce ninguna clave de OpenAI.
- **No** se fija el límite del presupuesto: nace a cero y así se queda.

Activar el proveedor real es un paso posterior, con el presupuesto aprobado, y está en
[`openai-provider.md`](../../specs/002-boe-scorm-export/openai-provider.md).

## El contenedor

- **Imagen**: el `Dockerfile` de la raíz. Node.js 24.21.0 sobre Debian, con la base fijada
  por su huella.
- **Puerto**: 3000, el único. La imagen fija `AULANORMA_LISTEN_HOST=0.0.0.0` para que el
  proxy alcance el servicio por la red interna; fuera de un contenedor, el servicio escucha
  solo en `127.0.0.1`.
- **Cuenta**: `node`, sin privilegios. La instalación, en `/opt/aulanorma`, es de `root`.
- **Datos**: `/var/lib/aulanorma`. Es lo único que se escribe y lo único que hay que
  conservar.
- **Estado**: la imagen comprueba `/api/health`.
- **Registros**: por la salida estándar, en JSON, salvo las líneas de npm y de Next.js al
  arrancar.

## Pasos para el commit integrado

Commit que se despliega: **`a0158c658a640f02567b4d100ff975761406021d`** de `main`, el de la
integración de esta preparación, con sus nueve controles en verde. Si `main` avanza antes de
desplegar, se elige de nuevo el commit y se repite el ensayo local sobre él.

Cada paso separa lo que ya está **comprobado en local** de lo que queda **pendiente en el
VPS**. Nada de lo pendiente se da por bueno hasta ejecutarlo y anotarlo.

### 1. Servicio

1. Crear en Easypanel un proyecto para AulaNorma y, dentro, un servicio de tipo aplicación.
   No reutilizar ni modificar ningún proyecto o servicio existente.
2. Origen: el repositorio `Informatica-Colectivo-Prime/aulanorma`, en el commit indicado
   arriba. No desplegar una rama que cambie sola ni activar el despliegue automático.
3. Construcción: con el `Dockerfile` de la raíz. No con Nixpacks ni Buildpacks.
4. No definir argumentos de construcción.
5. Una sola réplica.

- **Comprobado en local**: la imagen se construye desde ese commit para `linux/amd64`, con
  el contexto real de Docker.
- **Pendiente en el VPS**: que Easypanel permita fijar un commit y construir con el
  `Dockerfile`; la construcción en el VPS, con su memoria y su disco. La imagen ocupa
  1,18 GB.

### 2. Volumen

1. Añadir al servicio un volumen con nombre montado en `/var/lib/aulanorma`.
2. Debe estar en el disco local del VPS: SQLite en modo WAL no debe ir en un sistema de
   ficheros de red.
3. No montar en su lugar un directorio del servidor. Si se hiciera, debería ser de la cuenta
   `node` (uid 1000) y tener permisos `0700`, o el servicio no arranca.

- **Comprobado en local**: sobre un volumen con nombre, el directorio queda de `node` con
  permisos `0700`, el servicio crea ahí la base de datos y los datos siguen tras recrear el
  contenedor.
- **Pendiente en el VPS**: que el volumen de Easypanel se comporte igual y esté en disco
  local.

### 3. Variables de entorno

En el apartado de variables de entorno del servicio, exactamente estas nueve. `NODE_ENV` y
`AULANORMA_LISTEN_HOST` ya los fija la imagen: no hay que definirlos ni cambiarlos.

```text
AULANORMA_LOG_LEVEL=info
AULANORMA_ENVIRONMENT=production
AULANORMA_DATA_DIR=/var/lib/aulanorma
AULANORMA_PUBLIC_ORIGIN=https://<dominio>
AULANORMA_SESSION_IDLE_MINUTES=30
AULANORMA_SESSION_MAX_HOURS=12
AULANORMA_PDF_MAX_MIB=32
AULANORMA_PDF_MAX_PAGES=600
AULANORMA_GENERATION_MAX_OPERATION_COST=1000000
```

- `AULANORMA_PUBLIC_ORIGIN` es el origen exacto, con `https://` y sin barra final.
- Ninguna de las nueve es un secreto.
- **No** añadir `AULANORMA_GENERATION_PROVIDER` ni ninguna clave `AULANORMA_OPENAI_*`.

- **Comprobado en local**: con esas nueve claves, y un dominio de ensayo, el servicio
  arranca. Con una que falta o no es válida no arranca, y el registro nombra la clave, nunca
  su valor.
- **Pendiente en el VPS**: el dominio real.

### 4. Dominio y proxy

1. Asignar el dominio al servicio, con HTTPS, y como destino el **puerto 3000 del
   contenedor**. Es un puerto de la red interna de Docker, no del VPS.
2. **No publicar ningún puerto del contenedor en el servidor.** El servicio solo debe
   alcanzarlo el proxy de Easypanel. El puerto 3000 del VPS pertenece a servicios que ya
   existen: AulaNorma no lo usa, no lo necesita y este despliegue no debe tocarlo.
3. Comprobar en la configuración del proxy, porque no depende de la aplicación, que:
   - redirige todo HTTP a HTTPS;
   - envía `Strict-Transport-Security`. Si no lo hace por defecto, hay que añadirlo: la
     aplicación no lo envía;
   - conserva la cabecera `Host` original;
   - admite cuerpos de al menos 32 MiB, el valor de `AULANORMA_PDF_MAX_MIB`;
   - no corta una respuesta antes de 120 segundos.

- **Comprobado en local**: otro contenedor de la misma red alcanza el servicio en el puerto
  3000; uno de otra red, no; y no hay ningún puerto publicado.
- **Pendiente en el VPS**: todo lo del proxy de Easypanel. TLS, el certificado, la
  redirección, `Strict-Transport-Security`, el tamaño de cuerpo y el tiempo de espera no se
  han probado en ningún sitio.

### 5. Primer arranque

1. Desplegar y esperar a que la comprobación de estado pase.
2. En los registros debe aparecer `startup.completed`. Con `startup.config_invalid`, corregir
   la clave que nombra.
3. Crear las cuentas desde la consola del contenedor, que ya tiene el entorno del servicio:

   ```bash
   node scripts/admin/users.mjs create <usuario> --role admin
   node scripts/admin/users.mjs create <usuario> --role teacher
   ```

   La contraseña se pide por la entrada estándar, es inicial y debe cambiarse al entrar. No
   se pasa como argumento ni como variable de entorno.

- **Comprobado en local**: el arranque, `startup.completed`, la comprobación de estado en
  `healthy` y la creación y el listado de cuentas con ese script dentro del contenedor.
- **Pendiente en el VPS**: que la consola de Easypanel entre con la cuenta `node` y con las
  variables del servicio, y que permita escribir la contraseña por la entrada estándar.

### 6. Comprobaciones tras desplegar

Las de `deployment.md`, «Comprobaciones tras desplegar», desde otro equipo, más estas. Todas
están **pendientes en el VPS**; entre paréntesis, lo que ya se vio en local.

1. El servicio de AulaNorma **no publica ningún puerto en el servidor**: en su configuración
   de Easypanel no hay puertos publicados, y el contenedor no tiene ninguno asociado a una
   dirección del VPS. No se comprueba ni se modifica ningún puerto de otros servicios. (En
   local: ningún puerto publicado.)
2. `https://<dominio>/api/health` responde 200 y `http://<dominio>/` redirige a HTTPS. (En
   local: 200 por la red interna, sin TLS.)
3. La respuesta HTTPS lleva `Strict-Transport-Security`. (En local: nada.)
4. Tras entrar, las cookies llevan `Secure` y el prefijo `__Host-`. (En local: nada; lo
   cubren las pruebas automáticas de la sesión, no el contenedor.)
5. Se sube un PDF sintético válido y se registra, y otro rechazable se rechaza con su
   motivo. Si la aplicación rechaza el válido como no comprobable, qpdf no funciona en el
   contenedor. (En local: el análisis con qpdf, llamado directamente, sin la web.)
6. En `/budget`, el límite es cero, la moneda está sin fijar y el coste figura como simulado.
   (En local: nada dentro del contenedor.)
7. Reiniciar el servicio desde Easypanel: los datos siguen ahí. (En local: persistencia tras
   recrear el contenedor e integridad de SQLite tras la parada.)
8. Medir el coste de `scrypt` en la consola del contenedor, con la orden de `deployment.md`.
   (En local: nada; depende del procesador del VPS.)

Cada resultado se anota, también los fallidos. Con todos anotados, y una copia de seguridad
restaurada con éxito, se puede cerrar T074.

## Copia de seguridad

Con el servicio en marcha, desde la consola del contenedor:

```bash
node scripts/ops/backup.mjs <directorio de copias>
```

- El directorio de copias no puede estar dentro del de datos. En el contenedor, la cuenta
  del servicio solo escribe en el volumen de datos: hace falta **otro volumen** para las
  copias, montado por ejemplo en `/var/lib/aulanorma-copias`, de la cuenta `node`.
- Una copia que se queda en el VPS no protege de perder el VPS. Hay que trasladarla fuera y
  probar su restauración donde quede guardada, como indica `deployment.md`.
- Las copias propias de Easypanel o del proveedor del VPS no sustituyen a este script: una
  copia del volumen hecha con el servicio en marcha puede no ser coherente.

Cómo se traslada la copia fuera del servidor está **por decidir**.

## Actualización

1. Hacer una copia y probar su restauración.
2. Cambiar el servicio al commit nuevo de `main` y volver a desplegar.
3. Al arrancar, el servicio aplica las migraciones pendientes antes de abrir el puerto.

Volver atrás es restaurar la copia del paso 1 con el commit anterior.

## Límites

- Una sola réplica del servicio. Dos contenedores sobre el mismo volumen corrompen los
  datos: no hay que escalar el servicio ni activar despliegues sin corte que solapen dos.
- **Parada inmediata.** El servicio no trata `SIGTERM`: termina al instante, con el código
  143, y un despliegue o un reinicio corta las peticiones en curso. Lo confirmado en la base
  de datos no se pierde. No se ha añadido una parada ordenada.
- **Tamaño de la imagen.** Ocupa 1,18 GB: lleva todas las dependencias, también las de
  desarrollo, como la instalación documentada. No se ha reducido.
- `AULANORMA_LISTEN_HOST=0.0.0.0` solo es seguro mientras el contenedor no publique el
  puerto. Con un puerto publicado, el servicio quedaría expuesto sin TLS.
- La generación del temario vive en el proceso: un despliegue o un reinicio la interrumpe.
- La imagen no se construye ni se analiza en la integración continua.
