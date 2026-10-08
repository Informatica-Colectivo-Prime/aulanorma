# AulaNorma

AulaNorma es una plataforma que recibirá el PDF oficial de la normativa de certificados
profesionales publicado en el BOE, propondrá un índice y desarrollará el temario. El docente
revisará y aprobará el índice y el contenido, y la plataforma entregará un paquete SCORM
descargable para incorporarlo manualmente a Moodle. La publicación automática en Moodle queda
fuera del alcance vigente ([ADR 0003](docs/adr/0003-scorm-export-instead-of-automatic-moodle-publication.md)).

Por ahora, este repositorio contiene su base de ingeniería, los cimientos del producto y su
primera historia: una aplicación Next.js sin llamadas a servicios externos, con una base de
datos SQLite, cuentas, sesiones y permisos, en la que un docente sube el PDF oficial, comprueba
su registro, y revisa, corrige y valida la interpretación de una unidad formativa. La
interpretación sale de respuestas grabadas: no hay ningún servicio de generación conectado.
**Todavía no hay índice, temario ni exportación.** Una
frontera HTTP rechaza de forma cerrada cualquier petición que no sea de su lista de rutas. La
configuración se valida al arrancar y, si no es válida, la aplicación no arranca.

## Requisitos previos

| Herramienta | Versión                                                        | Comprobación     |
| ----------- | -------------------------------------------------------------- | ---------------- |
| Git         | 2.40 o superior                                                | `git --version`  |
| curl        | Cualquier versión reciente                                     | `curl --version` |
| Node.js     | Rango `>=24.21.0 <25`, que incluye npm 11; referencia: 24.21.0 | `node --version` |

Node.js 24.21.0 es la versión de referencia, fijada en `.node-version`, y es obligatoria en la
aceptación. Para desarrollar sirve cualquier versión del rango. Puedes instalarla con el
instalador oficial de [nodejs.org](https://nodejs.org/) o con un gestor de versiones que lea
`.node-version`. `npm ci` y `npm run tools:install` necesitan acceso a Internet para descargar
las dependencias y las herramientas de seguridad.

### Perfiles verificados

Hay exactamente dos perfiles verificados: **macOS arm64** y **Linux x64**. Otras arquitecturas
pueden funcionar, pero no se declaran verificadas. En Windows solo se admite WSL, sin
verificación. El equipo macOS arm64 de referencia se describe en
[docs/engineering/reference-environment.md](docs/engineering/reference-environment.md).

## Primeros pasos

### 1. Clonar e instalar

```bash
git clone https://github.com/Informatica-Colectivo-Prime/aulanorma.git
cd aulanorma
node --version
npm ci
```

Si te indican un commit concreto, como en la aceptación, fíjalo con `git checkout <SHA>` justo
después de `cd aulanorma` y no trabajes sobre una rama que pueda cambiar. En la aceptación,
`node --version` debe mostrar `v24.21.0`.

Para subir documentos hace falta además qpdf, que inspecciona la estructura de cada PDF:

```bash
npm run tools:install
```

Lo descarga en su versión fijada, comprueba la huella de cada fichero y lo instala en `.tools`,
que Git ignora. Sin él, la aplicación arranca, pero rechaza todo documento como no
comprobable.

`npm ci` instala exactamente las versiones de `package-lock.json` y no ejecuta scripts de
instalación. Con una versión de Node.js o npm fuera de rango termina antes de instalar, con un
error `EBADDEVENGINES` o `EBADENGINE` que indica el rango requerido.

### 2. Configurar sin secretos

```bash
cp .env.example .env.development.local
```

[`.env.example`](.env.example) documenta las ocho variables con valores de ejemplo válidos:
el nivel de registro, el entorno, el directorio de datos, el origen público, los dos tiempos
de caducidad de la sesión y los dos límites de un PDF, de tamaño y de páginas. Ninguna es un secreto y no hace falta cambiarlas para probar. El
directorio de datos de ejemplo está en un temporal del sistema, que puede vaciarse al reiniciar
el equipo: cámbialo si quieres conservar las cuentas. `.env.development.local` está excluido de Git y solo lo carga `npm run dev`. Una
variable definida en la terminal prevalece sobre el fichero, aunque esté vacía.

El origen público de ejemplo es `http://127.0.0.1:3000`, que solo se admite con `npm run dev`.
`npm start` exige un origen `https://…` y no arranca con otro: de él dependen el prefijo
`__Host-` y el atributo `Secure` de las cookies, que ninguna cabecera de una petición cambia.
Para probar la interfaz en el equipo, usa `npm run dev`.

Hay una excepción deliberada: `npm run dev` fija vacías `TURBOPACK`, `IS_TURBOPACK_TEST` y
`NEXT_RSPACK`, que en Next.js eligen el compilador. Lo que valgan en la terminal o en
`.env.development.local` no tiene efecto: el desarrollo usa siempre Webpack. No son variables de
configuración de AulaNorma.

### 3. Arrancar y consultar el estado

```bash
npm run dev
```

`npm run dev` ejecuta primero una comprobación previa de la configuración y, solo si es válida,
arranca el servidor en modo desarrollo. El servidor escucha siempre en `127.0.0.1:3000`: la
dirección y el puerto son fijos.

En otra terminal:

```bash
curl -i http://127.0.0.1:3000/api/health
```

Resultado esperado:

- `HTTP/1.1 200 OK`, con `content-type: application/json` y `cache-control: no-store`;
- `vary: Accept-Encoding` puede aparecer: es la única `vary` admitida;
- el cuerpo exacto `{"status":"ok","version":"0.1.0"}`, con la versión de `package.json`;
- ninguna cabecera `x-powered-by`, `server`, `etag` ni `x-nextjs-*`.

En desarrollo, la primera consulta puede tardar algo más porque la ruta se compila en ese
momento.

Comprueba también los rechazos cerrados de la frontera HTTP:

```bash
curl -i http://127.0.0.1:3000/api/health/
curl -i -X POST http://127.0.0.1:3000/api/health
curl -i -X GET --data 'x' http://127.0.0.1:3000/api/health
node -e 'const s=require("node:net").connect(3000,"127.0.0.1",()=>s.end("GET /api/health HTTP/2.0\r\nHost: 127.0.0.1:3000\r\n\r\n"));s.pipe(process.stdout)'
```

Resultado esperado, en ese orden:

- `404` **sin redirección**, sin `location` ni `refresh`, porque el destino no es exactamente
  `/api/health`;
- `405` con `allow: GET, HEAD, OPTIONS`, porque el método no está admitido;
- `400`, porque la petición lleva cuerpo;
- `505`, porque la versión no es HTTP/1.0 ni HTTP/1.1.

Los cuatro llevan `content-length: 0`, `cache-control: no-store` y `connection: close`, sin
cuerpo ni `content-type`. Cualquier ruta que no esté en la lista cerrada, como `/foo`, responde
el mismo `404` cerrado.

### 3 bis. Crear cuentas y probar la interfaz

Las cuentas se crean desde el servidor, con un script; no hay registro libre ni recuperación
por correo. Con `npm run dev` detenido o en marcha, en otra terminal:

```bash
NODE_ENV=development node scripts/admin/users.mjs create docente1 --role teacher
NODE_ENV=development node scripts/admin/users.mjs create admin1 --role admin
NODE_ENV=development node scripts/admin/users.mjs create sinperfil
NODE_ENV=development node scripts/admin/users.mjs list
```

Cada `create` pide dos veces la contraseña inicial, sin mostrarla. Debe tener al menos 12
caracteres. La contraseña nunca se pasa como argumento, no se imprime y no se guarda: solo se
guarda una derivación. `NODE_ENV` indica qué configuración se carga, igual que en `npm run dev`
(`development`) y `npm start` (`production`).

Los tres perfiles de prueba son: `teacher` (docente autorizado), `admin` (administración) y una
cuenta sin perfiles, que puede entrar y salir pero no usar ninguna función. Una misma cuenta
puede tener los dos perfiles, con `--role admin --role teacher`.

Con el servidor en marcha, abre <http://127.0.0.1:3000/> en el navegador:

1. Sin sesión, cualquier página lleva a la entrada.
2. Con una contraseña incorrecta, la entrada lo dice sin revelar si la cuenta existe. Al
   tercer fallo seguido, la cuenta queda bloqueada unos segundos, y cada fallo posterior
   duplica la espera, hasta 15 minutos.
3. Al entrar por primera vez, solo se puede cambiar la contraseña inicial.
4. Después, el inicio muestra la cuenta y sus perfiles, y lo que todavía no está disponible.
5. «Salir», en la cabecera, cierra la sesión.

La sesión caduca a los 30 minutos sin uso y a las 12 horas en cualquier caso. Todo se puede
recorrer solo con el teclado.

Otras órdenes del script: `roles <usuario> --role …` fija los perfiles, `password <usuario>`
asigna otra contraseña inicial, `disable` y `enable` desactivan y reactivan la cuenta, y
`revoke` cierra sus sesiones. Cambiar los perfiles, la contraseña o el estado de una cuenta
cierra todas sus sesiones.

### 3 ter. Subir y revisar un documento oficial

Necesitas `npm run tools:install`, el servidor en marcha con `npm run dev` y una cuenta con el
perfil `teacher`.

**Un directorio de datos nuevo para cada ensayo.** Para empezar con datos vacíos sin tocar los
de otros recorridos, no borres nada: usa un directorio exclusivo. Una variable definida en la
terminal prevalece sobre `.env.development.local`, así que basta con definirla, **con el mismo
valor**, en cada terminal del ensayo: la del servidor y la de las cuentas.

```bash
# En la primera terminal: crea el directorio, anota su ruta y arranca.
export AULANORMA_DATA_DIR="$(mktemp -d /tmp/aulanorma-ensayo-XXXXXX)"
echo "$AULANORMA_DATA_DIR"
npm run dev

# En la segunda terminal: la misma ruta que mostró la primera.
export AULANORMA_DATA_DIR=/tmp/aulanorma-ensayo-…
NODE_ENV=development node scripts/admin/users.mjs create docente1 --role teacher
```

Las órdenes de este apartado y del siguiente usan `$AULANORMA_DATA_DIR`. Si prefieres el
directorio fijo de `.env.development.local`, sustitúyelo por su valor. Cuando termines, el
directorio del ensayo se puede conservar o retirar; ningún otro recorrido lo usa.

**Con cualquier PDF.** Entra, abre «Documentos» y «Subir un documento oficial». Elige el
fichero, rellena su procedencia y envíalo. En unos segundos verás su registro, con su huella
SHA-256, o el motivo por el que no se admite: cifrado, dañado, con contenido activo, demasiado
grande o con demasiadas páginas. Desde el registro puedes abrir el PDF original y el texto de
cada página, y resolver las páginas sin texto.

Los ficheros de `tests/fixtures/pdf/synthetic/` sirven para probar cada caso: por ejemplo,
`encrypted.pdf` y `javascript.pdf` se rechazan, e `image-only-page.pdf` se admite con una
página sin texto.

**Con el documento del piloto.** El PDF no está en el repositorio. Descárgalo de la dirección
que indica [`pilot-source.md`](specs/002-boe-scorm-export/pilot-source.md) y comprueba su
huella:

```bash
shasum -a 256 BOE-A-2011-9930.pdf
```

Debe coincidir con la de ese fichero. Después:

1. Sube el PDF con los datos de procedencia de `pilot-source.md`. La huella que muestra el
   registro debe ser la misma.
2. Para poder pedir su interpretación, copia la respuesta grabada del piloto al directorio de
   datos del ensayo:

   ```bash
   mkdir -p "$AULANORMA_DATA_DIR/generation-recordings"
   cp specs/002-boe-scorm-export/pilot/interpretation-recording.json \
     "$AULANORMA_DATA_DIR/generation-recordings/"
   ```

   No hace falta reiniciar.

3. En el registro del documento, indica la unidad y las páginas de su sección, que están en
   `pilot-source.md`: de la 27 a la 29. Pulsa «Ver la estimación»: todavía no se envía nada.
   Verás la estimación del coste, el máximo que se reserva y el presupuesto disponible. Con
   el adaptador determinista todo es cero y figura como **coste simulado**: no es un precio.
   Confirma la solicitud, o cambia la unidad o las páginas para ver la estimación de nuevo.
4. Revisa el inventario contra esas páginas: cada elemento enlaza a la suya. Corrige lo que
   veas mal, añade lo que falte y retira lo que sobre.
5. **Valida solo si la interpretación es correcta**, marcando la confirmación de que has
   revisado el inventario contra la sección original. Si no lo es, corrígela o recházala, con
   un motivo.

La respuesta grabada no es una generación: es una transcripción mecánica de la sección,
preparada para ensayar el recorrido, y la interfaz lo indica. Solo responde a ese documento,
esa unidad y esas páginas; con cualquier otra petición, el producto dice que no hay respuesta
y no guarda nada. Qué acredita y qué no está en
[`pilot/README.md`](specs/002-boe-scorm-export/pilot/README.md).

Para ver un conflicto de edición, abre el formulario de un requisito en dos pestañas, guarda
en una y después en la otra: la segunda no guarda nada, muestra la versión más reciente junto
a tu cambio y te deja reenviarlo o descartarlo.

### 3 quater. Proponer, revisar y aprobar el índice

Necesitas una interpretación **validada** (apartado anterior). El índice se pide desde la
página de la interpretación, en «Índice del temario», que muestra antes la estimación del
coste, el máximo que se reserva y el presupuesto disponible. Con el adaptador determinista
todo es cero y la moneda no está fijada: no son precios de ningún proveedor.

**Con el documento del piloto**, copia también la propuesta grabada:

```bash
cp specs/002-boe-scorm-export/pilot/outline-recording.json \
  "$AULANORMA_DATA_DIR/generation-recordings/"
```

**Límite del doble de pruebas.** Esa propuesta grabada responde solo al inventario del piloto
tal como sale de su respuesta grabada. Revisa la interpretación con normalidad y corrige lo
que haga falta: el producto no lo impide ni debe impedirlo. Si la corriges, el inventario
deja de coincidir con la grabación y, al pedir el índice, el adaptador determinista no tendrá
respuesta: el producto dirá que el servicio de generación no ha devuelto ninguna propuesta y
no guardará nada. Es una limitación del doble, no un defecto de tu corrección ni del
producto, y con un proveedor real no existiría. No valides una interpretación que no
consideres correcta para sortearla: el índice del piloto solo podrá ensayarse con esta
grabación si la interpretación resulta correcta tal como está.

Después:

1. Pulsa «Pedir la propuesta de índice». Verás sus entradas, cada una con los requisitos en
   los que se apoya y su página, y la cobertura de cada requisito con su referencia
   normativa.
2. Quita una entrada: la cobertura pasa a incompleta y aparecen los requisitos sin cubrir.
   Puedes seguir editando y abrir la «Vista previa», marcada como borrador no entregable,
   pero al aprobar el producto lo impide y enumera los pendientes.
3. Añade una entrada y marca los requisitos que cubre. Marcar un elemento no marca los que
   dependen de él. Sin ninguno marcado, queda «sin respaldo normativo» y no cuenta.
4. Sube, baja o renombra entradas. Cada cambio crea una versión nueva.
5. Rechaza el índice con un motivo y devuélvelo a revisión, o apruébalo cuando la cobertura
   esté completa.
6. Cambia algo después de aprobar, aunque sea el orden: el índice vuelve a revisión y su
   aprobación queda en el registro como «sin vigencia». Lo mismo ocurre si corriges la
   interpretación.

Para ver un conflicto, abre el formulario de una entrada en dos pestañas y guarda en las dos.

La propuesta grabada del piloto es una transcripción mecánica del inventario: una entrada por
capacidad y otra por contenido. No es una generación ni una propuesta didáctica. Qué acredita
y qué no está en [`us2-check.md`](specs/002-boe-scorm-export/us2-check.md).

Detén el servidor con `Ctrl+C`.

La configuración solo se valida al arrancar. Cualquier cambio en los ficheros `.env*` exige
reiniciar `npm run dev` o `npm start`.

### 4. Comprobar el rechazo de una configuración inválida

En desarrollo, con un valor inválido en la terminal, que prevalece sobre
`.env.development.local`:

```bash
AULANORMA_LOG_LEVEL=loud npm run dev ; echo "exit=$?"
```

En producción, después de construir la aplicación:

```bash
npm run build
AULANORMA_LOG_LEVEL=loud AULANORMA_ENVIRONMENT=development npm start ; echo "exit=$?"
AULANORMA_ENVIRONMENT=development npm start ; echo "exit=$?"
```

Resultado esperado en los tres casos:

- el proceso termina enseguida con `exit=1`;
- se muestra un único registro `fatal` con el evento `startup.config_invalid`, que nombra la
  clave `AULANORMA_LOG_LEVEL` y el problema: `invalid_value` en los dos primeros casos y
  `missing` en el tercero;
- el registro **no** muestra el valor recibido (`loud`);
- el servidor no llega a arrancar: nada queda escuchando y `/api/health` no responde.

`npm start` no carga `.env.development.local`: en producción, la configuración llega solo del
entorno del proceso.

## Controles y verificación

### 5. Ejecutar todos los controles

```bash
npm run tools:install
npm run check
```

`npm run tools:install` descarga Gitleaks, zizmor y qpdf en sus versiones fijadas, verifica su
SHA-256 y los instala en `.tools`, que Git ignora. Necesita acceso a Internet y `tar`, incluido
en macOS y Linux. Las pruebas del tratamiento de los PDF usan qpdf: sin instalarlo, fallan. `npm run check` ejecuta las ocho categorías: formato, lint, tipos, pruebas,
construcción con prueba de humo, secretos, dependencias y workflows.

Resultado esperado: cada control informa de su éxito y el comando termina con código 0. En el
[entorno de referencia](docs/engineering/reference-environment.md) tarda menos de 10 minutos.
Para cronometrarlo:

```bash
time npm run check
```

Cada categoría también puede ejecutarse por separado: `npm run check:format`, `check:lint`,
`check:types`, `check:test`, `check:build`, `check:secrets`, `check:deps` y `check:workflows`.
Qué comprueba cada una, qué comandos necesitan red y cómo informan de un fallo se describe en
[Controles de calidad y seguridad](docs/engineering/quality-controls.md#ocho-categorías).

### 6. Comprobar que cada control detecta su fallo

Este paso forma parte de la aceptación. `npm run verify:negative` no es un control requerido y
no se ejecuta en los pull requests.

```bash
git status --porcelain
npm run verify:negative
git status --porcelain
```

Resultado esperado: para cada una de las ocho categorías se informa de que el control falló
como se esperaba, por la causa y en la ubicación esperadas. En secretos se informa además de que
un token sintético en un fichero nuevo sin seguimiento se detecta y de que uno en un fichero
ignorado no se examina. El procedimiento termina con código 0 y las dos salidas de
`git status --porcelain` son iguales: el repositorio no cambia. La categoría de dependencias
necesita acceso al registro de npm. Las alteraciones, causas y ubicaciones se describen en
[Pruebas negativas locales](docs/engineering/quality-controls.md#pruebas-negativas-locales-verifynegative).

### 7. Comprobar el determinismo de las pruebas

Ejecuta las pruebas cinco veces con red:

```bash
for i in 1 2 3 4 5; do npm run check:test > "${TMPDIR:-/tmp}/sc005-online-$i.log" 2>&1; echo "online run $i exit=$?"; done
```

Desactiva la red (Wi-Fi apagado o cable desconectado), comprueba que no hay acceso y repite el
bucle:

```bash
curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null ; echo "network exit=$?"
for i in 1 2 3 4 5; do npm run check:test > "${TMPDIR:-/tmp}/sc005-offline-$i.log" 2>&1; echo "offline run $i exit=$?"; done
```

Resultado esperado: `network exit` es distinto de 0, las diez ejecuciones terminan con `exit=0`
y el resumen de Vitest de cada fichero de registro muestra los mismos recuentos de ficheros y de
pruebas.

### 8. Verificación en Linux

En una máquina o máquina virtual Linux x64, con los mismos requisitos previos y Node.js 24.21.0,
crea un clon limpio y completo propio, fijado al mismo commit, y repite los pasos 1 a 6. Comprueba
la instalación de dependencias y herramientas, la configuración sin secretos, el arranque, la
respuesta exacta de `/api/health`, los controles de las ocho categorías y
`npm run verify:negative`.

Resultado esperado: los mismos resultados que en macOS.

## Puntos de entrada

`npm run dev` y `npm start` son los **únicos puntos de entrada admitidos**. Los dos ejecutan la
comprobación previa de la configuración y después el servidor, con la frontera HTTP delante de
Next.js.

- No uses `next dev`, `npx next dev`, `next start` ni `npx next start`: eluden la frontera HTTP.
- No ejecutes `node server.mjs` directamente: se salta la comprobación previa. Que el servidor
  vuelva a validar la configuración internamente no lo convierte en un punto de entrada
  admitido.

La escucha es fija en `127.0.0.1:3000`, y cualquier cambio en los ficheros `.env*` exige
reiniciar.

`npm run dev` compila con Webpack. `npm run build` conserva el compilador por defecto de Next.js
y `npm start` sirve lo que este genera. La prueba de humo comprueba el mismo contrato en los dos
modos.

## Documentación

- [Arquitectura](docs/engineering/architecture.md): las cuatro capas, su ubicación y
  responsabilidad, la matriz de dependencias, la frontera HTTP con su lista cerrada de rutas,
  las guardas de acceso y los puntos de entrada.
- [Controles de calidad y seguridad](docs/engineering/quality-controls.md): las ocho categorías,
  los nueve controles de la integración continua y los comandos locales equivalentes.
- [Protección de `main`](docs/engineering/branch-protection.md): la protección actual, los nueve
  controles requeridos y el registro de su activación.
- [Entorno de referencia](docs/engineering/reference-environment.md): el equipo macOS arm64 en
  el que se miden los tiempos de aceptación.
- [Excepciones de seguridad](docs/engineering/security-exceptions.md): el registro de excepciones
  de secretos y dependencias.
- [Cómo contribuir](CONTRIBUTING.md): ramas, pull requests, flujo Spec Kit, revisión con la lista
  de comprobación constitucional y Definition of Done.
- [Política de seguridad](SECURITY.md): cómo notificar una vulnerabilidad y qué hacer si se
  expone un secreto.
- [Decisiones arquitectónicas](docs/adr/README.md): índice y ciclo de vida de los ADR. Los dos
  ADR de la base están en estado **Aceptado**:
  - [ADR 0001: arquitectura, runtime y estructura modular](docs/adr/0001-architecture-runtime-and-modular-structure.md);
  - [ADR 0002: estrategia de calidad, integración continua y seguridad](docs/adr/0002-quality-ci-and-security-strategy.md).

## Resolución de problemas

| Síntoma                                                                                           | Causa probable                                                                                                    | Acción                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm ci` rechaza la versión de Node.js (`EBADDEVENGINES` o `EBADENGINE`)                          | Node.js o npm fuera de los rangos `>=24.21.0 <25` y `>=11.19.0 <12`                                               | Instalar la versión de `.node-version` (24.21.0)                                                       |
| `npm run dev` termina con `missing` o `invalid_value` aunque `.env.development.local` es correcto | La terminal tiene definida la variable, quizá vacía, y prevalece sobre el fichero                                 | Ejecutar `unset AULANORMA_LOG_LEVEL AULANORMA_ENVIRONMENT` y repetir                                   |
| `npm start` termina con `missing`                                                                 | `npm start` no carga `.env.development.local`                                                                     | Es lo esperado: en producción la configuración llega del entorno; para desarrollar, usar `npm run dev` |
| El arranque termina con `environment` y `env_load_failed`                                         | Un fichero `.env*` del modo no se puede leer o analizar; por diseño, el mensaje no muestra el fichero ni el error | Revisar los permisos y la sintaxis de los ficheros `.env*` del modo                                    |
| La comprobación previa termina con `NODE_ENV` y `mode_mismatch`                                   | Se ejecutó `scripts/preflight.mjs` a mano con un `NODE_ENV` distinto del modo                                     | Usar solo `npm run dev` o `npm start`, que fijan `NODE_ENV`                                            |
| El arranque falla porque la dirección está en uso                                                 | Otro proceso usa `127.0.0.1:3000`, por ejemplo otro `npm run dev`                                                 | Detener ese proceso; la dirección y el puerto son fijos                                                |
| Un cambio de `.env.development.local` no se aplica                                                | La configuración solo se valida al arrancar                                                                       | Reiniciar `npm run dev`                                                                                |
| `/api/health` responde `500` sin cuerpo                                                           | La configuración dejó de ser válida con el servidor en marcha, u otro fallo interno de la ruta de estado          | Corregir la configuración y reiniciar `npm run dev` o `npm start`                                      |
| `/api/health/` u otra variante responde `404`                                                     | La frontera solo admite el destino exacto `/api/health` y no redirige                                             | Usar exactamente `/api/health`                                                                         |
| Alguien sugiere `next dev`, `next start` o `node server.mjs` directo                              | Eluden la frontera HTTP o la comprobación previa                                                                  | Usar solo `npm run dev` o `npm start`                                                                  |
