# Cómo contribuir

Esta guía resume cómo llega un cambio a `main` en AulaNorma. La norma de referencia es la
[constitución de ingeniería](.specify/memory/constitution.md); si esta guía y la constitución
difieren, prevalece la constitución.

## Ramas y pull requests

- Cada cambio se desarrolla en una **rama propia** y llega a `main` **exclusivamente mediante
  pull request**. No se hacen pushes directos ni forzados a `main`.
- Cada pull request debería poder revisarse en una sola sesión; se evitan las ramas de larga
  duración.
- Todo pull request debe superar los controles automáticos. Un pull request con controles
  requeridos fallidos no se integra en `main`. Los nueve controles y el estado de su activación
  como requeridos están en [`docs/engineering/branch-protection.md`](docs/engineering/branch-protection.md).
- El código, los identificadores técnicos, los nombres de ficheros de código y los mensajes de
  commit se escriben en inglés. La documentación funcional, las especificaciones, los ADR y los
  textos de interfaz se escriben en español.
- Nunca se incluyen en el repositorio secretos, credenciales, datos personales reales ni
  documentos normativos sin registro de procedencia. Si se expone un secreto, sigue
  [`SECURITY.md`](SECURITY.md).

## Flujo Spec Kit

GitHub Spec Kit es el flujo oficial de desarrollo.

- **Funcionalidades críticas**: las que afectan a trazabilidad normativa, interpretación
  estructurada, aprobación docente, publicación en Moodle, esquemas, seguridad o permisos, o
  integración con IA. Siguen la secuencia completa:

  `specify` → `clarify` → `plan` → `checklist` → `tasks` → `analyze` → `implement` → `converge`

- **Funcionalidades no críticas**: como mínimo `specify` → `plan` → `tasks` → `implement` →
  `converge`. En caso de duda, se tratan como críticas.
- `converge` es obligatorio para todas las funcionalidades, críticas o no.

Los artefactos de cada funcionalidad se guardan en `specs/<rama>/`.

## Principio VII: porciones verticales pequeñas

- Cada funcionalidad se entrega como una porción vertical pequeña que atraviesa las capas
  necesarias y produce un resultado verificable por un docente.
- El primer alcance es la unidad formativa **UF0517** del certificado de profesionalidad
  **ADGG0408**. No se amplía al certificado ADGG0408 completo hasta que el flujo extremo a
  extremo de UF0517 (ingesta, interpretación, generación, revisión y publicación en un Moodle
  de pruebas) funcione y haya sido validado por un docente.
- El código no contiene lógica específica de UF0517 ni de ADGG0408: la especificidad reside en
  los datos y en las pruebas, no en el código.

La base de ingeniería actual no contiene lógica, datos, configuración ni nombres específicos de
ningún certificado (FR-024). `tests/architecture/no-domain-specifics.test.ts` falla si aparece
uno de esos códigos en `src/`, `tests/`, `scripts/` o en los ficheros operativos de la raíz.

## Antes de abrir un pull request

Ejecuta el agregado de las ocho categorías de control:

```bash
npm run tools:install   # una vez: Gitleaks y zizmor verificados por SHA-256
npm run check
```

Debe terminar con código 0. Son los mismos comandos que ejecutan los nueve controles de la
integración continua; el detalle está en
[`docs/engineering/quality-controls.md`](docs/engineering/quality-controls.md).
`npm run verify:negative` no forma parte de esta comprobación: es un procedimiento de
aceptación.

## Revisión con un único autor

Mientras haya un único mantenedor no se exige la aprobación de otra persona. La revisión se
documenta en la **descripción del pull request** con la **lista de comprobación
constitucional**, que responde las doce puertas de verificación de la constitución con su
evidencia:

1. Procedencia normativa: documento, sección y página de origen (I).
2. Cuatro capas y sus contratos (II).
3. Publicación solo con aprobación docente explícita y vigente (III).
4. Salidas críticas validadas contra esquemas versionados (IV).
5. Mínimo privilegio, secretos, validación de archivos, control de acceso y auditoría, y las
   condiciones de la excepción pública de estado si existe (V).
6. Publicación idempotente, reanudable y sin duplicados (VI).
7. Porción vertical pequeña dentro del alcance vigente (VII).
8. Pruebas obligatorias (VIII).
9. Acceso a IA mediante adaptadores, con límites de coste y registro de uso (IX).
10. Accesibilidad y lenguaje claro (X).
11. Registro de generaciones, revisiones, publicaciones y decisiones (XI).
12. Complejidad evitada o justificada en un ADR (XII).

Una puerta que no aplica se marca como tal, con su motivo. Una excepción de secretos o de
dependencias se aprueba en el pull request que la añade y su aprobación queda registrada en
esta lista ([`docs/engineering/security-exceptions.md`](docs/engineering/security-exceptions.md)).

## Definition of Done

Un cambio está terminado solo si cumple todo lo siguiente:

- criterios de aceptación verificados;
- pruebas obligatorias (principio VIII) escritas y superadas;
- documentación funcional y técnica actualizada;
- ADR creado o actualizado si hubo una decisión arquitectónica relevante;
- sin secretos, datos personales reales ni normativa sin procedencia;
- trazabilidad normativa preservada en todo contenido afectado;
- accesibilidad verificada en los cambios de interfaz.

## Pull requests negativos

Durante la aceptación de la base se demuestra en la integración continua que cada categoría de
control detecta su fallo, con un pull request negativo por categoría:

- rama `negative-test/<identificador>`, donde el identificador es `format`, `lint`, `types`,
  `test`, `build`, `secrets`, `dependencies` o `workflows`;
- pull request **en borrador** hacia `main`, con el título
  `[NEGATIVE TEST] <identificador> — do not merge`;
- **nunca se integra**: tras registrar el enlace a la ejecución fallida, se cierra sin integrar y
  se elimina su rama;
- solo datos sintéticos: nunca un secreto real ni una dependencia maliciosa no controlada.

El procedimiento completo, incluida la protección de push en el caso de secretos, está en
[`specs/001-engineering-baseline/plan.md`](specs/001-engineering-baseline/plan.md#aceptación-en-la-integración-continua-una-vez-antes-de-integrar).
