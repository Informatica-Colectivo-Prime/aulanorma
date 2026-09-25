# Registro de decisiones arquitectónicas (ADR)

Este directorio recoge las decisiones arquitectónicas relevantes de AulaNorma, como exige la
constitución (gobernanza y FR-027 de `001-engineering-baseline`). Son relevantes las decisiones
sobre stack principal, límites modulares, infraestructura, integración continua, proveedores y
herramientas de seguridad con consecuencias operativas. Las dependencias menores se justifican
en el plan de cada funcionalidad y no necesitan ADR.

## Formato

Cada ADR es un fichero `NNNN-titulo-en-ingles.md`, con numeración secuencial, escrito en español,
con estas secciones: **Estado**, **Contexto**, **Decisión**, **Alternativas consideradas** y
**Consecuencias**. Un ADR aceptado no se reescribe: si una decisión cambia, se crea otro ADR que
lo sustituye y se actualiza el estado del anterior.

## Índice

| ADR | Título | Estado |
|-----|--------|--------|
| [0001](./0001-architecture-runtime-and-modular-structure.md) | Arquitectura, runtime y estructura modular | Propuesto |
| [0002](./0002-quality-ci-and-security-strategy.md) | Estrategia de calidad, integración continua y seguridad | Propuesto |
