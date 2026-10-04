# Specification Quality Checklist: Base de ingeniería de AulaNorma

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Primera revisión (2026-09-25): validado en una iteración.
- Segunda revisión (2026-09-25): ajustes solicitados por el mantenedor, revalidados con todos
  los puntos superados:
  - FR-017: las vulnerabilidades altas o críticas bloquean; las medias o bajas quedan visibles
    y revisables sin bloquear inicialmente; las excepciones cumplen FR-020. Se actualizan la
    Historia 3 (nuevo escenario 5), los casos límite y los supuestos.
  - Nuevo FR-021 sobre la seguridad de la integración continua; los antiguos FR-021 a FR-027
    pasan a ser FR-022 a FR-028.
  - FR-027 (antes FR-026): ADR solo para decisiones arquitectónicas relevantes; las
    dependencias nuevas se justifican en el plan.
  - SC-002: el límite de 10 minutos se mide en el entorno de desarrollo de referencia
    documentado.
  - SC-003: las alteraciones negativas son temporales, controladas y nunca se integran en
    `main`.
  - SC-004: medición en tres ejecuciones de pull request y una de `main`, desde el inicio del
    ejecutor, con exclusiones explícitas; FR-015 mantiene la garantía de activación universal.
- Tercera revisión (2026-09-25), revisión correctiva previa a `/speckit-tasks`, revalidada con
  todos los puntos superados:
  - SC-003 y la entidad "Control de calidad" enumeraban siete categorías, mientras que el plan y
    el modelo de datos incluían también la seguridad de workflows. Se unifica en **ocho
    categorías**: formato, análisis estático y límites, tipos, pruebas, construcción, secretos,
    dependencias y seguridad de workflows. La entidad admite además un control de verificación
    de plataforma que no constituye categoría. El plan concreta así nueve controles requeridos
    en la integración continua: los ocho de categoría y `macos-quality`. Hay una prueba negativa
    local y un pull request negativo por cada una de las ocho categorías.
  - Los requisitos funcionales no cambian. Las correcciones de arranque en ambos modos, ausencia
    de HTML, dependencias de la capa de entrega y cobertura local de secretos afectan solo a
    `plan.md`, `research.md`, `data-model.md`, el contrato, `quickstart.md` y los ADR 0001 y 0002.
  - La especificación sigue sin nombrar herramientas; la seguridad de workflows se describe
    como categoría, sin nombrar la herramienta que la implementa.
- Cuarta revisión (2026-09-25), corrección documental previa a `/speckit-tasks`, revalidada con
  todos los puntos superados:
  - FR-021 decía que las contribuciones no confiables no reciben "secretos ni credenciales",
    pero obtener el código exige la credencial efímera que genera la plataforma. Se aclara la
    regla sin rebajar el mínimo privilegio: ningún secreto del proyecto, ninguna credencial de
    larga duración y ninguna credencial con escritura. Solo se admite esa credencial efímera,
    con permiso mínimo de lectura del contenido, usada únicamente por los componentes que
    obtienen el código y preparan el entorno, sin guardarla en el espacio de trabajo y sin
    pasarla a los comandos que ejecutan código del repositorio. FR-021 sigue sin nombrar
    proveedor.
  - Los demás requisitos y los criterios de éxito no cambian. La matriz de aceptación de
    SC-001 a SC-009, la versión de referencia y el rango soportado del runtime, y el
    procedimiento ante la protección de push en la prueba negativa de secretos se documentan en
    `plan.md`, `research.md`, `quickstart.md` y los ADR 0001 y 0002.
- Los usuarios de esta funcionalidad son desarrolladores y revisores, por lo que se usan
  términos como "pull request", "comando" o "integración continua"; describen el resultado
  esperado, no la solución técnica.
- Los requisitos funcionales no nombran lenguajes, frameworks, herramientas de calidad ni
  proveedores de integración continua; su elección queda para `/speckit-plan` y las decisiones
  relevantes se registran mediante ADR (FR-027). Hay dos menciones deliberadas en los criterios
  de éxito: SC-001 menciona Node.js para fijar el entorno de aceptación, y SC-005 menciona
  Vitest para fijar el ejecutor cuya ausencia de red se comprueba. Son criterios de aceptación
  aprobados, no acoplamiento funcional.
- UF0517 y ADGG0408 solo aparecen en FR-024, que prohíbe lógica específica de ambos.
- Valores por defecto asumidos (documentados en Assumptions): tiempos de SC-001, SC-002 y
  SC-004 (30, 10 y 15 minutos).
- La forma de la comprobación de estado quedó resuelta en `/speckit-clarify`: comprobación
  consultable por máquina que expone exclusivamente estado y versión, sin interfaz visible,
  persistencia, autenticación, llamadas externas ni detalles internos (FR-006, FR-007, FR-009).
- Cumplimiento constitucional revisado: principios V (secretos, dependencias, mínimo privilegio en integración continua), VII (sin lógica
  de UF0517/ADGG0408), VIII (pruebas deterministas), X (accesibilidad si hay página), XI
  (registros estructurados), XII (sin decisiones de infraestructura en la especificación) y
  regla de línea base de integración continua.
- Quinta revisión (2026-09-27), alineación previa a `/speckit-checklist` tras adoptar la
  constitución 1.1.0:
  - FR-006 declara `/api/health` como la excepción cerrada del principio V y exige comprobar
    mediante pruebas todas sus condiciones, sin extenderla a otras operaciones.
  - Los procedimientos de aceptación de SC-002, SC-006 y SC-007 usan clones limpios y completos
    propios, independientes de que SC-001 esté Pendiente; la evidencia de Linux registra
    expresamente instalación, configuración, arranque, estado y controles aplicables.
  - La congelación absoluta de `main` comienza con la primera ejecución satisfactoria de los
    nueve controles y dura hasta que los nueve quedan configurados como requeridos. Las
    correcciones anteriores se integran mediante pull requests normales.
  - SC-001 y SC-008 DEBEN estar Superado antes de integrar. Si falta la persona externa, el
    criterio queda Pendiente, el pull request permanece abierto, no se integra y no comienza
    la primera funcionalidad de producto. No existe cierre posterior.
- Sexta revisión (2026-09-27), convergencia documental posterior a las listas de
  seguridad-gobernanza y de CI-aceptación: la quinta revisión admitía integrar con SC-001 o
  SC-008 Pendiente. Esa posibilidad se elimina; la trazabilidad de FR-026, SC-001 y SC-008
  queda en Superado obligatorio antes de integrar, sin tarea de cierre posterior.
- **Nota de alcance (2026-10-04)**, posterior a las revisiones quinta y sexta. No es una
  revisión nueva de esta lista: ningún elemento se ha vuelto a evaluar ni se ha marcado.
  - La aclaración del 2026-10-04 de [spec.md](../spec.md) convierte SC-001 y SC-008 en
    **validaciones empíricas aplazadas**, fuera de la aceptación obligatoria de esta entrega,
    porque no hay ninguna persona externa disponible.
  - La prohibición de integrar con SC-001 o SC-008 Pendiente, recogida en el último punto de
    la quinta revisión y en la sexta, correspondía al alcance anterior y **deja de aplicarse**.
  - Alcance vigente: la integración exige Superado en SC-002, SC-003, la parte de pull request
    de SC-004, SC-005, SC-006 y la parte local de SC-007, con los nueve controles en verde.
    SC-001 y SC-008 quedan Pendiente, no se dan por superados y no los sustituyen el
    mantenedor ni un agente.
  - No existe evidencia externa de incorporación ni de comprensión de la documentación por
    terceros. Esa ausencia debe constar en `acceptance.md` y en la descripción del pull
    request.
  - El resto de conclusiones de las revisiones quinta y sexta sigue vigente.
- Séptima revisión (2026-09-28), convergencia documental de la condición C6 del principio V,
  revalidada con todos los puntos superados:
  - FR-006 distingue la operación de estado, que no consume datos de la petición, de la
    frontera de transporte, que solo puede inspeccionar la versión HTTP, el destino crudo, el
    método, `Host`, `Content-Length`, `Transfer-Encoding`, `Expect` y los metadatos de
    negociación de la compresión, sin conservarlos, registrarlos, reflejarlos ni entregarlos a
    la lógica de estado. C4 declara transitorio el estado de conexión; C5 admite únicamente
    `Vary: Accept-Encoding`; C6 prohíbe cualquier otra `Vary` y las cabeceras que revelan un
    framework; se definen los metadatos de transporte `Date`, `Connection` y
    `Keep-Alive: timeout=5`, distintos de los tiempos internos.
  - FR-009 sustituye las redirecciones de canonicalización por una frontera de transporte con
    precedencia versión → `Host` → destino → método → cuerpo, destino crudo exacto, contrato
    cerrado de rechazo (400, 404, 405, 500 y 505), `OPTIONS` como respuesta técnica de
    transporte, rechazo cerrado de `CONNECT` y `Upgrade`, `Expect` sin respuestas automáticas,
    estado de conexión, escucha fija en la interfaz local y equivalencia entre modos.
  - FR-005 exige reiniciar para aplicar cambios de configuración; FR-008 prohíbe registros por
    petición o por rechazo en ambos modos. Se añaden dos casos límite y la entidad "Estado de
    conexión".
  - Los requisitos funcionales siguen sin nombrar lenguajes, frameworks ni herramientas: los
    términos nuevos son del protocolo HTTP. Ningún elemento se reabre porque la especificación
    queda completa, inequívoca y verificable.
  - Corrección posterior al análisis (2026-09-28): FR-009 acota el 500 cerrado a los fallos
    dentro del manejador, al fallo de la delegación antes de las cabeceras y a la destrucción de
    la conexión si la respuesta ya empezó, y excluye expresamente los errores internos del
    entorno de ejecución anteriores al manejador. FR-006 C2 deja de afirmar que
    `Accept-Encoding` determina la codificación: solo puede provocar `Vary: Accept-Encoding`, sin
    `Content-Encoding`. FR-008 fija un único registro de arranque completado por arranque, y
    FR-009 declara que el 204 de `OPTIONS` cumple por sí mismo C1 a C7. Los criterios de éxito
    no cambian.
