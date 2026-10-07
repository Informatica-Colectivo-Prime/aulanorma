# Registro de decisiones arquitectónicas (ADR)

Este directorio recoge las decisiones arquitectónicas relevantes de AulaNorma, como exige la
constitución (gobernanza y FR-027 de `001-engineering-baseline`). Son relevantes las decisiones
sobre stack principal, límites modulares, infraestructura, integración continua, proveedores y
herramientas de seguridad con consecuencias operativas. Las dependencias menores se justifican
en el plan de cada funcionalidad y no necesitan ADR.

## Ciclo de vida

Cada ADR sigue el ciclo **Propuesto → Aceptado → Sustituido**.

- **Propuesto**: la decisión está escrita y guía la implementación, pero aún no está
  confirmada por una implementación integrada y operativa. Mientras un ADR está Propuesto
  puede corregirse si la implementación o una revisión documental descubren que la decisión
  no es viable. No se obliga a cambiar la implementación para conservar una decisión
  propuesta incorrecta.
- **Aceptado**: la decisión ha quedado confirmada. Un ADR aceptado no se reescribe para
  cambiar el sentido de la decisión. Si esa decisión deja de ser viable, se crea un ADR
  nuevo que la sustituye, se actualiza el estado del anterior a **Sustituido** y se
  registra el identificador del sucesor. Las correcciones editoriales que no cambien el
  sentido (erratas, enlaces, formato) se permiten con una nota de revisión.
- **Sustituido**: la decisión ya no rige. El ADR permanece en el registro para
  trazabilidad.

Los ADR 0001 y 0002 permanecieron **Propuesto** durante todo el pull request de
implementación de `001-engineering-baseline`. Pasan a **Aceptado**, junto con este
índice, en el primer pull request posterior a la integración y a la activación de los
nueve controles requeridos, ambas del 2026-10-06. Ese pull request contiene también el
registro de activación y la evidencia posterior. Desde su aceptación no se reescriben para
cambiar el sentido de la decisión.

## Formato

Cada ADR es un fichero `NNNN-titulo-en-ingles.md`, con numeración secuencial, escrito en
español, con estas secciones: **Estado**, **Contexto**, **Decisión**, **Alternativas
consideradas** y **Consecuencias**.

## Índice

| ADR | Título | Estado |
|-----|--------|--------|
| [0001](./0001-architecture-runtime-and-modular-structure.md) | Arquitectura, runtime y estructura modular | Aceptado |
| [0002](./0002-quality-ci-and-security-strategy.md) | Estrategia de calidad, integración continua y seguridad | Aceptado |
