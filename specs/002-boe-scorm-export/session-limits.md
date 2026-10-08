# Límites de tiempo de la sesión (WCAG 2.2.1)

Fecha: 2026-10-08. Requisitos FR-071 a FR-073; criterios SC-047 y SC-048.

## Estado

**WCAG 2.2.1 no se declara cumplido.** Los tres límites de tiempo tienen ya una salida
implementada y probada en automático y en un ensayo con navegador, pero faltan las
evidencias manuales con teclado, lector de pantalla y ampliación, y quedan puntos abiertos
que se enumeran al final. Sustituir la sesión no acredita por sí solo el criterio.

| Límite                             | Valor por defecto | Qué puede hacer el usuario                         | Estado                         |
| ---------------------------------- | ----------------- | -------------------------------------------------- | ------------------------------ |
| Inactividad                        | 30 minutos        | Ampliarla desde un aviso, dos minutos antes        | Implementado y ensayado        |
| Duración máxima desde la entrada   | 12 horas          | Renovar la autenticación en la página, cinco minutos antes | Implementado y ensayado |
| Formulario de entrada              | 15 minutos        | Nada: al enviarlo se pide un testigo vigente       | Implementado; sin aviso propio |

## Procedencia de los ensayos

Todo lo que este documento llama ensayo se hizo en el equipo de desarrollo, con Chrome 154
sin interfaz manejado por el protocolo de depuración, contra el proceso local de la
aplicación (`npm run dev` en `127.0.0.1:3000`), con datos de ensayo y cuentas desechables.
**No se ha ejecutado ni modificado nada en ningún servidor remoto**: el piloto no está
desplegado.

Los tiempos se redujeron para no esperar: un minuto de inactividad, por configuración, y el
final de la sesión acercado a unos 50 segundos escribiendo directamente en la base de datos
del ensayo. Con un minuto de inactividad los avisos aparecen 30 segundos antes, no dos ni
cinco minutos.

## Inactividad: aviso y ampliación (FR-071)

- Dos minutos antes de caducar, o a la mitad del periodo si es más corto, cada página con
  sesión muestra un aviso al principio del documento, le lleva el foco y dice cuánto queda y
  qué se pierde. Su botón, «Continuar la sesión», amplía la sesión.
- La cuenta atrás se ve cada segundo. A la tecnología de apoyo solo se le anuncia al
  aparecer, al minuto, a los treinta segundos y a los diez.
- Al ampliar, el aviso se oculta, se anuncia «Sesión ampliada» y el foco vuelve a donde
  estaba, con lo escrito intacto.
- Si nadie hace nada, la página dice que la sesión ha terminado y que lo no enviado no se ha
  guardado, y ofrece volver a entrar. No recarga ni redirige, para que pueda copiarse lo
  escrito.

**Decide el servidor.** `POST /api/session/extend` exige origen propio, sesión vigente y su
testigo; responde 204 y se registra. No revive una sesión caducada, revocada, cerrada o de
una cuenta desactivada, y no retrasa la duración máxima. El número de ampliaciones no está
limitado: con los valores por defecto caben 23 seguidas antes de la duración máxima, y
entonces se renueva.

## Duración máxima: renovación en la propia página (FR-072 y FR-073)

Se mantienen las 12 horas por sesión. No se prolonga ninguna: **se sustituye**.

### Qué hace

- Cinco minutos antes del final, el aviso pide la contraseña y ofrece «Renovar la sesión».
  El foco va al aviso, no al campo: lo que se estuviera tecleando no acaba en la contraseña.
  Con Tabulador se llega al campo.
- El campo es un campo de contraseña corriente: admite pegar y lo rellenan los gestores de
  contraseñas, que encuentran además el nombre de la cuenta.
- Si el servidor acepta, el testigo nuevo se pone en todos los formularios de la página, el
  aviso se oculta, se anuncia «Sesión renovada» y el foco vuelve a donde estaba. La página no
  se recarga y lo escrito sigue ahí. La contraseña no queda en la página.
- Si la rechaza, lo dice en una alerta asociada al campo, que queda vacío y con el foco:
  contraseña incorrecta, demasiados intentos o error interno, cada uno con su texto.

### Qué hace el servidor

`POST /api/session/renew` es una acción protegida como las demás.

1. La guarda exige origen propio, una sesión vigente y su testigo. Sin eso no se llega a
   comprobar la contraseña ni cuenta un intento.
2. La identidad aplica **el mismo control de intentos que la entrada, con el mismo sujeto**:
   los fallos de entrar y de renovar se suman, y el bloqueo vale para las dos.
3. Comprueba la contraseña con el mismo coste que la entrada.
4. Esa comprobación tarda. Al terminar, **dentro de una transacción**, vuelve a leer la
   sesión y la cuenta: la sesión debe seguir vigente, la cuenta activa y su contraseña ser la
   misma que se comprobó. Si algo ha cambiado, no renueva.
5. En esa misma transacción crea la sesión nueva, con otro identificador, otro testigo y sus
   propias 12 horas, revoca la anterior anotando cuál la sustituye, y registra el resultado.
   O todo, o nada.

Responde 200 con el testigo y los plazos nuevos y la cookie de la sesión nueva; 422, 429 o
401 con el motivo y sin cookies; 500 sin cuerpo si falla, con la sesión como estaba.

### Por qué no debilita la revocación

- Renovar exige una sesión que el servidor aún reconoce **y** la contraseña vigente. Quien
  tenga solo una cookie robada no gana nada frente a hoy.
- Revocar las sesiones, cerrar la sesión, desactivar la cuenta y cambiar sus permisos o su
  contraseña siguen cerrándolas todas, también una renovada. Si ocurre mientras se comprueba
  la contraseña, la renovación no se hace.
- Los permisos no viajan en la sesión: se leen de la cuenta en cada petición.
- La sesión anterior no vuelve a servir: ni para páginas, ni para ampliar, ni para renovar.
- Cada renovación y cada rechazo quedan en la auditoría, sin contraseñas, identificadores de
  sesión ni testigos.

### Varias pestañas

- **Qué viaja entre pestañas**: por el almacenamiento local, solo dos cosas: cuándo caduca
  la inactividad y el instante de la última renovación. **Nunca** contraseñas, cookies ni
  testigos.
- **Cómo consigue cada pestaña su testigo**: la que renueva lo recibe en la respuesta. Las
  demás, al ver el instante de la renovación, piden una página propia
  (`/account/password`) con la cookie nueva, que el navegador ya comparte, y leen de ella su
  testigo y sus plazos. No piden la contraseña.
- **Un formulario enviado antes de enterarse**: al enviar, si el testigo de la pestaña es
  anterior a la última renovación, el envío espera, pide el testigo y sale con él y con el
  mismo botón que se pulsó.
- **Dos renovaciones a la vez**: solo una sustituye la sesión. La otra recibe un rechazo,
  comprueba que la sesión sigue viva, toma el testigo vigente y continúa. No crea otra
  sesión ni da nada por terminado.

### Peticiones todavía en curso

Entre que el servidor sustituye la sesión y el navegador recibe la cookie nueva, puede salir
una petición con la sesión anterior; o con la cookie nueva y un testigo anterior.

- **No se ejecutan.** Se registran como denegadas.
- **No borran la cookie**, que ya es la de la sesión nueva. Antes se borraba al llegar una
  sesión no vigente: tras una renovación habría cerrado la sesión recién creada.
- **Lo enviado no se pierde**: la respuesta es una página con todo lo enviado, escapado, en
  un formulario sin testigo. «Enviar de nuevo» lo completa con el de la sesión vigente y lo
  envía. A quien solo tenga la cookie anterior no le da nada: sin la sesión nueva no hay
  testigo que poner.
- Una subida de PDF en ese caso responde con un error y el fichero sigue elegido para
  repetirla.

## Actividad

Cuenta como actividad una petición con una sesión vigente que **no** se rechaza por su
origen ni por su testigo. Antes, una acción rechazada por su testigo retrasaba la caducidad;
ya no. Una ampliación o una renovación rechazadas tampoco se anuncian a otras pestañas. La
lectura del testigo tras una renovación sí es una petición aceptada: ocurre una vez por
pestaña y por renovación, y la renovación ya es actividad expresa, con contraseña.

## Formulario de entrada: 15 minutos

El formulario de entrada lleva un testigo ligado a una sesión previa que dura 15 minutos.
Pasado ese tiempo, enviarlo obligaba a escribir de nuevo usuario y contraseña.

- **Con JavaScript**: si el formulario lleva más de cinco minutos abierto, al enviarlo pide
  antes un testigo vigente y sale con él. Lo escrito se conserva y el límite deja de notarse.
  No hay consultas mientras está abierto: una, al enviar.
- **Sin JavaScript**: el servidor lo rechaza y vuelve a mostrar el formulario con el aviso
  de que había caducado. Hay que escribir de nuevo las credenciales.

No tiene aviso propio porque no hace falta ampliar nada: no hay límite que el usuario note.
Queda como punto abierto el caso sin JavaScript.

## Qué depende de JavaScript

| Función                                               | Sin JavaScript                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Aviso de inactividad y ampliación                     | No hay aviso. La sesión caduca y la siguiente petición lleva a la entrada |
| Aviso de duración máxima y renovación                 | No hay aviso ni renovación. La sesión termina y hay que entrar de nuevo   |
| Testigo nuevo en los formularios y en otras pestañas  | No aplica: sin renovación no hay testigo nuevo                            |
| «Enviar de nuevo» tras una petición en curso          | El formulario devuelto no tiene testigo y no puede enviarse               |
| Formulario de entrada caducado                        | Se rechaza y hay que escribir de nuevo las credenciales                   |

El resto de la aplicación funciona sin JavaScript, salvo la subida de un PDF. Con él
desactivado, los límites de tiempo no tienen aviso ni salida: es un punto abierto.

## Cómo se ha probado

| Qué                                                                                   | Dónde                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Reglas de la sesión: plazos, ampliación, renovación, intentos compartidos con la entrada, caducidad y revocación durante la comprobación, cuenta desactivada, permisos y contraseña cambiados, dos renovaciones a la vez, fallo al guardar, testigo anterior, registro sin secretos | `tests/unit/platform/identity.test.ts` |
| Las acciones por su ruta: respuestas, cookies, origen, testigo, sesión anterior que no revive, peticiones devueltas para repetir, fallo interno, actividad | `tests/contract/session.contract.test.ts` |
| El script real sobre el marcado real, en un DOM simulado: avisos, foco, anuncios, peticiones enviadas, testigo nuevo, rechazos, varias pestañas, envíos que esperan, envío devuelto, formulario de entrada | `tests/contract/session-warning.contract.test.ts` |
| En Chrome sin interfaz, contra el proceso local                                       | Ensayos de más abajo                                     |

Casos que pidió el mantenedor, y dónde están:

| Caso                                   | Identidad | Ruta | Script | Ensayo |
| -------------------------------------- | --------- | ---- | ------ | ------ |
| Contraseña incorrecta                  | Sí        | Sí   | Sí     | Sí     |
| Bloqueo por intentos                   | Sí        | Sí   | Sí     | Sí     |
| Expiración durante la comprobación     | Sí        | —    | Sí     | —      |
| Revocación concurrente                 | Sí        | Sí   | Sí     | —      |
| Fallo interno                          | Sí        | Sí   | Sí     | —      |
| Testigos antiguos                      | Sí        | Sí   | Sí     | Sí     |
| Conservación del texto                 | —         | —    | Sí     | Sí     |
| Dos renovaciones simultáneas           | Sí        | Sí   | Sí     | Sí     |
| Peticiones en curso                    | —         | Sí   | Sí     | Sí     |

### Ensayo de la renovación (2026-10-08)

Dos pestañas con texto sin enviar, cuenta desechable.

| Paso                                                                    | Observado                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Esperar con el final de la sesión a 55 s                                 | El aviso de fin de sesión aparece a los 25 s en las dos pestañas, con el formulario de renovación y el foco en el aviso; ninguna petición previa |
| Tabulador                                                                | El foco pasa al campo de contraseña                                             |
| Contraseña equivocada e Intro                                            | 422; «La contraseña no es correcta», con el foco en el campo vacío; el testigo no cambia y la otra pestaña no hace nada |
| Contraseña correcta, insertada de una vez, e Intro                       | 200; cookie y testigo distintos; todos los formularios de la página con el testigo nuevo; el texto sigue ahí; el foco vuelve a su campo; se anuncia «Sesión renovada» |
| Almacenamiento local tras renovar                                        | Dos claves, con instantes; ni la contraseña, ni los testigos, ni las cookies    |
| La otra pestaña                                                          | Una petición a una página propia; mismo testigo que la primera; su texto sigue ahí; «La sesión se ha renovado en otra pestaña» |
| Pasado el final de la sesión anterior                                    | Las dos siguen vivas; la segunda amplía con su testigo nuevo (204)              |
| Envío con la cookie y el testigo anteriores                              | 409, sin `Set-Cookie`; devuelve lo enviado en un formulario sin testigo         |
| Página con la cookie anterior                                            | 409, sin `Set-Cookie`                                                           |
| En el navegador, formulario con el testigo anterior                      | 409 «Tu envío no se ha guardado todavía»; Intro sobre «Enviar de nuevo» pide el testigo y el servidor procesa el envío |
| Tres contraseñas equivocadas y después la correcta                       | 422, 422, 422 y 429 «Demasiados intentos seguidos»                              |
| Pasado el bloqueo, la correcta                                           | Renueva, y el texto sigue ahí                                                   |
| Renovar en las dos pestañas a la vez                                     | Una recibe 200 y la otra 401; la segunda comprueba, toma el testigo vigente y sigue; mismo testigo en las dos, cada una con su texto; una sola sesión activa |
| Auditoría del ensayo                                                     | 3 renovaciones correctas, 4 contraseñas incorrectas, 1 bloqueo, 1 rechazo por sesión terminada y 2 peticiones devueltas |
| Migración                                                                | `0010_session_renewal` se aplicó al arrancar sobre una base de datos anterior   |

La consola de la pestaña que perdió la renovación simultánea anota la respuesta 401 como
recurso fallido. No hubo ningún error de script.

### Ensayo de la inactividad (2026-10-08)

Hecho con la entrega anterior y repetido sobre el código de esta, con el mismo resultado.

| Paso                                                                    | Observado                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Esperar con el foco en un campo con texto sin enviar                     | El aviso aparece a los 29 s, con el foco en «Continuar la sesión» y sin ninguna petición previa |
| Tabulador y Mayús+Tabulador                                              | El foco sale del aviso y vuelve a su botón; no queda atrapado                   |
| Intro y Espacio sobre el botón                                           | Una petición, 204; el aviso se oculta, el foco vuelve al campo y el texto sigue ahí |
| Cargar una página en una segunda pestaña                                 | La primera avisa 31 s después de esa carga, no antes                            |
| Revocar las sesiones con `scripts/admin/users.mjs` y pulsar «Continuar» | La pestaña comprueba una vez si la sesión sigue viva y, como no, «Tu sesión ha terminado» en las dos |
| Entrar de nuevo y no hacer nada                                          | A los 59 s la página lo dice, sin peticiones; el servidor ya no reconoce la sesión |

## Puntos sin resolver

1. **Evidencia manual.** Nadie ha recorrido el aviso, la ampliación y la renovación con un
   lector de pantalla, solo con teclado en navegadores reales, ni con ampliación. Es la tarea
   T091, parte de T082, con el recorrido de
   [`accessibility-walkthrough.md`](./accessibility-walkthrough.md). Un navegador
   automatizado no dice cómo se anuncia nada.
2. **Sin JavaScript no hay aviso ni salida** para ninguno de los tres límites.
3. **Tras terminar la sesión, lo no enviado se pierde** al salir de la página. El aviso lo
   dice y deja copiarlo. Guardar borradores en el navegador se descartó.
4. **El aviso toma el foco.** Quien esté escribiendo lo pierde un momento. Falta comprobar
   con personas si resulta aceptable.
5. **Cinco minutos para renovar.** Es un margen fijo. Falta comprobar si basta a quien
   escribe despacio o usa un gestor de contraseñas con pasos adicionales.
6. **Menos de diez ampliaciones con ciertas configuraciones**, por ejemplo dos horas de
   inactividad y doce de máximo. Al llegar al máximo se puede renovar, pero la ampliación en
   sí no llega a diez.
7. **La renovación no reduce el coste de la contraseña**: tarda lo que una entrada. En el
   equipo de desarrollo, menos de dos décimas de segundo; en el destino está sin medir.
