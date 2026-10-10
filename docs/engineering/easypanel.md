# Despliegue de pruebas en Easypanel: preparación

Cómo llevar el piloto a un servicio de Easypanel en el VPS de pruebas. Complementa a
[`deployment.md`](deployment.md), que sigue valiendo para todo lo que no depende del
contenedor: cuentas, comprobaciones, copia de seguridad, restauración y límites. La decisión
de empaquetado es el [ADR 0005](../adr/0005-container-packaging-for-easypanel.md), Propuesto.

## Estado

**No se ha desplegado nada y la imagen no se ha construido.** Este documento prepara el
despliegue (tarea T074); no lo registra.

| Qué                                                                             | Comprobado                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| El contexto de construcción basta para `npm ci`, qpdf y `npm run build`         | Sí, en local (macOS arm64), sin Docker, el 2026-10-10      |
| El servicio arranca con `npm start` desde ese árbol y responde en `/api/health` | Sí, en local, con datos vacíos                             |
| El servicio no escribe en su directorio de instalación al arrancar              | Sí, en ese mismo ensayo; no con uso real                   |
| Reglas del `Dockerfile`: base fijada, sin secretos, cuenta sin privilegios      | Prueba automática (`tests/architecture/container.test.ts`) |
| Construcción de la imagen, en Linux                                             | **No**                                                     |
| qpdf en la imagen                                                               | **No**                                                     |
| El reenvío con `socat`, la comprobación de estado y el reparto de señales       | **No**                                                     |
| Easypanel: dominio, certificado, proxy, volumen, variables y consola            | **No**. Los pasos de abajo no se han ejecutado             |

Los nombres de los apartados de Easypanel son orientativos: se anota el nombre real al
ejecutar cada paso.

## Datos que faltan

- El dominio del piloto y quién gestiona su DNS.
- La arquitectura del VPS (x64 o arm64) y la versión de Easypanel.
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
- **Puerto**: 8080, el del reenvío. El servicio escucha en `127.0.0.1:3000` dentro del
  contenedor y `socat` le pasa las conexiones tal como llegan.
- **Cuenta**: `node`, sin privilegios. La instalación, en `/opt/aulanorma`, es de `root`.
- **Datos**: `/var/lib/aulanorma`. Es lo único que se escribe y lo único que hay que
  conservar.
- **Estado**: la imagen comprueba `/api/health` a través del reenvío.
- **Registros**: por la salida estándar, en JSON, salvo una línea de Next.js al arrancar.

## Pasos

### 1. Servicio

1. Crear en Easypanel un proyecto y, dentro, un servicio de tipo aplicación.
2. Origen: el repositorio de GitHub, en el **commit de `main`** que se despliega, con sus
   nueve controles en verde. Anotar cuál. No desplegar una rama que cambie sola.
3. Construcción: con el `Dockerfile` de la raíz. No con Nixpacks ni Buildpacks.
4. No definir argumentos de construcción.

### 2. Volumen

1. Añadir un volumen con nombre montado en `/var/lib/aulanorma`.
2. Debe estar en el disco local del VPS: SQLite en modo WAL no debe ir en un sistema de
   ficheros de red.
3. Un volumen con nombre toma el propietario y los permisos del directorio de la imagen. Si
   se monta un directorio del servidor en su lugar, debe ser de la cuenta `node` (uid 1000)
   y tener permisos `0700`: si no, el servicio no arranca.

### 3. Variables de entorno

En el apartado de variables de entorno del servicio. `NODE_ENV` ya lo fija la imagen.

| Clave                                     | Valor                                        |
| ----------------------------------------- | -------------------------------------------- |
| `AULANORMA_LOG_LEVEL`                     | `info`                                       |
| `AULANORMA_ENVIRONMENT`                   | `production`                                 |
| `AULANORMA_DATA_DIR`                      | `/var/lib/aulanorma`                         |
| `AULANORMA_PUBLIC_ORIGIN`                 | `https://<dominio>`, exacto, sin barra final |
| `AULANORMA_SESSION_IDLE_MINUTES`          | `30`                                         |
| `AULANORMA_SESSION_MAX_HOURS`             | `12`                                         |
| `AULANORMA_PDF_MAX_MIB`                   | `32`, o el tamaño que se acepte, hasta 64    |
| `AULANORMA_PDF_MAX_PAGES`                 | `600`                                        |
| `AULANORMA_GENERATION_MAX_OPERATION_COST` | `1000000`                                    |

Ninguna de las nueve es un secreto. Con una clave `AULANORMA_` desconocida, o con una que
falte, el servicio no arranca y el registro nombra la clave, nunca su valor.

### 4. Dominio y proxy

1. Asignar el dominio al servicio, con HTTPS, y como destino el **puerto 8080** del
   contenedor.
2. **No publicar ningún puerto del contenedor en el servidor.** El 8080 solo debe alcanzarlo
   el proxy de Easypanel.
3. El proxy debe cumplir los requisitos de `deployment.md`, «Proxy inverso». Los que hay que
   comprobar en Easypanel, porque no dependen de la aplicación:
   - redirige todo HTTP a HTTPS;
   - envía `Strict-Transport-Security`. Si no lo hace por defecto, hay que añadirlo en la
     configuración del proxy: la aplicación no lo envía;
   - conserva la cabecera `Host` original;
   - admite cuerpos de al menos `AULANORMA_PDF_MAX_MIB`;
   - no corta una respuesta antes de 120 segundos, el tiempo máximo de una operación con el
     adaptador determinista.

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

### 6. Comprobaciones

Las de `deployment.md`, «Comprobaciones tras desplegar», desde otro equipo, más estas:

1. El puerto 8080 y el 3000 del VPS **no** responden desde fuera.
2. `https://<dominio>/api/health` responde 200 y `http://<dominio>/` redirige a HTTPS.
3. La respuesta HTTPS lleva `Strict-Transport-Security`.
4. Tras entrar, las cookies llevan `Secure` y el prefijo `__Host-`.
5. Se sube un PDF sintético y se registra: confirma qpdf en la imagen. Si la aplicación lo
   rechaza como no comprobable, qpdf no funciona en el contenedor.
6. En `/budget`, el límite es cero, la moneda está sin fijar y el coste figura como simulado.
7. Reiniciar el servicio desde Easypanel: los datos siguen ahí y la sesión abierta sigue
   valiendo.
8. Medir el coste de `scrypt` en la consola del contenedor, con la orden de `deployment.md`.

Cada resultado se anota, también los fallidos.

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
- Si el reenvío falla, el servicio queda inalcanzable hasta que la comprobación de estado lo
  detecta y el contenedor se sustituye.
- La generación del temario vive en el proceso: un despliegue o un reinicio la interrumpe.
- La imagen no se construye ni se analiza en la integración continua.
