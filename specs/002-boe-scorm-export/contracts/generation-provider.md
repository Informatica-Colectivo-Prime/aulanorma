# Contrato: proveedor de generación y presupuesto

**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md) (R6)

Interfaz propia entre el dominio y cualquier proveedor de IA (principio IX). El dominio no
importa ningún SDK; cada proveedor es un adaptador que cumple este contrato y pasa las mismas
pruebas.

## Operación

Una única operación: generar una salida estructurada.

| Entrada                 | Descripción                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `task`                  | `interpretation`, `outline` o `topic`                                    |
| `promptVersion`         | Versión del prompt, que es un fichero del repositorio                    |
| `input`                 | Datos de la tarea; el texto del documento va marcado como dato           |
| `outputSchema`          | Esquema versionado que debe cumplir la salida                            |
| `maxOutputTokens`       | Límite de salida, usado también para reservar el coste                   |

| Resultado               | Descripción                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `ok` con `output`       | Salida que cumple el esquema                                             |
| `invalid_output`        | El proveedor respondió, pero la salida no cumple el esquema              |
| `provider_error`        | Fallo del proveedor o de la red; en el piloto, sin reintentos automáticos |
| `usage`                 | Proveedor, modelo, tokens de entrada y de salida, y latencia; siempre    |

## Reglas

- El adaptador no decide nada del dominio: no calcula la cobertura, no aprueba y no escribe
  en el almacenamiento.
- Una salida inválida nunca se repara: se rechaza y se registra. En el piloto no hay
  reintentos automáticos: otro intento lo pide expresamente un usuario autorizado, con su
  propia reserva (FR-019, FR-066).
- El texto del documento y cualquier salida anterior se envían como datos, separados de las
  instrucciones (FR-004).
- No se envían datos personales: ni identidades ni registros de usuarios (FR-029).
- Lo que afirme una salida sobre la cobertura se ignora (FR-058).

## Esquemas de salida

| Tarea            | Contenido de la salida                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `interpretation` | Unidad, duración y requisitos con tipo, jerarquía, texto, sección, página y cita                         |
| `outline`        | Entradas con título y los requisitos en los que se apoya cada una, o la marca de sin respaldo            |
| `topic`          | Bloques `requirement` y `development`, cada uno con los requisitos que cita o desarrolla                 |

Tras validar el esquema, el dominio comprueba lo que el esquema no puede: que cada página
existe, que cada cita aparece en el texto de su página y que cada requisito referido existe
en el inventario. Lo que no lo cumple se rechaza o se muestra como sin respaldo, nunca se
acepta en silencio (SC-004).

## Presupuesto

1. Antes de enviar, se reserva el coste máximo de la operación en una transacción atómica,
   que comprueba el máximo por operación y lo disponible del límite acumulado del proyecto.
2. Si no cabe, la operación no se envía y la generación queda `incomplete`.
3. Se anota el envío antes de llamar al proveedor. Con el consumo confirmado, la reserva se
   liquida con el coste real. Solo se libera si consta que la operación no se envió.
   Si se envió y el consumo no puede confirmarse, o el proceso cae, la reserva queda
   `uncertain` y sigue contando por su importe máximo hasta que un administrador la concilie.
4. Una generación del temario procesa los temas uno a uno; los terminados quedan como
   borradores aunque los siguientes no se generen (FR-021).
5. Reanudar es una operación explícita que solo procesa los temas `pending` o `failed`
   (FR-066). Un tema es `failed` si su operación terminó con error o su propuesta no superó
   el esquema y las comprobaciones del dominio; el resultado inválido no se guarda ni
   sustituye un borrador válido. Un tema cuya operación quedó `uncertain` es `failed`, y esa
   operación no se reenvía: se concilia.
6. Modificar el límite solo cambia el límite (FR-066).

Los precios por modelo y el máximo por operación son configuración.

**Implementación (fase 5)**. El máximo por operación es
`AULANORMA_GENERATION_MAX_OPERATION_COST`, en millonésimas de la moneda. Un adaptador declara
dos importes por operación: `estimateCost`, la estimación orientativa que se muestra, y
`maxCost`, lo que se reserva. Su respuesta lleva `cost`, el consumo confirmado, o `null` si no
lo confirma; sin él, con el tiempo agotado (120 s por defecto) o con un fallo, la reserva
queda `uncertain`. Una operación sin reserva posible devuelve `budget_exceeded` sin llamar al
adaptador. Al arrancar, lo que constaba como enviado y sin liquidar pasa a `uncertain`, y lo
reservado sin enviar se libera. El presupuesto nace con límite cero y moneda `XXX`, sin
fijar; una operación de coste cero cabe en un saldo cero, pero no en uno negativo. Las
páginas de consulta, de modificación del límite y de conciliación son de la historia 3: hoy
el límite solo se cambia por la interfaz del módulo, que usan las pruebas.

## Adaptadores

- **Determinista**: respuestas fijas y grabadas; es el único que usan las pruebas y la
  integración continua, que no acceden a la red.
- **Real**: todavía no existe. El proveedor no está seleccionado; no se instala ningún SDK
  ni se hacen llamadas de pago hasta que el mantenedor lo concrete. Su clave se leerá de la
  configuración y nunca se registrará.

El adaptador determinista acredita este contrato, los bloqueos y el presupuesto. No acredita
la calidad de la generación ni el coste real, y no sirve para declarar la aceptación del
recorrido (SC-024).

## Pruebas de contrato previstas

- Las mismas pruebas para todos los adaptadores, con el real ejecutado solo a mano.
- Salida inválida: rechazada, registrada y no guardada (SC-005).
- Límite alcanzado a mitad del temario, reanudación y reducción del límite con operaciones
  en curso (SC-032, SC-037).
- Dos operaciones simultáneas sobre el mismo saldo: solo una reserva. Respuesta sin datos de
  uso, tiempo agotado y caída entre el envío y la liquidación: la reserva queda incierta y
  sigue contando. Hechas en `tests/unit/platform/budget.test.ts` y
  `budget-lifecycle.test.ts`, con proveedores y consumos simulados.
- Texto del documento con instrucciones incrustadas: no cambia el comportamiento.
