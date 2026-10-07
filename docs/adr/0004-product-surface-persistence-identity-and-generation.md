# ADR 0004: Superficie de producto, persistencia, identidad y generación

**Estado**: Propuesto

**Fecha**: 2026-10-07

**Contexto de origen**: [`specs/002-boe-scorm-export/plan.md`](../../specs/002-boe-scorm-export/plan.md)
y [`research.md`](../../specs/002-boe-scorm-export/research.md) (R1 a R4, R6, R8 y R11). Se
redacta contra la constitución 2.0.0.

## Contexto

La base de ingeniería (ADR 0001) no tiene interfaz, persistencia, usuarios ni llamadas
externas. Su única ruta es `/api/health`, no sirve HTML y su frontera HTTP solo admite
peticiones sin cuerpo. ADR 0001 previó que "la primera porción vertical de producto definirá
sus puntos de entrada y ampliará esta regla solo para las capas que justifique".

La primera funcionalidad de producto, `002-boe-scorm-export`, necesita una interfaz para el
docente, formularios, la subida de un PDF, almacenamiento duradero, usuarios con permisos y un
servicio de generación. El piloto se usará como aplicación web en un servidor, accesible
desde otros equipos con navegador y HTTPS.

La constitución exige un monolito modular, sin infraestructura adicional sin necesidad medida
(principio XII), autenticación y autorización en el servidor con denegación por defecto
(principio V) e independencia del proveedor de IA (principio IX).

## Decisión

1. **Superficie de producto**. La interfaz docente son páginas del Pages Router renderizadas
   en el servidor, y las mutaciones son API Routes. Todas siguen detrás de la frontera HTTP
   de `server.mjs`, que pasa de admitir un único destino a admitir una **lista cerrada** de
   rutas de producto, definida en
   [`contracts/http-surface.md`](../../specs/002-boe-scorm-export/contracts/http-surface.md).
   Cualquier otro destino recibe el mismo rechazo cerrado que hoy.
2. **Cuerpos de petición**. La frontera admite cuerpos solo en las rutas de producto que los
   necesitan, con un tamaño máximo por ruta. La subida del PDF es un cuerpo `application/pdf`,
   sin `multipart`.
3. **Acceso**. Toda ruta de producto exige sesión y autorización comprobadas en el servidor.
   Solo el formulario de entrada y su envío son accesibles sin autenticación previa, y no
   conceden acceso a nada más. `/api/health` conserva sin cambios su contrato y las
   condiciones de su excepción.
4. **Persistencia**. SQLite en un único fichero, con el módulo `node:sqlite` de Node.js, y un
   almacén de ficheros direccionado por huella SHA-256 para los PDF y los paquetes. Todo el
   acceso pasa por `src/platform/persistence`. Cada tabla pertenece a un único módulo.
5. **Identidad**. Cuentas locales con contraseña derivada con `scrypt`, sesiones en el
   servidor con caducidad y revocación, protección frente a intentos repetidos y frente a la
   falsificación de peticiones, incluida la entrada. Dos perfiles, `admin` y `teacher`. Solo
   se usan primitivas criptográficas de `node:crypto`.
6. **Generación**. Una interfaz propia, `GenerationProvider`, con un adaptador determinista
   para las pruebas. El proveedor real **no se selecciona en este ADR**. El coste se reserva
   antes de enviar cada operación y se liquida después; una operación de resultado incierto
   sigue contando hasta que un administrador la concilia.
7. **Despliegue**. El proceso sigue escuchando en `127.0.0.1:3000`, detrás de un proxy
   inverso que termina TLS. La aplicación conoce su origen público por configuración y no
   confía en cabeceras reenviadas. Un único servidor y una única instancia.
8. **Estructura**. `src/platform` gana las áreas `persistence`, `identity`, `audit` y
   `generation`. La capa de entrega puede importar la API pública de las cuatro capas de
   dominio.

## Relación con los ADR aceptados

Este ADR **sustituye parcialmente al ADR 0001**. Sustituye exactamente esto:

- **Decisión 8, "ninguna página HTML se sirve en la superficie HTTP"**: se sirven las páginas
  de producto de la lista cerrada.
- **Decisión 8, delegación de un único destino**: "solo el destino crudo exacto `/api/health`
  con `GET`, `HEAD` u `OPTIONS` se delega" pasa a ser la lista cerrada de rutas de producto,
  con los métodos que cada una declara.
- **Decisión 8, cuerpo vacío**: "solo sin `Transfer-Encoding` y con `Content-Length`
  normalizado a 0" se mantiene para `/api/health` y para las rutas sin cuerpo; las rutas de
  producto que lo declaran admiten cuerpo dentro de su tamaño máximo.
- **Decisión 8, prueba de arquitectura de la ruta única**: la prueba que falla "si se crea una
  segunda ruta pública" se sustituye por una que compara las rutas reales con la lista
  cerrada y falla ante cualquier ruta no declarada o sin control de acceso.
- **Decisión 1, "solo existe la API Route `src/pages/api/health.ts`"**: existen además las
  páginas y rutas de producto.
- **Decisión 5, capa de entrega**: "solo puede importar las API públicas de `src/platform` y
  ninguna capa de dominio" pasa a permitir también la API pública de las cuatro capas.
- **Decisión 7, eventos de registro**: a `startup.completed` y `startup.config_invalid` se
  añaden los eventos de producto, con identificador de correlación por petición.

**No sustituye** nada más del ADR 0001. Siguen vigentes, en particular: el runtime, el
lenguaje y el gestor de paquetes; la frontera HTTP como único punto de entrada, con su
precedencia, sus rechazos cerrados y su estado de conexión; la escucha fija en
`127.0.0.1:3000`; la prohibición de `rewrites`, `headers`, `redirects`, middleware y `proxy`
de Next.js; el esquema único de configuración; y la excepción cerrada de `/api/health`, que
no se amplía.

El ADR 0001 no se modifica mientras este ADR esté Propuesto. Cuando se acepte, recibirá una
nota de revisión que remita aquí. El ADR 0002 no cambia: los nueve controles siguen siendo
los mismos. El ADR 0003 es independiente y trata de la cuarta capa.

## Alternativas consideradas

- **Servidor y proceso separados para el producto**: dos unidades desplegables, contra el
  principio XII.
- **HTML generado a mano desde API Routes**: mantiene el control de cabeceras, pero
  reimplementa el renderizado y el escapado.
- **PostgreSQL**: sin los límites de SQLite, pero es otro servicio que operar.
- **`better-sqlite3`**: estable, pero nativo; el repositorio instala con
  `ignore-scripts=true`.
- **OIDC externo o una biblioteca de autenticación**: un servicio o una dependencia para muy
  pocos usuarios.
- **Autenticación HTTP básica**: evitaría la operación de entrada, pero no ofrece cierre de
  sesión ni revocación. Descartada por el mantenedor.
- **Seleccionar ya el proveedor de generación**: no hay cuenta con facturación; la interfaz
  permite decidirlo después.
- **TLS en la propia aplicación**: duplica lo que el proxy hace.

## Consecuencias

- La superficie HTTP crece y, con ella, la superficie de ataque. La lista cerrada, la prueba
  que la compara con las rutas reales y el control de acceso por ruta son la compensación.
- Las páginas de producto las renderiza Next.js y pueden revelar el framework a un usuario
  autenticado. La condición de no revelar dependencias pertenece a la excepción pública de
  `/api/health`, que no cambia.
- **Límites de SQLite**: un único servidor, una única instancia y un único escritor; fichero
  en disco local; sin réplicas ni alta disponibilidad. Superarlos exige otra base de datos y
  un ADR nuevo.
- **`node:sqlite` está en estado *release candidate* en Node.js 24.21.0**: su API puede
  cambiar. Se compensa con la versión de Node.js fijada, el encapsulado en un módulo y
  pruebas de integración en esa versión. Actualizar Node.js exige repetirlas.
- La copia de seguridad es una obligación operativa: copia en línea de la base, después el
  almacén de ficheros, y restauración probada.
- La aplicación gestiona contraseñas. Es un riesgo que antes no existía; se acota con
  primitivas existentes, sin correo ni recuperación automática.
- Depender de un proxy inverso añade una pieza que configurar; a cambio, la aplicación no
  maneja certificados.
- La aceptación real del recorrido queda pendiente hasta disponer de un proveedor de
  generación.

## Decisiones pendientes

- Proveedor, modelo, moneda y presupuesto real de generación.
- Dominio y servidor de destino del piloto.
- Resultado de la comprobación de viabilidad del tratamiento de PDF (research R4) y de la
  validación del manifiesto con los esquemas oficiales (research R8).

Mientras este ADR está Propuesto, puede corregirse con lo que la implementación descubra.
