# Contrato: superficie HTTP y autorización

**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md) (R2, R3, R5)

Lista cerrada de operaciones del piloto. La frontera HTTP rechaza cualquier otro destino con
el 404 cerrado que ya existe. Los nombres de ruta son orientativos; lo vinculante es la
operación, quién puede ejecutarla y sus condiciones.

## Reglas comunes

- **Sesión**: toda operación la exige, salvo `/api/health` (excepción del principio V, sin
  cambios) y el formulario de entrada con su envío (inicio de sesión del principio V), que no
  conceden acceso a nada más.
- **Perfiles**: `admin` y `teacher`. Una cuenta sin perfiles solo puede iniciar y cerrar
  sesión. No hay perfil de solo lectura.
- **Autorización**: se comprueba en el servidor en cada operación, con denegación por defecto.
  Una denegación responde 403, no revela si el recurso existe y se audita.
- **Mutaciones**: solo `POST`, con comprobación de origen contra el origen público
  configurado y testigo de sesión. El envío del formulario de entrada lo exige también, con
  el testigo de su sesión previa.
- **Sesiones**: cookie `HttpOnly`, `SameSite=Strict` y `Path=/`, sin `Domain`, con el prefijo
  `__Host-` y `Secure`. La única excepción es el modo desarrollo (`npm run dev`) con el origen
  local por HTTP, donde se emite sin el prefijo ni `Secure`: fuera de ese modo la
  configuración rechaza cualquier origen que no sea HTTPS y el servidor no arranca. Nombre y
  atributos dependen solo del origen público configurado; ninguna cabecera de la petición
  (`Host`, `Forwarded`, `X-Forwarded-*`) los cambia, ni cambia el origen exigido a un envío.
  El identificador de sesión viaja solo en `Set-Cookie` y el testigo, solo en los formularios
  de su propia sesión; ninguno aparece en registros, auditoría, errores ni en otras
  respuestas. Caducidad por
  inactividad (30 minutos) y por duración máxima (12 horas), configurables; se revocan al
  cerrar sesión, cambiar la contraseña, desactivar la cuenta o cambiar sus permisos (FR-068).
- **Generación de pago**: toda solicitud muestra antes la estimación y el presupuesto
  disponible; sin una reserva dentro de los límites no se envía (FR-021).
- **Revisión**: guardar un elemento editable, y validarlo, aprobarlo o rechazarlo, exige la
  revisión abierta. Si no es la actual, la respuesta es 409, sin guardar nada: dice que hay
  una versión más reciente, la muestra junto al contenido enviado, que sigue en el
  formulario, y permite reenviarlo de forma explícita contra esa versión o descartarlo. Nada
  se fusiona ni se reenvía solo (FR-063).
- **Bloqueos de negocio** (cobertura incompleta, aprobación no vigente, páginas sin resolver,
  presupuesto insuficiente): 422 con el motivo y la lista de pendientes, cada uno con su
  referencia normativa cuando aplica.
- **Cuerpos**: tamaño máximo por operación, aplicado en la frontera.
- **Sin borrado**: no existe ninguna operación `DELETE`.

## Rutas implementadas (cimientos, fase 3)

| Destino                 | Métodos                  | Operación                                 |
| ----------------------- | ------------------------ | ----------------------------------------- |
| `/api/health`           | `GET`, `HEAD`, `OPTIONS` | Comprobar estado                          |
| `/login`                | `GET`                    | Ver el formulario de entrada              |
| `/api/session/sign-in`  | `POST`                   | Iniciar sesión                            |
| `/`                     | `GET`                    | Inicio                                    |
| `/account/password`     | `GET`                    | Ver el formulario de cambio de contraseña |
| `/api/session/sign-out` | `POST`                   | Cerrar sesión                             |
| `/api/account/password` | `POST`                   | Cambiar la contraseña                     |

Las demás operaciones de la tabla siguiente todavía no existen. Las páginas responden con HTML
completo o con una redirección; las acciones, siempre con una redirección o con un rechazo sin
cuerpo. Los destinos son exactos: no admiten parámetros de consulta.

## Operaciones

| Operación                                    | Perfil            | Condiciones                                                        | Requisitos                 |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------ | -------------------------- |
| Comprobar estado (`GET /api/health`)         | ninguno           | Contrato de 001, sin cambios                                       | —                          |
| Ver el formulario de entrada e iniciar sesión | ninguno          | Testigo de la sesión previa; retraso y bloqueo por intentos; auditado | FR-026, FR-054          |
| Cerrar sesión y cambiar la contraseña        | sesión            | Cambiar la contraseña revoca las demás sesiones                    | FR-026                     |
| Registrar documento (cuerpo `application/pdf`) | `teacher`       | Validación del fichero; opcionalmente, documento al que sustituye | FR-001 a FR-003, FR-067    |
| Ver documento, página y texto extraído       | `teacher`         | —                                                                  | FR-008                     |
| Resolver página sin texto                    | `teacher`         | Confirmación expresa                                               | FR-064                     |
| Pedir interpretación                         | `teacher`         | Presupuesto disponible                                             | FR-005, FR-006             |
| Corregir interpretación                      | `teacher`         | Revisión abierta                                                   | FR-007, FR-065             |
| Validar interpretación                       | `teacher`         | Páginas resueltas; confirmación de la revisión del inventario      | FR-057                     |
| Rechazar interpretación                      | `teacher`         | Motivo obligatorio; conserva el contenido                          | FR-070                     |
| Pedir índice                                 | `teacher`         | Interpretación validada y vigente; presupuesto disponible          | FR-009                     |
| Editar índice y sus vínculos                 | `teacher`         | Revisión abierta                                                   | FR-014, FR-059             |
| Ver cobertura                                | `teacher`         | Declara el límite de la cobertura                                  | FR-011, FR-058             |
| Aprobar o rechazar índice                    | `teacher`         | Aprobar exige cobertura completa; rechazar, un motivo              | FR-013, FR-015, FR-070     |
| Estimar y lanzar generación del temario      | `teacher`         | Índice aprobado y vigente; estimación y disponible mostrados antes | FR-016, FR-021             |
| Reanudar generación                          | `teacher`         | Acción explícita; presupuesto disponible; solo pendientes          | FR-066                     |
| Editar tema                                  | `teacher`         | Revisión abierta                                                   | FR-022, FR-024             |
| Aprobar o rechazar tema                      | `teacher`         | Aprobar exige índice aprobado y vigente; rechazar, un motivo       | FR-022, FR-070             |
| Aprobar versión del temario                  | `teacher`         | Temario completo, cubierto y desarrollado                          | FR-023, FR-060             |
| Comprobar referencia heredada                | `teacher`         | Solo tras un documento sustituto                                   | FR-067                     |
| Previsualizar                                | `teacher`         | Borrador marcado como no entregable; sin fichero                   | FR-038                     |
| Exportar                                     | `teacher`         | Versión vigente; cobertura completa en ese momento                 | FR-030, FR-031, FR-037     |
| Descargar paquete e instrucciones            | `teacher`         | Versión vigente en el momento de cada descarga                     | FR-035, FR-040, FR-062     |
| Consultar historial y registros              | `teacher`, `admin` | —                                                                 | FR-028, FR-039             |
| Consultar presupuesto                        | `teacher`         | —                                                                  | FR-027                     |
| Modificar límite de coste                    | `admin`           | Registra valor anterior y nuevo; no inicia nada                    | FR-027, FR-028, FR-066     |
| Conciliar una operación incierta             | `admin`           | Registra actor, fecha e importe confirmado                         | FR-021, FR-028             |

`admin` no incluye `teacher`: una persona puede tener ambos perfiles.

## Pruebas de contrato previstas

- Cada operación, sin sesión, con una cuenta sin perfiles y con el perfil equivocado:
  denegada y auditada (SC-007).
- Entrada: envío sin testigo o con otro origen, rechazado; intentos repetidos, retrasados y
  bloqueados; sesión caducada o revocada, rechazada; el identificador cambia al autenticar.
- Ninguna ruta sin sesión devuelve datos de producto.
- Cada bloqueo de negocio de la tabla: 422 con sus pendientes (SC-006, SC-025, SC-035).
- Guardado con revisión antigua: 409 sin pérdida (SC-033).
- Descarga con un enlace anterior a la invalidación: denegada (SC-031).
- Ninguna ruta acepta `DELETE` (SC-031).
- `/api/health`: su contrato de 001 sigue pasando sin cambios.
