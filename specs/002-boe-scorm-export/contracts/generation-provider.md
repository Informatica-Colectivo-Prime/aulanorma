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
| `provider_error`        | Fallo del proveedor o de la red, tras los reintentos acotados            |
| `usage`                 | Proveedor, modelo, tokens de entrada y de salida, y latencia; siempre    |

## Reglas

- El adaptador no decide nada del dominio: no calcula la cobertura, no aprueba y no escribe
  en el almacenamiento.
- Una salida inválida nunca se repara: se rechaza, se registra y, como mucho, se reintenta un
  número acotado de veces (FR-019).
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
   (FR-066).
6. Modificar el límite solo cambia el límite (FR-066).

Los precios por modelo y el máximo por operación son configuración.

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
  sigue contando.
- Texto del documento con instrucciones incrustadas: no cambia el comportamiento.
