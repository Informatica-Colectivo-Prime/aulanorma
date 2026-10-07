# Comprobación de la historia 2: índice, cobertura y aprobación

**Tareas**: T043 a T050 | **Fecha**: 2026-10-07 | **Datos del piloto**:
[pilot/README.md](./pilot/README.md) | **Historia anterior**: [us1-check.md](./us1-check.md)

Registro de cómo se comprobó la fase 5 de `tasks.md`: de una interpretación validada a una
propuesta de índice, su edición, la comprobación de la cobertura y la aprobación o el rechazo
de una persona, con el presupuesto de generación que esa petición necesita.

## Qué puede hacer ya un docente

1. Ver, antes de pedir el índice, la estimación del coste, el máximo que se reserva y el
   presupuesto disponible.
2. Pedir una propuesta de índice a partir de una interpretación validada y vigente.
3. Ver cada entrada con los requisitos en los que se apoya y su página, o marcada «sin
   respaldo normativo».
4. Ver la cobertura: cada requisito del inventario, con su documento, su sección y su página,
   y las entradas que lo cubren, o «No cubierto».
5. Añadir una entrada, renombrarla, cambiar sus requisitos, subirla, bajarla y quitarla.
6. Previsualizar el índice, identificado como borrador no entregable mientras no tenga una
   aprobación vigente o le falte cobertura.
7. Aprobar la versión que tiene delante, si la cobertura es completa; o rechazarla, con un
   motivo, y devolverla después a revisión.

La propuesta sale de **respuestas grabadas**: no hay ningún proveedor de generación
conectado, y la interfaz lo dice. Aprobar es siempre una acción de una persona; ninguna
operación aprueba por su cuenta.

## Reglas comprobadas

| Regla                                                                                   | Cómo se impone                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| La cobertura se calcula por vínculos explícitos, sin herencia en ningún sentido         | `computeCoverage`; nunca se almacena ni se lee de la propuesta                                   |
| Una entrada sin respaldo no cubre nada ni compensa un requisito sin cubrir               | La cobertura la ignora, y la base de datos impide que tenga vínculos                             |
| Una entrada puede apoyarse en varios requisitos, y un requisito, estar en varias entradas | Tabla de vínculos `entry_requirement`                                                            |
| Con requisitos pendientes se guarda, se edita y se previsualiza, pero no se aprueba      | `approve` responde 422 con los pendientes y su referencia normativa                              |
| No existe ninguna vía para aprobar pese a una cobertura incompleta                       | Ni campo, ni perfil, ni destino; sin su registro de aprobación no hay aprobación vigente         |
| Una propuesta que declara cobertura completa y omite un requisito sigue incompleta       | La afirmación se admite en el formato solo para ignorarla; no se guarda                          |
| Cualquier cambio de un índice aprobado lo devuelve a revisión                            | Cada cambio aumenta la revisión; la aprobación anterior queda en el registro, sin vigencia       |
| Corregir la interpretación deja sin vigencia la aprobación del índice                    | La aprobación guarda la validación en la que se apoyó; revalidar no devuelve la vigencia         |
| Nada se borra                                                                            | Una entrada quitada queda marcada; cambios, aprobaciones y rechazos son de solo inserción        |
| Control de versiones en el servidor                                                      | Todo cambio y toda decisión llevan la revisión abierta; si no es la actual, 409 y nada guardado  |
| Autorización en el servidor                                                              | Cada página y cada acción exigen sesión, su testigo y el perfil `teacher`; se deniega y se audita |

Las aprobaciones dependientes de la del índice (temas y versión del temario) todavía no
existen. Su vigencia se derivará de la del índice, como fija `data-model.md`.

## Presupuesto de generación

Adelantado desde la fase 6 (T049 y T050): pedir el índice es una operación de generación.

- Ninguna operación se envía sin una reserva de su coste máximo, hecha en una transacción que
  comprueba el máximo por operación y lo disponible del límite acumulado.
- La estimación que se muestra es distinta del máximo que se reserva.
- El envío se anota antes de llamar. Con el consumo confirmado, la reserva se liquida; sin
  él, queda incierta y sigue contando hasta que un administrador la concilia. Solo se libera
  lo que consta que no se envió.
- Reducir el límite no altera las reservas ni cancela lo enviado, y no deja iniciar nada
  nuevo. Ampliarlo no inicia ni reanuda nada.
- Cada cambio del límite queda con su actor, su fecha, el valor anterior y el nuevo.

**Todo esto se probó con proveedores y consumos simulados.** El adaptador determinista, que
es el que usa el producto, no cuesta nada: en el navegador la estimación, el máximo y lo
disponible son cero, y la moneda figura como «sin fijar». Esas cifras no son precios de
ningún proveedor. El límite del presupuesto todavía no se puede cambiar desde el producto:
sus páginas son de la fase 6 (T057).

## Pruebas automáticas

| Fichero                                                    | Casos | Qué cubre                                                                     |
| ---------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `tests/unit/didactic-content/outline-repository.test.ts`   | 9     | Estados, entradas, vínculos y lo que impone la base de datos                  |
| `tests/unit/didactic-content/coverage.test.ts`             | 8     | Vínculos explícitos, sin herencia, sin respaldo, quitadas y retirados         |
| `tests/unit/didactic-content/outline-proposal.test.ts`     | 24    | Condiciones, lo que se envía, formato, referencias inexistentes y SC-027      |
| `tests/unit/didactic-content/outline-approval.test.ts`     | 39    | Edición, revisión, aprobación, invalidación (SC-028 y SC-029) y rechazo       |
| `tests/unit/platform/budget.test.ts`                       | 16    | Reserva atómica, límites, dos conexiones y modificación del límite            |
| `tests/unit/platform/budget-lifecycle.test.ts`             | 19    | Ciclo de la reserva, simultaneidad, inciertas, caída, conciliación y reducción |
| `tests/integration/us2-outline-coverage.test.ts`           | 28    | Escenarios 1 a 9 por las rutas reales, conflicto, rechazo y autorización      |

Además se adaptaron el contrato del proveedor, las pruebas de configuración, de migraciones,
de la lista cerrada de rutas y de los límites de importación, y la prueba de humo. `npm run
check` y `npm run verify:negative` terminaron con código 0.

## Recorrido en un navegador

Chrome 154 sin interfaz gráfica, contra `npm run dev`, dos veces, con datos vacíos cada vez y
el PDF real del piloto. **Es un ensayo**: las cuentas eran desechables y sus validaciones y
aprobaciones no son las de ninguna persona. Los datos no se conservan.

| Paso                                                  | Resultado                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Interpretación sin validar                            | No ofrece pedir el índice; explica que hay que validarla                                    |
| Petición del índice                                   | Muestra estimación, máximo reservado, disponible y máximo por operación; dice que no son precios |
| Propuesta                                             | 4 entradas; 71 de 71 requisitos cubiertos; origen identificado como respuesta grabada       |
| Vista previa sin aprobar                              | «Borrador no entregable. El índice no tiene una aprobación vigente.»                        |
| Quitar una entrada                                    | 62 de 71; 9 «No cubierto», cada uno con su documento, su sección y su página                |
| Intentar aprobar                                      | 422; enumera los 9 pendientes con enlace a su página; nada registrado                       |
| Enviar la aprobación con campos de más                | 422                                                                                         |
| Añadir una entrada apoyada en 9 requisitos            | 71 de 71                                                                                    |
| Añadir una entrada sin requisitos                     | Marcada «Sin respaldo normativo»; la cobertura no cambia                                    |
| Título inválido                                       | 422 con el formulario y la casilla marcada                                                  |
| Guardar desde dos pestañas                            | 409; versión más reciente junto al cambio sin guardar; se guarda al reenviarlo              |
| Aprobar sobre una versión anterior                    | 409 con la versión más reciente; nada registrado                                            |
| Rechazar sin motivo, y con él                         | 422; después «Rechazado», con las 5 entradas intactas y el motivo en el registro            |
| Devolver a revisión y aprobar                         | «Aprobado»; registro con cuenta, fecha, hora y versión, «Vigente»                           |
| Vista previa aprobada                                 | Sin la marca de borrador; avisa de que no es un paquete                                     |
| Reordenar después de aprobar                          | «En revisión», versión nueva; la aprobación anterior, «Sin vigencia»; mismas entradas       |
| Corregir la interpretación después de aprobar         | «Aprobación sin vigencia»; aprobar responde 422 hasta validar de nuevo                      |
| Sin sesión                                            | La página y la acción llevan a la entrada                                                   |
| Cuenta sin perfil                                     | 403 en la página, en la vista previa y en las cinco acciones                                |
| Consola y red                                         | Sin errores de script; solo peticiones al propio origen                                     |

El recorrido descubrió dos defectos, corregidos antes de entregar: las entradas mostraban sus
requisitos en un orden arbitrario, y la página de la interpretación presentaba como aprobado
un índice cuya aprobación ya no estaba vigente.

## Limitaciones

- **No hay proveedor real.** La calidad de una propuesta y su coste no están comprobados. La
  propuesta del piloto es una agrupación mecánica del inventario, no una propuesta didáctica.
- **Nadie ha validado la interpretación del piloto ni aprobado su índice.** Lo hecho son
  ensayos automatizados.
- **La propuesta grabada depende del inventario exacto.** Si la interpretación se corrige
  antes de pedir el índice, el adaptador no responde.
- **Un índice por interpretación.** No se puede pedir otra propuesta para la misma
  interpretación; se edita la que hay.
- **Reordenar es subir o bajar una posición**, sin arrastrar.
- **Documento con sustituto**: su índice queda como histórico, sin poder cambiarse ni
  aprobarse. La comprobación de referencias heredadas que lo permitirá es T058.
- **El presupuesto no tiene páginas** (T057): no se consulta su detalle, no se cambia el
  límite ni se concilia desde el producto. Con el límite a cero solo caben operaciones sin
  coste, que son las del adaptador determinista.
- **Petición de interpretación**: muestra lo disponible, pero no una estimación, porque su
  coste depende de las páginas que se indican en ese mismo formulario.
- **Una ejecución de generación interrumpida** por una caída conserva su reserva como
  incierta, pero su estado sigue figurando como en curso.
- **Las aprobaciones dependientes** del índice no existen todavía: llegan con los temas.
