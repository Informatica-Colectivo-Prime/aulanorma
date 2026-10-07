# Comprobación de la historia 3: temario, presupuesto y aprobaciones

**Tareas**: T051 a T059 | **Fecha**: 2026-10-07 | **Datos del piloto**:
[pilot/README.md](./pilot/README.md) | **Historia anterior**: [us2-check.md](./us2-check.md)

Registro de cómo se comprobó la fase 6 de `tasks.md`: de un índice aprobado al temario
desarrollado tema a tema, su edición, la revisión junto a la fuente normativa, las
aprobaciones de cada tema y de la versión, su invalidación, las páginas del presupuesto y la
comprobación de referencias tras un documento sustituto.

## Qué puede hacer ya un docente

1. Ver, antes de lanzar o reanudar la generación, la estimación, el máximo que se reserva y
   lo disponible, y confirmar.
2. Desarrollar el temario tema a tema, y ver cuáles terminaron, cuáles fallaron y por qué.
3. Pedir de forma expresa otro intento de lo pendiente o fallido.
4. Abrir cada tema con sus bloques identificados como requisito del BOE o como desarrollo
   didáctico, con acceso a la página de origen y a los requisitos que cada desarrollo trabaja.
5. Añadir, editar, reordenar y quitar bloques.
6. Aprobar o rechazar cada tema, y devolver a revisión uno rechazado.
7. Ver, requisito a requisito, dónde está citado y dónde está desarrollado.
8. Aprobar una versión del temario, o ver qué falta para poder hacerlo.
9. Consultar el presupuesto de generación.
10. Tras un documento sustituto, comprobar una a una las referencias de un índice o de un tema.

Una cuenta de administración puede, además, modificar el límite del presupuesto y conciliar
las operaciones de resultado incierto.

El contenido sale de **respuestas grabadas**: no hay ningún proveedor de generación
conectado, y cada página lo dice. Estos ensayos no acreditan una generación real ni la
calidad pedagógica de ningún contenido. Aprobar es siempre una acción de una persona.

## Lo que pidió comprobar el mantenedor

| Comprobación                                                    | Cómo se impone                                                                                         | Dónde se prueba                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| No se genera temario sin índice aprobado y vigente               | `generate` lo exige; también con la aprobación invalidada por una edición o una corrección              | `syllabus-generation`, escenario 1 por las rutas   |
| Cada requisito obligatorio tiene desarrollo y referencia         | La versión exige, por requisito, un bloque que lo cite y otro que lo desarrolle                         | `syllabus-version`, escenarios 5 y 7               |
| Una cita por sí sola no acredita desarrollo                      | `computeDevelopment` separa «citado en» y «desarrollado en»; sin herencia                               | `syllabus-version`, escenario 7                    |
| Una edición invalida las aprobaciones correspondientes           | Vigencia derivada: tema → su aprobación y la versión; índice o interpretación → todas                   | `topic-approval`, escenario 6, SC-028              |
| El límite conserva los temas terminados y señala los pendientes  | Sin reserva posible, la operación y las siguientes no se envían; lo terminado ya está guardado          | `syllabus-generation`, SC-032 por las rutas        |
| Conflictos, permisos y conciliación se resuelven desde el producto | 409 con la versión más reciente y el cambio enviado; perfiles en el servidor; conciliación en `/budget` | escenario 10, SC-007, SC-037 y navegador           |

## Tema fallido, reintentos y operaciones inciertas (FR-019 y FR-066)

CHK032 se cerró antes de esta fase con la redacción; aquí está el comportamiento.

- Un tema es **fallido** si su operación termina con error, o si su propuesta no cumple el
  esquema o cita o desarrolla requisitos que no son de su entrada. El resultado no se guarda,
  y el tema no se puede editar ni aprobar.
- El docente ve el motivo: error de la operación, formato inválido, referencias no admitidas
  o resultado incierto.
- **Ningún reintento automático**: el servicio de generación recibe exactamente una operación
  por tema. Otro intento es la misma acción explícita, con su propia reserva, y solo procesa
  lo pendiente o fallido: un borrador válido no se repite ni se sustituye.
- Una operación de **resultado incierto** conserva su reserva y su tema no se reenvía hasta
  que un administrador la concilia.

## Pruebas automáticas

| Fichero                                                  | Casos | Qué cubre                                                                          |
| -------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `tests/unit/didactic-content/render.test.ts`             | 18    | Esquema del contenido, texto editable y renderizador con texto hostil (SC-046)     |
| `tests/unit/didactic-content/syllabus-generation.test.ts` | 21   | Condiciones, estimación, reserva por tema, fallidos, inciertas, límite y reanudación |
| `tests/unit/didactic-content/topic-approval.test.ts`     | 31    | Edición, revisión, aprobación, invalidación por tema y por índice, y rechazo       |
| `tests/unit/didactic-content/syllabus-version.test.ts`   | 15    | Cita y desarrollo por requisito, bloqueos, instantánea y versiones                 |
| `tests/unit/didactic-content/reference-check.test.ts`    | 9     | Referencias heredadas del índice y de los temas                                    |
| `tests/integration/us3-syllabus-approval.test.ts`        | 19    | Escenarios 1 a 10 por las rutas reales, SC-028, SC-032, SC-037, SC-041 y permisos  |

Además se adaptaron el contrato del proveedor, las pruebas del índice afectadas por las
referencias heredadas, las de migraciones, la lista cerrada de rutas y la prueba de humo.
`npm run check` y `npm run verify:negative` terminaron con código 0.

En las pruebas unitarias, el proveedor y sus consumos son simulados. En las de integración se
usa el adaptador determinista del producto, que no cuesta nada: el consumo que alcanza el
límite se simula con una reserva preparada.

## Recorrido en un navegador

Chrome 154 sin interfaz gráfica, contra `npm run dev`, con un directorio de datos exclusivo
y el PDF real del piloto. **Es un ensayo**: las cuentas eran desechables y sus aprobaciones no
son las de ninguna persona. Los datos no se conservan.

| Paso                                                  | Resultado                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Temario con el índice sin aprobar                     | No ofrece generar; el envío directo responde que hay que aprobar el índice                      |
| Antes de generar                                      | Estimación, máximo reservado, disponible y máximo por operación, como coste simulado             |
| Generar con una respuesta ausente                     | 3 borradores y 1 fallido, con su motivo; «Generación incompleta»; 62 de 71 requisitos            |
| Aprobar el tema fallido                               | 422                                                                                             |
| Otro intento, tras añadir la respuesta                | Solo se genera ese tema; 71 de 71                                                               |
| Abrir un tema                                         | 9 bloques «Requisito extraído del BOE», con enlace a su página, y 1 «Desarrollo didáctico generado» |
| Guardar un bloque desde dos pestañas                  | 409; versión más reciente junto al cambio sin guardar; se guarda al reenviarlo                  |
| Texto con `<script>` y `<b>`                          | Se muestra literal; ningún elemento activo en la página                                         |
| Aprobar la versión con temas sin aprobar              | 422, con los temas pendientes                                                                   |
| Desmarcar un requisito de un desarrollo               | «Sin desarrollo» para ese requisito, aunque sigue citado; 70 de 71                              |
| Aprobar la versión así                                | 422; el requisito, con su documento, sección y enlace a su página; con campos de más, también 422 |
| Completar, aprobar el tema y la versión               | «Versión v1», con cuenta, fecha, hora y huella; «Vigente»                                       |
| Reordenar un bloque de un tema aprobado               | El tema, «En revisión»; la versión v1, «Sin vigencia»                                           |
| Rechazar un tema, devolverlo y aprobarlo              | Motivo en el registro; después «Versión v2», y la v1 se conserva                                |
| Reordenar el índice                                   | Los cuatro temas, «Aprobación sin vigencia»; las dos versiones, «Sin vigencia»; aprobar un tema, 422 |
| Presupuesto con cuenta de docente                     | Cifras sin formularios; modificar el límite, 403                                                |
| Presupuesto con cuenta de administración              | Modifica el límite, con cuenta, fecha, valor anterior y nuevo; avisa si queda por debajo de lo comprometido |
| Conciliar una operación incierta simulada             | Pasa a consumo confirmado con el importe indicado; ya no figura como pendiente                   |
| Administración sin perfil de docente, y cuenta sin perfiles | 403 en el temario; 403 en las tres páginas y en las nueve acciones                         |
| Consola y red                                         | Sin errores de script; solo peticiones al propio origen                                         |

La operación incierta del recorrido se insertó a mano en la base de datos del ensayo, porque
el adaptador determinista no puede producir una: es un dato simulado.

## Limitaciones

- **No hay proveedor real.** La calidad y el coste de una generación no están comprobados.
  Las respuestas de los temas del piloto son un texto de relleno que se declara como tal.
- **Nadie ha validado la interpretación del piloto, ni aprobado su índice, sus temas ni
  ninguna versión.** Lo hecho son ensayos automatizados.
- **La generación se ejecuta dentro de la petición**, tema a tema. Con el adaptador
  determinista es inmediata; con un proveedor real habrá que decidir cómo mostrar el progreso.
- **Un tema con contenido no se puede regenerar.** Solo se generan temas pendientes o
  fallidos; uno terminado se edita.
- **Un tema por entrada.** Si se quita una entrada del índice, su tema se conserva, sin
  aparecer en el temario.
- **Una entrada añadida después** aparece como pendiente y se genera con la reanudación.
- **Los bloques de desarrollo solo se vinculan a requisitos de su entrada.** Para apoyarse en
  otro, hay que vincularlo antes en el índice, lo que exige aprobarlo de nuevo.
- **Documento con sustituto**: el índice y los temas se conservan sin poder editarse, y se
  aprueban de nuevo tras comprobar cada referencia. La comprobación es una declaración del
  docente; el producto no compara los dos documentos.
- **El límite no se alcanza desde el navegador**, porque todo cuesta cero. Está comprobado
  con consumos simulados.
- **Una ejecución interrumpida** por una caída conserva sus reservas como inciertas, pero su
  estado sigue figurando como en curso.
- **La vista previa y la exportación del temario** son de la fase 7.
