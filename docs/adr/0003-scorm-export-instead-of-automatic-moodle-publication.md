# ADR 0003: Exportación SCORM en lugar de publicación automática en Moodle

**Estado**: Aceptado. Estuvo Propuesto desde el 2026-10-07; se acepta con el cambio que migra
el módulo de la cuarta capa a `src/modules/content-export`. La aceptación registra la decisión
arquitectónica y no cambia su sentido. No indica que la exportación SCORM esté implementada:
el módulo sigue vacío.

**Fecha**: 2026-10-07

**Contexto de origen**: cambio de alcance autorizado por el mantenedor el 2026-10-07 y enmienda
de la constitución a la versión 2.0.0, que redefine la cuarta capa (principio II), el principio
VI y las reglas de relación con Moodle. Este ADR acompaña a esa enmienda, como recomienda su
procedimiento.

## Contexto

Hasta la constitución 1.1.0, AulaNorma debía terminar su flujo **publicando** el curso aprobado
en Moodle de forma automática: mediante los servicios web externos de Moodle, con MCP como
transporte opcional y, si hacía falta, con un plugin local (`local_aulanorma`). El principio VI
exigía que esa publicación fuera idempotente y recuperable, y el principio V regulaba los
tokens de Moodle.

Ese final del flujo es la parte más costosa y arriesgada del producto para un TFM con un único
mantenedor: exige operar una integración remota con credenciales, reconciliar estados entre dos
sistemas y mantener un plugin en otra plataforma. Ninguna de esas piezas existe todavía: la
base de ingeniería (`001-engineering-baseline`) no contiene funcionalidad de producto, y el
módulo `src/modules/moodle-publication` está vacío.

El alcance autorizado es otro:

- la aplicación recibe un PDF oficial del BOE, propone un índice basado en su contenido y
  desarrolla el temario;
- el docente revisa y aprueba el índice y el contenido antes de exportarlo;
- la entrega es un **paquete SCORM descargable**, con instrucciones para que el usuario lo
  incorpore manualmente a Moodle;
- la publicación automática mediante servicios web de Moodle, MCP o un plugin queda fuera.

## Decisión

1. **Exportación en lugar de publicación**. La cuarta capa de la arquitectura pasa a ser la
   **exportación**: transforma el índice y el contenido aprobados en un paquete descargable. No
   genera ni altera contenido didáctico.
2. **Formato**: **SCORM 1.2**. El paquete es un fichero ZIP con `imsmanifest.xml` en la raíz y
   todos sus recursos dentro.
3. **Paquete autónomo**. El paquete incluye los recursos de su contenido y, una vez
   importado, funciona sin depender de AulaNorma ni hacer peticiones a servicios externos. La
   comunicación con la API de ejecución de SCORM 1.2 de la plataforma que lo ejecuta está
   permitida y es necesaria para guardar el seguimiento. Una vista previa sin esa plataforma
   muestra el contenido, pero no acredita la persistencia del seguimiento.
4. **Contenido del paquete**: un **único SCO** con navegación interna entre temas.
   - El alumno puede marcar cada tema como recorrido.
   - La finalización se comunica cuando el alumno ha marcado todos los temas y pulsa
     «Finalizar». No se presenta como prueba de aprendizaje ni como calificación: el paquete
     no envía puntuación ni un estado de superación.
   - Al volver a entrar en el mismo intento, el paquete reanuda en el último tema y conserva
     los temas marcados.
   - Solo usa el modelo de datos de SCORM 1.2 (estado de la lección, posición y datos de
     suspensión), con un estado compacto que quepa en sus límites.
   - La plataforma recibe el estado de finalización. No se prometen porcentajes ni detalle por
     tema en sus informes.
   - No incluye evaluación calificable en esta entrega.
5. **Distinción visible**. El paquete conserva y muestra la distinción entre los requisitos
   extraídos del documento oficial y el desarrollo didáctico generado, con su procedencia
   (principio I).
6. **Sin conexión con Moodle**. AulaNorma no se conecta a Moodle, no solicita ni almacena
   credenciales o tokens de Moodle y no incluye ningún plugin. La incorporación del paquete es
   manual y la realiza el usuario, con las instrucciones que acompañan al paquete.
7. **Compatibilidad verificada, no supuesta**. No se declara la compatibilidad con Moodle, ni
   con una versión concreta, hasta haber verificado la importación y el funcionamiento del
   paquete en un Moodle real de pruebas, con un procedimiento manual reproducible. La
   evidencia registra la versión exacta y la configuración verificadas. La comprobación puede
   hacerla el mantenedor y no forma parte de la integración continua, que comprueba el
   contrato de seguimiento contra un doble de la API de SCORM.
8. **Piloto**: se mantiene la unidad formativa UF0517 del certificado ADGG0408 (principio VII).
9. **Aprobación previa**. Un paquete solo se genera a partir de un índice aprobado y vigente y
   de una versión aprobada del temario. El paquete identifica esa versión, y la huella SHA-256
   del fichero entregado queda registrada para comprobar su integridad. Exportar de nuevo la
   misma versión aprobada produce el mismo contenido aprobado con una estructura equivalente;
   no se exige identidad binaria entre dos ficheros generados por separado.
10. **Ubicación de la capa**. La ubicación objetivo del módulo de la cuarta capa es
    `src/modules/content-export`. Sustituye a `src/modules/moodle-publication` (ver "Relación
    con los ADR aceptados" y "Migración pendiente").

## Relación con los ADR aceptados

Los ADR 0001 y 0002 siguen **Aceptado** y no se reescriben. Este ADR **sustituye
parcialmente** al ADR 0001, solo en lo que se indica, y no sustituye al ADR 0002.

- **ADR 0001 (arquitectura, runtime y estructura modular)**. Este ADR sustituye dos elementos
  concretos de su decisión 5 ("Estructura modular"):
  - **Responsabilidad** de la cuarta capa: de la publicación en Moodle (la correspondencia
    entre el contenido aprobado y Moodle) a la **exportación** de un paquete descargable.
  - **Ubicación** de su módulo: de `src/modules/moodle-publication` a
    `src/modules/content-export`.

  Todo lo demás del ADR 0001 sigue vigente: la aplicación única, el runtime, el lenguaje, el
  gestor de paquetes, la frontera HTTP, `src/platform` y la estructura de cuatro módulos de
  capa, cada uno con un `index.ts` público y un `README.md`. Tampoco cambian la posición de la
  cuarta capa ni sus dependencias permitidas: solo puede importar `platform` y
  `didactic-content`, y ninguna otra capa puede importarla.

  El ADR 0001 no se edita para cambiar su sentido. Cuando este ADR se acepte, el ADR 0001
  recibirá una nota de revisión que remita aquí, y el índice lo reflejará. No hace falta otro
  ADR para esta misma decisión.
- **ADR 0002 (calidad, integración continua y seguridad)**. Sigue vigente sin cambios. Los
  nueve controles requeridos, el bloqueo de red en las pruebas y la gestión de secretos se
  aplican igual. La comprobación en un Moodle de pruebas es manual y no añade ningún control
  ni dependencia a la integración continua.
- **Evidencia de `001-engineering-baseline`**. No cambia. Sus artefactos describen el alcance
  vigente cuando se escribieron, incluidas las menciones a la publicación en Moodle como
  funcionalidad futura excluida, y se conservan como historial.

## Alternativas consideradas

- **Mantener la publicación automática mediante servicios web de Moodle**. Descartada para
  esta entrega: exige credenciales, idempotencia y reconciliación entre dos sistemas, y un
  Moodle disponible en las pruebas de integración. Es el alcance que se retira.
- **Plugin de Moodle (`local_aulanorma`)**. Descartado: añade un segundo producto que mantener,
  en otro lenguaje y con su propio ciclo de versiones.
- **MCP como capa de transporte hacia Moodle**. Descartado junto con la publicación
  automática: sin integración remota no tiene función.
- **Un SCO por tema**. Descartado: multiplica los intentos y los estados que gestiona la
  plataforma, y la navegación entre temas pasaría a depender de ella. Un único SCO mantiene la
  navegación y el recorrido dentro del paquete.
- **SCORM 2004**. Descartado por ahora: su secuenciación añade complejidad que un temario
  navegable no necesita, y el soporte de SCORM 1.2 está más extendido. Sus límites de
  almacenamiento son mayores, lo que podría reabrir la decisión si los de SCORM 1.2 resultan
  insuficientes.
- **Paquete IMS Common Cartridge o copia de seguridad de Moodle (`.mbz`)**. Descartados: el
  primero no ofrece seguimiento de avance equivalente, y el segundo es un formato interno de
  Moodle, ligado a su versión.
- **xAPI o cmi5**. Descartados: requieren un almacén de registros de aprendizaje, es decir,
  infraestructura y comunicación externas, lo que contradice el paquete autónomo.
- **Entregar solo documentos (PDF o HTML sin seguimiento)**. Descartado: no permite el
  seguimiento de avance ni la reanudación.

## Consecuencias

**Positivas**:

- Desaparecen las credenciales de Moodle, la integración remota y el plugin: menos superficie
  de ataque y menos infraestructura (principios V y XII).
- La integración continua no depende de ninguna instancia de Moodle.
- El resultado es un artefacto verificable por sí mismo: se puede validar su estructura,
  calcular su huella y demostrar de qué versión aprobada procede.
- El paquete puede importarse en cualquier plataforma que admita SCORM 1.2, aunque solo se
  declara compatibilidad con las que se hayan verificado.

**Negativas y riesgos aceptados**:

- La incorporación a Moodle es manual: el docente debe seguir las instrucciones, y AulaNorma no
  sabe si el paquete se importó ni dónde. Actualizar un curso ya importado exige volver a
  exportar e importar.
- El control humano termina en la descarga. La aprobación docente cubre el contenido del
  paquete, no lo que ocurra después en Moodle.
- SCORM 1.2 limita el seguimiento: los datos de suspensión tienen un tamaño máximo reducido y
  el modelo no distingue por separado finalización y superación. El seguimiento será básico.
- La compatibilidad real depende de la versión y de la configuración de Moodle; por eso se
  exige verificarla antes de declararla.
- Hasta completar la migración, el módulo conserva el nombre `moodle-publication`, que ya no
  describe su responsabilidad.
- Recuperar la publicación automática en el futuro exige enmendar de nuevo la constitución y un
  ADR nuevo.

## Migración pendiente

**Nota de revisión (aceptación)**: la migración descrita en esta sección se completó en el
cambio que acepta este ADR. El texto que sigue se conserva como se propuso.

La ubicación objetivo es `src/modules/content-export`. **Este ADR no renombra nada**: el módulo
actual, `src/modules/moodle-publication`, sigue vacío y conserva su nombre hasta que la
migración se haga como parte de la primera funcionalidad de producto, en un cambio propio con
sus pruebas. Deberá actualizar a la vez, como mínimo:

- el directorio del módulo, su `index.ts` y su `README.md`;
- las reglas `no-restricted-imports` de `eslint.config.mjs`;
- `tests/architecture/import-boundaries.test.ts` y cualquier otra prueba de arquitectura que
  nombre el módulo;
- la alteración de `lint` de `scripts/negative-checks.mjs`, que importa
  `@/modules/moodle-publication`, y su descripción en `docs/engineering/quality-controls.md`;
- `docs/engineering/architecture.md` y los `README.md` de las demás capas que lo mencionan.

Hasta entonces, el `README.md` del módulo actual indica su carácter transitorio. La evidencia
de `001-engineering-baseline`, que cita el nombre anterior, no se modifica.

## Decisiones pendientes

Corresponden al plan técnico de la primera funcionalidad de producto. Mientras este ADR está
Propuesto, puede corregirse con lo que allí se decida.

- Versión y configuración de Moodle en las que se verifica la importación.
- Biblioteca o implementación para generar el paquete y cómo se valida su manifiesto.
- Codificación concreta del estado compacto de seguimiento.
- Persistencia, autenticación y autorización, y proveedor de IA: la base de ingeniería no
  tiene ninguna de las tres. La especificación define sus necesidades funcionales; la elección
  técnica se registra en el plan y, si procede, en un ADR propio.
