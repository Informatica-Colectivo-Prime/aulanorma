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
- No se nombran lenguajes, frameworks, herramientas de calidad ni proveedores de integración
  continua; su elección queda para `/speckit-plan` y las decisiones relevantes se registran
  mediante ADR (FR-027).
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
