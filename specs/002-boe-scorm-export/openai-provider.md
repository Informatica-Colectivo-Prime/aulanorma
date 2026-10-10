# Proveedor real de generación: OpenAI

**Fecha**: 2026-10-09 | **Tareas**: T075 y T076 | **Contrato**:
[contracts/generation-provider.md](./contracts/generation-provider.md) | **Decisión**:
[research.md](./research.md) (R6)

Qué se ha decidido, cómo funciona el adaptador, cuánto cuesta y qué falta por comprobar.

## Estado

- **Hecho**: el adaptador, su configuración y sus pruebas con respuestas simuladas.
- **No hecho**: ninguna llamada al proveedor. No se ha hecho ninguna llamada de pago ni
  ningún despliegue. Nada de lo que sigue está contrastado con una respuesta real.
- **Sin aprobar**: el presupuesto. Los importes de este documento son una propuesta.
- El adaptador determinista se conserva y sigue siendo el de las pruebas, el de la
  integración continua y el que se usa si la configuración no dice otra cosa.

## Datos confirmados por el mantenedor (2026-10-09)

| Dato                 | Valor                                                           |
| -------------------- | --------------------------------------------------------------- |
| Proveedor            | OpenAI                                                          |
| API                  | Responses API, con el SDK oficial (`openai` 7.30.0)             |
| Modelo candidato     | `gpt-6.1-sol`                                                   |
| Procesamiento        | Estándar (`service_tier: "default"`)                            |
| Razonamiento         | `medium`                                                        |
| Moneda               | USD, la de los precios del proveedor                            |
| Moodle de pruebas    | 5.0.2 ([moodle-5.0.2-check.md](./moodle-5.0.2-check.md))        |
| Despliegue           | VPS de pruebas con Easypanel                                    |

El modelo es **candidato**: la calidad de su generación no está evaluada (T077).

## Qué hace el adaptador

`src/platform/generation/adapters/openai.ts`. Es el único fichero de `src/` que importa el
SDK y el único que hace llamadas externas; una regla de ESLint y una prueba de arquitectura
lo imponen. El dominio sigue sin conocer al proveedor.

- **Una petición de generación por operación**, precedida de un recuento de su entrada que
  no genera nada; si ese recuento se factura está por confirmar. Los reintentos automáticos del SDK están desactivados
  (`maxRetries: 0`, en el cliente y en cada petición). Otro intento lo pide una persona, con
  su propia reserva (FR-019).
- **Instrucciones y datos separados.** El prompt versionado va en `instructions`; la entrada
  de la tarea, en `input`, como un único texto JSON (FR-004).
- **Salida estructurada estricta.** Se pide con `text.format` de tipo `json_schema` y
  `strict: true`, con un esquema derivado del esquema Zod de la tarea.
- **Sin caché de prompts** (`prompt_cache_options.mode: "explicit"`, sin puntos de caché) y
  **sin guardar la respuesta** en el proveedor (`store: false`).
- **Nada del entorno.** La clave, la dirección de la API y el resto llegan de la
  configuración validada; el SDK no lee variables de entorno. Sus registros están apagados.
- **La clave** viaja solo en la cabecera de autorización. No se registra, no aparece en
  ninguna respuesta del adaptador y ningún error del SDK sale de él.

### Salida estructurada y validación propia

El modo estricto admite un subconjunto de JSON Schema. `strictJsonSchema` convierte cada
esquema del producto así:

| En el esquema del producto                 | En el esquema que se pide                              |
| ------------------------------------------ | ------------------------------------------------------ |
| Objetos                                    | Cerrados, con todos sus campos obligatorios            |
| Campo opcional (`coverageComplete`)        | No se pide                                             |
| Unión discriminada                         | `anyOf`                                                |
| Literal                                    | `enum` de un valor                                     |
| Enumeraciones, patrones, mínimos y máximos | Se conservan                                           |
| Longitud de los textos, recortes y filtros | No tienen equivalente: no se piden                     |
| Algo que no se sabe expresar               | Error: la operación no se reserva ni se envía          |

El esquema que se pide es, por tanto, **más laxo** que el del producto en las longitudes y
los caracteres de control. No sustituye nada:

1. `Generation` valida la salida con el esquema Zod del producto. Una salida que no lo cumple
   se rechaza y se registra; nunca se repara (SC-005).
2. El dominio comprueba lo que el esquema no puede: páginas, citas literales en el texto de
   su página y requisitos referidos (SC-004).
3. Nada se da por bueno sin las aprobaciones humanas de la interpretación, el índice, cada
   tema y la versión.

Una negativa del modelo, una respuesta incompleta o un texto que no es JSON no son salidas:
las dos primeras se registran como error del proveedor y la tercera como salida inválida.

## Precios vigentes

Consultados el **2026-10-09** en la
[tabla de precios de OpenAI](https://developers.openai.com/api/docs/pricing) y en la
[ficha del modelo](https://developers.openai.com/api/docs/models/gpt-6.1-sol). USD por millón
de tokens, `gpt-6.1-sol`, procesamiento estándar:

| Concepto                 | Hasta 272 000 tokens de entrada | Más de 272 000 |
| ------------------------ | ------------------------------- | -------------- |
| Entrada                  | 2,00                            | 4,00           |
| Entrada leída de caché   | 0,10                            | 0,20           |
| Escritura en caché       | 2,50                            | 5,00           |
| Salida                   | 10,00                           | 15,00          |

- Los **tokens de razonamiento se facturan como salida**
  ([guía de razonamiento](https://developers.openai.com/api/docs/guides/reasoning)). El
  consumo que devuelve la API los incluye en `output_tokens` y los desglosa en
  `output_tokens_details.reasoning_tokens`.
- `max_output_tokens` limita **juntos** el razonamiento y la salida visible. Una respuesta
  que agota el límite en el razonamiento llega incompleta, sin salida, y se factura.
- Por encima de 272 000 tokens de entrada, la tarifa de contexto largo se aplica a **toda**
  la petición.
- Cada token de entrada se factura con una sola de las tres tarifas de entrada
  ([guía de caché](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Otros procesamientos tienen otros precios (Batch y Flex, la mitad; Fast, el doble;
  Ultrafast, seis veces). El adaptador no los usa.
- El procesamiento regional (residencia de datos) añade un 10 %. El adaptador usa la
  dirección global y **no lo contempla**: si se activa en el proyecto de OpenAI, los precios
  configurados dejan de ser correctos.

Los precios son configuración del servidor, no código: si cambian, se cambian las cuatro
claves `AULANORMA_OPENAI_PRICE_*` y se reinicia. El umbral y los multiplicadores del
contexto largo sí están en el código del adaptador.

## Reservas y consumo

Los importes son enteros, en millonésimas de USD, redondeados hacia arriba.

**Consumo confirmado** de una respuesta:

```text
entrada  = (input_tokens − cached_tokens − cache_write_tokens) × precio de entrada
         + cached_tokens × precio de caché
         + cache_write_tokens × precio de escritura en caché
salida   = output_tokens × precio de salida        (incluye el razonamiento)
coste    = entrada + salida                         (hasta 272 000 tokens de entrada)
coste    = entrada × 2 + salida × 1,5               (por encima)
```

El consumo **solo se confirma** si la respuesta trae todos los datos de uso, son coherentes
y se sirvió con el modelo configurado y con el procesamiento `default`. En cualquier otro
caso no hay importe: la reserva queda incierta, sigue contando por su máximo y un
administrador la concilia con la factura del proveedor. Eso incluye una respuesta con salida
válida servida con otro procesamiento: la salida se entrega y la reserva queda incierta.

**Reserva** (coste máximo), antes de enviar:

```text
entrada máxima = octetos de las instrucciones, de los datos y del esquema + 512
salida máxima  = límite de salida de la tarea + reserva de razonamiento
reserva        = entrada máxima × la tarifa de entrada más cara + salida máxima × precio de salida
```

- Si la cota supera 272 000, la reserva usa la tarifa de contexto largo.
- La reserva de razonamiento se suma al límite de salida de cada tarea (16 000 tokens en la
  interpretación y 8000 en el índice y en cada tema) porque el límite del proveedor cuenta
  las dos cosas. OpenAI recomienda reservar al menos 25 000 tokens entre razonamiento y
  salida al empezar.

### La entrada reservada: respaldo y límites

La reserva debe cubrir el coste real, o el límite del presupuesto deja de ser un límite. La
salida está acotada por el propio proveedor: `max_output_tokens` limita todo lo que genera,
razonamiento incluido. La entrada no tiene un parámetro equivalente, así que la cifra
reservada hay que sostenerla de otra forma.

**Qué respalda la cifra de octetos**: un texto no tiene más tokens que octetos, porque cada
token de texto representa al menos un octeto. Eso vale para las instrucciones y para los
datos.

**Qué no respalda**:

- Los tokens de formato que el proveedor añade para representar la petición (papeles y
  límites de los mensajes). Su guía de recuento dice que se incluyen en la entrada, sin dar
  su número. Los 512 tokens de margen son una cifra elegida, no documentada.
- El esquema de la salida estructurada. El proveedor lo convierte a una representación
  propia; su guía advierte de que las herramientas y los esquemas «añaden tokens difíciles
  de contar en local». Contar los octetos del esquema JSON no acota esa representación.
- Cualquier contenido que el proveedor añada por su cuenta, y el tokenizador concreto de
  `gpt-6.1-sol`, que no se ha contrastado.

Por eso la cifra de octetos **no se usa como garantía**. Se usa como el importe que se
reserva, y antes de enviar se contrasta con el proveedor:

1. Tras reservar, el adaptador pide al proveedor el
   [recuento de tokens de entrada](https://developers.openai.com/api/docs/guides/token-counting)
   de la misma petición (`POST /v1/responses/input_tokens`, con el mismo modelo, las mismas
   instrucciones, los mismos datos, el mismo esquema y el mismo razonamiento). La guía dice
   que devuelve «el recuento exacto que recibirá el modelo». No genera nada.
2. Si el recuento **cabe** en la entrada reservada, la operación se envía.
3. Si **no cabe**, o el recuento falla, tarda demasiado o no es un entero, la operación **no
   se envía**. Consta que la generación no se envió, así que su reserva se libera, y queda
   registrada como error del proveedor. El recuento tampoco se reintenta. Que el recuento
   en sí no se facture está por confirmar.
4. Si, aun así, una respuesta trae un consumo mayor que lo reservado, se liquida por lo que
   fue y queda en la auditoría (`budget.reservation_exceeded`), con lo reservado y lo
   liquidado.

**Límites que quedan**:

- La garantía descansa en que el recuento del proveedor coincide con lo que después
  factura. La documentación lo llama exacto, pero no afirma expresamente esa igualdad, ni
  que cuente el esquema: se comprueba con la primera operación real, comparando el recuento,
  `usage.input_tokens` y la factura. El punto 4 deja rastro si no coincide; no evita ese
  gasto.
- La documentación consultada **no dice si el recuento se factura** ni qué límite de
  frecuencia tiene. No genera salida, pero es una llamada externa más por operación. Debe
  confirmarse antes de activar el proveedor.
- Si el margen de 512 tokens resulta corto para el formato y el esquema, las operaciones
  con poca entrada se rechazarán sin enviarse. Falla cerrado: la generación no se envía. Si el
  recuento rechazado tiene coste está por confirmar, y habrá que ajustar el margen.
- El recuento es anterior al envío: no sirve para la estimación ni para el máximo que se
  muestran antes de confirmar, que siguen calculándose en local.

**Estimación** (orientativa, la que se muestra): un token por cada cuatro octetos de entrada
y la mitad de la salida máxima. No está contrastada y no interviene en ningún límite: lo que
se compara con el presupuesto y con el máximo por operación es siempre la reserva.

### Ejemplo, con los valores propuestos

Tema del temario: unos 6000 octetos de instrucciones, datos y esquema; límite de la tarea,
8000 tokens; reserva de razonamiento, 16 000.

| Importe    | Cálculo                                                    | USD      |
| ---------- | ---------------------------------------------------------- | -------- |
| Reserva    | 6512 × 2,50 + 24 000 × 10,00, por millón                   | 0,256280 |
| Estimación | 1628 × 2,00 + 12 000 × 10,00, por millón                   | 0,123256 |

Son cifras de ejemplo, no medidas.

## Presupuesto propuesto, sin aprobar

| Límite                 | Propuesta | Dónde se fija                                                        |
| ---------------------- | --------- | -------------------------------------------------------------------- |
| Acumulado del proyecto | 25 USD    | En `/budget`, con el perfil `admin`. Nace a cero                     |
| Por operación          | 2 USD     | `AULANORMA_GENERATION_MAX_OPERATION_COST=2000000`                    |

**Ninguno de los dos está aprobado ni aplicado.** El límite acumulado sigue a cero, así que
no puede enviarse ninguna operación de pago aunque el proveedor esté activado, y el valor de
ejemplo del máximo por operación no se ha cambiado.

Con 2 USD por operación y la reserva de razonamiento propuesta, la operación más grande que
cabe es de unos 300 000 octetos de entrada con el límite de la interpretación, ya con la
tarifa de contexto largo. Las reservas
son máximos: con la propuesta, unas 97 reservas como la del ejemplo agotarían los 25 USD si
todas quedaran inciertas.

### La moneda del presupuesto

El presupuesto nace con la moneda sin fijar (`XXX`). Al arrancar con el proveedor `openai`,
se fija en USD y queda en el registro de auditoría (`budget.currency`). Solo se fija **con el
límite a cero y sin ningún importe anotado**: a un límite puesto sin moneda no se le asigna
una después. Si no puede fijarse, las rutas de producto no atienden. Para salir de ahí:
volver al adaptador determinista, poner el límite a cero en `/budget` y activar de nuevo el
proveedor.

## Configuración

Todas en el servidor. Sin `AULANORMA_GENERATION_PROVIDER`, o con `deterministic`, no hace
falta ninguna de las demás.

| Clave                                      | Valor propuesto | Notas                                           |
| ------------------------------------------ | --------------- | ----------------------------------------------- |
| `AULANORMA_GENERATION_PROVIDER`            | `openai`        | `deterministic` u `openai`                      |
| `AULANORMA_OPENAI_API_KEY`                 | —               | **Secreto**. Ver más abajo                      |
| `AULANORMA_OPENAI_MODEL`                   | `gpt-6.1-sol`   |                                                 |
| `AULANORMA_OPENAI_REASONING_EFFORT`        | `medium`        | `low`, `medium`, `high`, `xhigh` o `max`        |
| `AULANORMA_OPENAI_REASONING_TOKEN_RESERVE` | `16000`         | De 0 a 100 000. Por validar                     |
| `AULANORMA_OPENAI_TIMEOUT_SECONDS`         | `300`           | De 30 a 900. Por validar                        |
| `AULANORMA_OPENAI_PRICE_INPUT`             | `2000000`       | Millonésimas de USD por millón de tokens        |
| `AULANORMA_OPENAI_PRICE_CACHED_INPUT`      | `100000`        |                                                 |
| `AULANORMA_OPENAI_PRICE_CACHE_WRITE`       | `2500000`       |                                                 |
| `AULANORMA_OPENAI_PRICE_OUTPUT`            | `10000000`      |                                                 |

Con `openai`, todas son obligatorias: si falta una o no es válida, el servicio no arranca.
No hay valores por defecto ni se cae al adaptador determinista.

### La clave, como secreto del servidor

La clave **no se escribe en el chat, en un issue, en un commit ni en ningún fichero del
repositorio**. La introduce en el servidor quien administra el despliegue:

1. Crear en OpenAI una clave **de proyecto**, solo para este piloto, con los permisos
   mínimos que admita (el adaptador solo usa la Responses API) y, en el proyecto, un límite de gasto mensual
   igual o inferior al presupuesto que se apruebe. Ese límite es una segunda barrera, ajena
   a la aplicación.
2. En Easypanel, abrir el servicio de la aplicación y, en su apartado de variables de
   entorno, añadir `AULANORMA_OPENAI_API_KEY` con el valor, junto con el resto de las claves
   de la tabla. Guardar y volver a desplegar el servicio para que arranque con ellas.
3. No añadirla a ningún `Dockerfile`, argumento de construcción ni fichero `.env` del
   repositorio: es una variable del entorno de ejecución, no de la imagen.
4. Comprobar el arranque en los registros del servicio: `startup.completed`. Si la
   configuración no es válida, el registro nombra la clave que falla, nunca su valor.

En un despliegue sin Easypanel, la clave va en el fichero de entorno del servicio, legible
solo por su cuenta ([deployment.md](../../docs/engineering/deployment.md)).

Si la clave se expone, se revoca en OpenAI de inmediato y se sigue
[SECURITY.md](../../SECURITY.md).

Los pasos de Easypanel **no se han ejecutado**: describen dónde va el secreto, no un
despliegue probado.

## Tiempos de espera y progreso

- **Tiempo máximo por operación**: `AULANORMA_OPENAI_TIMEOUT_SECONDS`. Al agotarse, se
  cierra la petición, no se reenvía y la reserva queda incierta por su máximo: no puede
  saberse si el proveedor llegó a procesarla. El valor propuesto, 300 s, **no está medido**.
- **Interpretación e índice**: una operación cada una, dentro de la petición del navegador.
  La página de confirmación avisa de que la respuesta puede tardar varios minutos y de que no
  debe repetirse la petición.
- **Temario**: los temas se generan uno a uno. Si la generación no termina en tres segundos,
  la respuesta no la espera: sigue en el servidor, y la página del temario muestra que está
  en curso, desde cuándo y cuántos temas han terminado, con un enlace para actualizar el
  estado. No se actualiza sola. Cerrar la página no la interrumpe ni la repite.
- **Una generación a la vez por temario**: mientras hay una en curso, otra se rechaza. Sin
  eso, dos peticiones enviarían y pagarían los mismos temas dos veces.
- **Pérdida de vigencia**: antes de cada tema, y al recibir cada respuesta, se comprueba que
  la aprobación del índice con la que se pidió la generación sigue vigente, lo que incluye
  la validación de la interpretación. Si no lo está, el resultado recibido se descarta, los
  temas restantes no se envían y la ejecución queda incompleta. La operación ya enviada se
  paga y su consumo se liquida. La misma comprobación se repite después del recuento previo
  del proveedor y justo antes de anotar el envío: si la vigencia se perdió durante esa
  espera, la generación no se envía y su reserva se libera. La hace `Generation` con una
  condición que le pasa el dominio; el adaptador no interviene.
- **Caída del proceso**: al arrancar, los temas terminados se conservan, lo enviado sin
  liquidar queda incierto y una ejecución que constaba en curso pasa a incompleta. Nada se
  reenvía al arrancar. La operación interrumpida no tiene tema anotado, así que el temario
  no admite otra generación hasta que un administrador la concilie: reanudar antes podría
  enviar y pagar dos veces el mismo tema.
- **Proxy**: su tiempo de espera de respuesta debe superar el tiempo máximo por operación,
  por la interpretación y el índice.

Sigue sin haber una infraestructura de trabajos en segundo plano: la generación del temario
vive en el proceso de la aplicación y no sobrevive a un reinicio.

## Qué acreditan las pruebas

`tests/unit/platform/openai-adapter.test.ts`, `config-generation.test.ts`,
`budget-currency.test.ts`, las de contrato y las de arquitectura. El SDK real se ejecuta con
un transporte simulado, sin red.

**Acreditan**: lo que el adaptador envía; que el recuento previo decide el envío y que su
fallo lo impide; que no reintenta ante 408, 409, 429, 5xx, un fallo
de conexión o un tiempo agotado; el cálculo del coste con los precios de la tabla, incluido
el razonamiento; cuándo un consumo no se confirma; que los tres esquemas del producto se
expresan en el modo estricto; el contrato común a todo adaptador; y que la clave no sale del
adaptador.

**No acreditan**: que el proveedor acepte la petición tal como se envía, incluido el esquema;
la forma real de sus respuestas; el consumo, el coste ni los tiempos reales; ni la calidad de
la generación. Las respuestas simuladas se han escrito a partir de la documentación, no se
han grabado del proveedor.

## Pendiente, con llamadas de pago

En este orden, y solo con el presupuesto aprobado:

1. Aprobar el presupuesto y fijarlo: el límite en `/budget` y el máximo por operación en la
   configuración.
2. Introducir la clave como secreto y activar el proveedor.
3. Confirmar que el recuento de tokens de entrada no se factura. Después, una primera
   operación pequeña: comparar el recuento previo, `usage.input_tokens`, el consumo que
   anota la aplicación y la factura de OpenAI, y los tokens reales con la cifra de octetos.
4. Ejecutar a mano las pruebas de contrato contra el proveedor real (T076).
5. Medir los tiempos y ajustar el tiempo máximo y la reserva de razonamiento.
6. Generar la interpretación, el índice y el temario de UF0517 y registrar el coste y la
   calidad observados, sin darla por aceptada (T077).

## Puntos abiertos

- **Errores sin consumo.** Una petición que el proveedor rechaza sin procesarla (clave no
  válida, petición mal formada, límite de frecuencia) deja la reserva incierta, igual que un
  fallo de red: el adaptador no deduce de un código de error que no hubo coste. Es prudente y
  obliga a conciliar a mano, con importe cero, cada rechazo.
- **Tokens de razonamiento.** Se facturan y se cuentan en la salida, pero el registro de
  cada llamada no los guarda por separado.
- **Estimación.** La proporción de cuatro octetos por token y la mitad de la salida son un
  punto de partida.
- **Versión del SDK.** `openai` 7.30.0, del 2026-10-06. Publica versiones casi a diario: las
  propondrá Dependabot y pasarán por el control de dependencias.
