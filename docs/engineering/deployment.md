# Despliegue del piloto, copia de seguridad y restauración

Procedimiento para poner el piloto en un servidor, accesible por HTTPS desde otros equipos, y
para copiar y recuperar sus datos. Desarrolla la decisión R11 de
[`research.md`](../../specs/002-boe-scorm-export/research.md) y el requisito FR-069.

## Estado de este documento

**Este procedimiento no se ha ejecutado en ningún servidor.** El dominio y el servidor de
destino no están decididos, así que el despliegue real (tarea T074) sigue bloqueado. Lo que
sí está comprobado, y dónde:

| Qué                                                                              | Comprobado                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| La copia, su verificación y la restauración comprobada                           | Pruebas automáticas (`tests/integration/backup-restore.test.ts`)           |
| El orden de publicación de un fichero antes de confirmar su referencia           | Pruebas automáticas (`tests/integration/publication-order.test.ts`)        |
| Copia, restauración y arranque del servicio sobre el directorio restaurado       | Un ensayo local en macOS, con `npm run dev` y datos de ensayo (2026-10-08) |
| Cuenta de sistema, servicio, proxy inverso, TLS, HSTS y acceso desde otro equipo | **Nada.** Son instrucciones por adaptar al destino                         |
| Coste de `scrypt` en el destino                                                  | **Nada.** Se mide al desplegar                                             |

Los ejemplos de servicio y de proxy son puntos de partida para Linux con systemd y nginx. No
se han probado y deben adaptarse a lo que haya en el destino. Nada de este documento autoriza
a modificar los servicios que ya existan en ese servidor.

## Datos que faltan

- Dominio público del piloto y quién gestiona su DNS.
- Servidor de destino: sistema operativo y versión, arquitectura, acceso de administración, y
  qué proxy inverso y qué servicios tiene ya.
- Cómo se obtiene y se renueva el certificado TLS.
- Dónde se guardan las copias fuera del servidor, con qué frecuencia se hacen y cuánto se
  conservan.

## Requisitos del destino

- Linux x64 o arm64, o macOS: son las plataformas para las que `npm run tools:install` tiene
  herramientas fijadas.
- Node.js 24.21.0, la versión de `.node-version`, con npm 11.19 o posterior de la rama 11.
- Git y `tar`.
- Disco local para el directorio de datos. SQLite en modo WAL no debe ponerse en un sistema
  de ficheros de red.
- Un proxy inverso que termine TLS.
- Salida a Internet durante la instalación, para `npm ci` y `npm run tools:install`.

## Aislamiento

- **Cuenta de sistema propia y sin privilegios**, sin intérprete de órdenes de entrada, usada
  solo por este servicio. En los ejemplos, `aulanorma`.
- **Directorio de instalación** de solo lectura para esa cuenta. En los ejemplos,
  `/opt/aulanorma`. Lo escribe quien instala, no el servicio.
- **Un único directorio de datos**, propiedad de esa cuenta y con permisos `0700`. En los
  ejemplos, `/var/lib/aulanorma`. Contiene la base de datos (`aulanorma.db`), los documentos
  (`blobs/`) y los paquetes exportados (`exports/`). La aplicación lo crea y le fija esos
  permisos al arrancar.
- **Un fichero de entorno** fuera del repositorio, legible solo por esa cuenta. En los
  ejemplos, `/etc/aulanorma/aulanorma.env`.
- **Un servicio propio**, que no comparte proceso, usuario ni datos con ningún otro.

## Instalación

Con una cuenta que pueda escribir en el directorio de instalación, que no es la del servicio:

```bash
git clone https://github.com/Informatica-Colectivo-Prime/aulanorma.git /opt/aulanorma
cd /opt/aulanorma
git checkout <commit que se despliega>
npm ci
npm run tools:install
npm run build
```

- `npm ci` no ejecuta scripts de instalación de las dependencias: lo fija `.npmrc`.
- `npm run tools:install` descarga, en sus versiones fijadas y verificando sus huellas, las
  herramientas del repositorio. El servicio solo necesita qpdf, que inspecciona la estructura
  de cada PDF que se sube. qpdf no es un antivirus.
- Se despliega un commit de `main` con sus nueve controles en verde. Anota cuál.

## Configuración

El fichero de entorno lleva las mismas claves que [`.env.example`](../../.env.example), que
explica cada una y sus valores válidos. Ninguna es un secreto, pero el fichero se trata como
privado. Para el despliegue cambian estas:

| Clave                     | Valor en el piloto                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `AULANORMA_DATA_DIR`      | El directorio de datos, en ruta absoluta                                             |
| `AULANORMA_PUBLIC_ORIGIN` | `https://<dominio>`, exacto, sin ruta ni barra final                                 |
| `AULANORMA_ENVIRONMENT`   | `production`                                                                         |
| `AULANORMA_PDF_MAX_MIB`   | El tamaño máximo de PDF que se acepte, de 1 a 64; el proxy debe admitir al menos eso |

`AULANORMA_ENVIRONMENT=production` solo se anota en los registros: no cambia ningún permiso
ni comportamiento, y con él la configuración rechaza un origen que no sea HTTPS también con
`npm run dev`.

`npm start` exige `NODE_ENV=production`, no carga ficheros `.env` locales y **no arranca si el
origen público no es HTTPS**. Con un origen HTTPS, las cookies de sesión llevan el prefijo
`__Host-` y el atributo `Secure`.

Las contraseñas no van en la configuración. Las cuentas se crean después, con
`scripts/admin/users.mjs`.

## Servicio

El proceso escucha siempre en `127.0.0.1:3000`; ni la dirección ni el puerto son
configurables. Ejemplo de unidad de systemd, **sin probar**:

```ini
[Unit]
Description=AulaNorma (piloto)
After=network.target

[Service]
User=aulanorma
Group=aulanorma
WorkingDirectory=/opt/aulanorma
Environment=NODE_ENV=production
EnvironmentFile=/etc/aulanorma/aulanorma.env
ExecStart=/usr/bin/npm start
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/aulanorma
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Ajusta la ruta de `npm` a la de Node.js 24.21.0. Al arrancar, el servicio valida la
configuración, aplica las migraciones pendientes y solo entonces abre el puerto: si algo de
eso falla, termina con código 1. Los registros salen por la salida estándar, en JSON.

## Proxy inverso

Requisitos, sea cual sea el proxy:

- Termina TLS con un certificado válido para el dominio y **redirige todo HTTP a HTTPS**.
- Envía `Strict-Transport-Security` en las respuestas HTTPS.
- Reenvía únicamente a `http://127.0.0.1:3000` y conserva la cabecera `Host` original, que
  debe coincidir con el origen público.
- La aplicación **no confía en cabeceras `X-Forwarded-*`**: no hace falta enviarlas y no
  cambian su comportamiento.
- **Límite de tamaño de petición**: al menos el valor de `AULANORMA_PDF_MAX_MIB`, y como
  mucho 64 MiB, que es el máximo que admite la aplicación para una subida. Un límite menor en
  el proxy rechaza subidas que la aplicación aceptaría, con un error que no es el suyo.
- **Tiempo de espera** suficiente para una generación: hoy se ejecuta dentro de la petición.
  Con el proveedor real habrá que medirlo (limitación registrada en `us3-check.md`).
- El puerto 3000 no debe ser accesible desde fuera del servidor.

Ejemplo para nginx, **sin probar**:

```nginx
server {
    listen 80;
    server_name <dominio>;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name <dominio>;

    ssl_certificate     <certificado>;
    ssl_certificate_key <clave>;

    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }
}
```

## Cuentas

No hay registro libre. Con la cuenta del servicio y su entorno cargado:

```bash
NODE_ENV=production node scripts/admin/users.mjs create <usuario> --role admin
NODE_ENV=production node scripts/admin/users.mjs create <usuario> --role teacher
```

La contraseña se pide por la entrada estándar, es inicial y debe cambiarse al entrar.

## Comprobaciones tras desplegar

Desde otro equipo, y anotando cada resultado:

1. `https://<dominio>/api/health` responde 200.
2. `http://<dominio>/` redirige a HTTPS, y la respuesta HTTPS lleva
   `Strict-Transport-Security`.
3. El puerto 3000 no responde desde fuera.
4. Se entra con una cuenta, y las cookies llevan `Secure` y el prefijo `__Host-`.
5. Se sube un PDF del tamaño máximo configurado y no lo rechaza el proxy.

En el servidor, **medir el coste de `scrypt`** con los parámetros de las contraseñas:

```bash
node -e 'const c=require("node:crypto");const t=performance.now();c.scryptSync("x".repeat(16),c.randomBytes(16),64,{N:131072,r:8,p:1,maxmem:256*1024*1024});console.log(Math.round(performance.now()-t)+" ms")'
```

Anota el resultado. Cada entrada cuesta ese tiempo de procesador: si es excesivo para el
destino, es una decisión que revisar antes de abrir el piloto, no un parámetro que bajar sin
más.

## Copia de seguridad

### Qué contiene

Una copia es un directorio `aulanorma-<fecha>/` con:

- `aulanorma.db`: una instantánea coherente de la base de datos;
- `blobs/` y `exports/`: los documentos y los paquetes publicados;
- `backup.json`: el registro, con la fecha, el tamaño, la huella del conjunto, el resultado
  de la verificación y el inventario de ficheros con sus huellas.

**No contiene** el fichero de entorno, el código ni las herramientas instaladas: se recuperan
del repositorio y de la configuración guardada aparte. Tampoco las respuestas grabadas del
adaptador determinista (`generation-recordings/`), que son datos de ensayo.

La copia incluye huellas de contraseñas y los documentos registrados. Se crea accesible solo
para la cuenta que la hace, **no va cifrada** y debe guardarse con acceso restringido.

### Cómo se hace

Con la cuenta del servicio, su entorno cargado y **sin detener el servicio**:

```bash
NODE_ENV=production node scripts/ops/backup.mjs <directorio de copias>
```

El directorio de copias no puede estar dentro del de datos. El script:

1. Copia la base de datos con la operación `backup` de SQLite, que da una instantánea de un
   instante mientras el servicio sigue escribiendo.
2. **Después** copia los ficheros publicados. Como un fichero se publica antes de
   referenciarse y no cambia, todo lo que la instantánea referencia ya estaba publicado. Lo
   publicado después sobra, pero no falta nada.
3. Verifica la propia copia: integridad de SQLite, y que cada referencia de la instantánea
   tiene su fichero con la huella correcta.
4. Escribe el registro y una línea con el nombre, la fecha, el tamaño y la huella.

Si falta un fichero referenciado o su huella no coincide, la copia queda **marcada como
fallida** y el script termina con código 1. Una copia fallida no se restaura: investiga la
causa en el directorio de datos antes de repetirla.

Un fichero publicado que ninguna fila referencia no es un fallo: es lo que deja una operación
interrumpida entre publicar y confirmar. Se copia y se cuenta como `unreferenced`.

### Después de cada copia

1. Guarda la línea que escribe el script en el registro de operación.
2. Traslada el directorio de la copia fuera del servidor.
3. **Prueba su restauración** en el lugar donde ha quedado guardada, como se indica abajo.
   Una copia cuya restauración no se ha probado no cuenta como copia.

La huella del registro detecta una copia dañada o incompleta. No es una firma: quien pueda
modificar la copia puede modificar también su registro. Por eso la línea del paso 1 se guarda
aparte.

### Frecuencia

Una copia completa periódica basta para el volumen del piloto; la frecuencia y la
conservación están pendientes de decisión. Haz además una antes de cada actualización. No hay
copias incrementales, réplica ni recuperación a un instante.

## Restauración

### Probar una copia

En cualquier equipo con el repositorio y Node.js 24.21.0, sin configuración del servicio:

```bash
node scripts/ops/verify-restore.mjs <copia> <directorio limpio>
```

El destino no debe existir o debe estar vacío. El script no lee la configuración del servicio
ni toca su directorio de datos. Comprueba, en este orden:

1. Que la copia es la registrada: marcada como buena, completa, sin ficheros de más y con las
   mismas huellas. Si no, no restaura nada.
2. La verificación de integridad de SQLite y las claves ajenas.
3. Que cada referencia tiene su fichero y que su huella coincide.
4. Las migraciones pendientes, que aplica como haría el arranque.
5. **Revoca todas las sesiones** y comprueba, una a una, que las que estaban abiertas han
   quedado revocadas. Ninguna anterior a la copia sirve después.
6. **Deja como inciertas las generaciones que constaban como enviadas y sin liquidar**, que
   siguen contando contra el presupuesto, y libera las reservadas que no llegaron a enviarse.
   Comprueba cada una, que su importe sigue contando y que no queda ninguna en curso.

Escribe un informe en JSON y termina con código 1 si algo falla. Guarda el informe junto a la
línea de la copia y borra el directorio de la prueba.

**Una restauración fallida no deja nada en el destino.** Todo se hace en un directorio de
trabajo dentro del destino, y el contenido solo pasa a su sitio, con la base de datos en
último lugar, si los seis pasos pasan. Si alguno falla, el directorio de trabajo se borra y
el destino queda como estaba: vacío o sin crear. Si el proceso se interrumpe a medias, queda
el directorio de trabajo (`.restore-…`): mientras exista, ni el servicio ni los scripts abren
la base de datos de ese directorio, y otra restauración lo rechaza por no estar vacío. Bórralo
entero y repite.

### Recuperar el servicio

1. Detén el servicio.
2. Aparta el directorio de datos actual con otro nombre. No lo borres hasta terminar.
3. Restaura con el nuevo directorio de datos como destino, con la cuenta del servicio:

   ```bash
   node scripts/ops/verify-restore.mjs <copia> /var/lib/aulanorma
   ```

4. Si el informe no dice `"ok": true`, el destino ha quedado vacío: el servicio no tiene
   datos sobre los que arrancar. Investiga la causa o usa otra copia; el directorio apartado
   en el paso 2 sigue intacto.
5. Arranca el servicio y repite las comprobaciones 1 y 4 de «Comprobaciones tras desplegar».
6. Con una cuenta de administración, revisa en la página del presupuesto las operaciones
   inciertas y concílialas con lo que confirme el proveedor.
7. Avisa a los usuarios: deben volver a entrar, y lo hecho después de la copia se ha perdido.

Revocar las sesiones es un paso de la restauración, no del arranque: un reinicio normal del
servicio conserva las sesiones abiertas. Por eso un directorio restaurado solo se pone en
servicio a través de este script.

## Actualización

1. Haz una copia y prueba su restauración.
2. Detén el servicio, cambia al commit nuevo, y repite `npm ci`, `npm run tools:install` y
   `npm run build`.
3. Arranca el servicio: aplica las migraciones pendientes antes de abrir el puerto.

Una migración aplicada no se deshace. Volver atrás es restaurar la copia del paso 1 con el
commit anterior.

## Límites aceptados para el piloto

- **La resistencia a una caída completa de la máquina no está probada.** La aplicación
  sincroniza a disco cada fichero y su directorio antes de confirmar la fila que lo
  referencia, y las pruebas comprueban ese orden de llamadas. Qué queda de verdad en el disco
  tras un corte de corriente depende del sistema de ficheros y del equipo de destino, y no se
  ha ensayado en ninguno.
- **Un único servidor, una única instancia y un único escritor.** Pasar a varias instancias o
  a un volumen mayor exige otra base de datos y un ADR.
- **`node:sqlite` es _release candidate_ en Node.js 24.** La versión de Node.js está fijada, y
  actualizarla exige repetir las pruebas, incluidas las de copia y restauración.
- La base de datos no se copia con herramientas del sistema mientras el servicio está en
  marcha: solo con `scripts/ops/backup.mjs`.
- La copia y su verificación leen cada fichero entero en memoria. Es proporcionado a
  documentos de hasta 64 MiB, no a volúmenes mayores.
- Una ejecución de generación interrumpida sigue figurando como «en curso» en su registro
  tras restaurar. Lo que cuenta para el presupuesto es su reserva, que sí queda incierta.
- Sin monitorización ni alertas: las métricas mínimas son una tarea posterior (T085).
