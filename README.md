# AulaNorma

AulaNorma es una plataforma que transformará el PDF oficial de la normativa de certificados
profesionales en un curso revisable por docentes y publicable en Moodle.

Por ahora, este repositorio contiene su base de ingeniería: una aplicación mínima con Next.js,
sin interfaz visible, sin persistencia y sin llamadas a servicios externos. Solo expone una
comprobación de estado, `GET /api/health`, detrás de una frontera HTTP que rechaza de forma
cerrada cualquier otra petición. La configuración se valida al arrancar y, si no es válida, la
aplicación no arranca.

## Requisitos previos

| Herramienta | Versión                                                        | Comprobación     |
| ----------- | -------------------------------------------------------------- | ---------------- |
| Git         | 2.40 o superior                                                | `git --version`  |
| curl        | Cualquier versión reciente                                     | `curl --version` |
| Node.js     | Rango `>=24.21.0 <25`, que incluye npm 11; referencia: 24.21.0 | `node --version` |

Node.js 24.21.0 es la versión de referencia, fijada en `.node-version`, y es obligatoria en la
aceptación. Para desarrollar sirve cualquier versión del rango. Puedes instalarla con el
instalador oficial de [nodejs.org](https://nodejs.org/) o con un gestor de versiones que lea
`.node-version`. `npm ci` necesita acceso a Internet para descargar las dependencias.

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

`npm ci` instala exactamente las versiones de `package-lock.json` y no ejecuta scripts de
instalación. Con una versión de Node.js o npm fuera de rango termina antes de instalar, con un
error `EBADDEVENGINES` o `EBADENGINE` que indica el rango requerido.

### 2. Configurar sin secretos

```bash
cp .env.example .env.development.local
```

[`.env.example`](.env.example) documenta las dos variables, `AULANORMA_LOG_LEVEL` y
`AULANORMA_ENVIRONMENT`, con valores de ejemplo válidos. Ninguna es un secreto y no hace falta
cambiarlas. `.env.development.local` está excluido de Git y solo lo carga `npm run dev`. Una
variable definida en la terminal prevalece sobre el fichero, aunque esté vacía.

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
cuerpo ni `content-type`. Cualquier otra ruta, como `/`, responde el mismo `404` cerrado:
ninguna página HTML se sirve.

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
