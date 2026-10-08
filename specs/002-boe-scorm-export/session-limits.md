# Límites de tiempo de la sesión (WCAG 2.2.1)

Fecha: 2026-10-08. Rama `feat/002-closing-tasks`.

Una sesión tiene dos límites, y son distintos:

| Límite                         | Valor por defecto | Qué lo retrasa                                   | Estado frente a WCAG 2.2.1 |
| ------------------------------ | ----------------- | ------------------------------------------------ | -------------------------- |
| Inactividad                    | 30 minutos        | Cualquier petición con la sesión, o una ampliación | Aviso y ampliación, implementados |
| Duración máxima desde la entrada | 12 horas        | Nada                                             | **Sin resolver**           |

**WCAG 2.2.1 no se declara cumplido** mientras el segundo siga sin resolver.

## Inactividad: aviso y ampliación

### Qué hace

- Dos minutos antes de caducar, o a la mitad del periodo si es más corto, cada página con
  sesión muestra un aviso al principio del documento, le lleva el foco y dice cuánto queda y
  qué se pierde. Su único botón, «Continuar la sesión», amplía la sesión.
- La cuenta atrás se ve cada segundo. A la tecnología de apoyo solo se le anuncia al
  aparecer, al minuto, a los treinta segundos y a los diez.
- Al ampliar, el aviso se oculta, se anuncia «Sesión ampliada» y el foco vuelve a donde
  estaba, con lo escrito intacto.
- Si nadie hace nada, la página dice que la sesión ha terminado y que lo no enviado no se ha
  guardado, y ofrece volver a entrar. No recarga ni redirige por su cuenta, para que pueda
  copiarse lo que estuviera escrito.

### Quién decide

**El servidor.** La ampliación es la acción `POST /api/session/extend`, con las mismas
exigencias que cualquier otra: origen propio, sesión viva y su testigo. Anota la actividad en
ese instante, responde 204 y se registra en la auditoría. No revive una sesión caducada,
revocada, cerrada o de una cuenta desactivada, y no retrasa la duración máxima.

**El número de ampliaciones no está limitado.** Solo las acota la duración máxima: con los
valores por defecto caben 23 seguidas sin ninguna otra actividad. Con otros valores pueden
caber menos de diez: por ejemplo, con dos horas de inactividad y doce de duración máxima. Eso
es consecuencia del segundo límite, no del aviso.

### Qué no mantiene la sesión

- El script del aviso no consulta al servidor. Su única petición es la que envía el usuario
  al pulsar el botón. Una pestaña abierta, por sí sola, no hace nada y la sesión caduca.
- Las pestañas se avisan entre sí por el almacenamiento local del navegador, sin pasar por el
  servidor: la actividad o la ampliación en una retrasa el aviso en las demás, y salir en una
  lo da por terminado en todas. Lo que una pestaña cuente a otra solo mueve su aviso: la
  sesión vive o no según el servidor.
- Una petición rechazada por venir de otro origen se descarta antes de mirar la sesión y no
  cuenta como actividad.

### Cómo se ha probado

| Qué                                                                                   | Dónde                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Plazos, ampliación, más de diez ampliaciones, caducidad sin actividad, duración máxima, sesiones revocadas, cerradas o desactivadas | `tests/unit/platform/identity.test.ts` |
| La acción por su ruta: 204, registro, CSRF, origen, método, sin sesión, contraseña inicial pendiente, dos sesiones independientes, caducidad real adelantando el reloj | `tests/contract/session.contract.test.ts` |
| El script real sobre el marcado real, en un DOM simulado: aparición, foco, anuncios, petición enviada, ampliaciones repetidas, caducidad, red caída, varias pestañas y duración máxima | `tests/contract/session-warning.contract.test.ts` |
| En Chrome sin interfaz, contra el proceso local de la aplicación                     | Ensayo de más abajo                                      |

**Ensayo en navegador (2026-10-08).** Chrome 154 sin interfaz, manejado por el protocolo de
depuración, contra `npm run dev` en `127.0.0.1:3000` en el equipo de desarrollo, con un
minuto de inactividad para no esperar media hora y una cuenta desechable. No intervino ningún
servidor remoto.

| Paso                                                                    | Observado                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Esperar con el foco en un campo con texto sin enviar                     | El aviso aparece a los 29 s, visible en pantalla, con el foco en «Continuar la sesión» y sin ninguna petición previa |
| Tabulador y Mayús+Tabulador                                              | El foco sale del aviso y vuelve a su botón; no queda atrapado                   |
| Intro sobre el botón                                                     | Una petición, respuesta 204; el aviso se oculta, se anuncia «Sesión ampliada», el foco vuelve al campo y el texto sigue ahí |
| Cargar una página en una segunda pestaña                                 | La primera no avisa cuando le tocaba; avisa 31 s después de esa carga           |
| Espacio sobre el botón en la primera                                     | Se amplía; la segunda deja de avisar sin enviar nada                            |
| Revocar las sesiones con `scripts/admin/users.mjs` y pulsar «Continuar» | «Tu sesión ha terminado», con el foco en «Volver a entrar»; la segunda pestaña lo muestra también, sin pedir nada |
| Entrar de nuevo y no hacer nada                                          | A los 59 s la página dice que la sesión ha terminado, sin haber enviado ninguna petición; ir al inicio lleva a la entrada |
| Consola del navegador                                                    | Sin errores                                                                     |

Es un ensayo con un navegador automatizado. **No acredita cómo anuncia el aviso un lector de
pantalla**, ni su uso con otros navegadores: eso está en el recorrido manual de
[`accessibility-walkthrough.md`](./accessibility-walkthrough.md).

### Límites conocidos

- **Sin JavaScript no hay aviso.** La sesión caduca igual y la siguiente petición lleva a la
  entrada.
- El aviso toma el foco. Quien esté escribiendo lo pierde un momento; al continuar vuelve al
  mismo campo.
- La sesión previa a la entrada, la del formulario de acceso, dura 15 minutos y no tiene
  aviso: si caduca, el formulario se vuelve a pedir.
- Una petición del propio origen con una sesión viva cuenta como actividad aunque se rechace
  después por su testigo. No es una vía para mantener una sesión ajena: exige su cookie, que
  el navegador no envía desde otro sitio.
- Tras caducar, lo escrito y no enviado se pierde al salir de la página. El aviso lo dice.

## Duración máxima de 12 horas: evaluación

El aviso de inactividad no resuelve este límite: llegado el momento, la sesión termina
aunque se esté usando y se haya ampliado. Hoy la interfaz lo avisa dos minutos antes, dice
que no se puede ampliar y recomienda enviar o copiar lo pendiente. Eso informa, pero no da al
usuario ninguna forma de seguir.

WCAG 2.2.1 admite un límite si se puede desactivar, ajustar o ampliar, o si se da alguna de
sus excepciones. Ninguna encaja sin más:

- **Más de 20 horas.** No: son 12.
- **Esencial.** Un límite absoluto acota el daño de una sesión robada, pero la norma pide que
  ampliarlo invalide la actividad, y aquí no la invalida. Declararlo esencial sería una
  decisión, no un hecho, y no la tomo yo.
- **Tiempo real.** No aplica.

### Opciones

| Opción | Qué supone | Revocación | Trabajo pendiente | Coste |
| ------ | ---------- | ---------- | ----------------- | ----- |
| A. Subir la duración máxima por encima de 20 horas | Cambiar un valor de configuración; la aplicación admite hasta 168 | Intacta: las sesiones siguen siendo del servidor | No se pierde por este límite en una jornada | Ninguno de desarrollo. Alarga la vida de una sesión robada; la inactividad sigue cortándola a los 30 minutos |
| B. Renovar la autenticación sin salir de la página | Antes del límite, el aviso pide la contraseña y, si es correcta, el servidor emite una sesión nueva y revoca la anterior | Intacta: solo renueva una sesión viva, con la contraseña, con el mismo freno de intentos que la entrada; revocar, desactivar o cambiar la contraseña sigue cerrándolo todo | Se conserva: la página sigue abierta y sus formularios reciben el testigo nuevo | Una acción nueva, cambio del script y pruebas |
| C. Guardar borradores en el navegador | Lo escrito se guarda en el equipo y se recupera tras volver a entrar | Intacta | Se conserva, también tras caducar | Deja contenido en equipos compartidos; hay que acotarlo por cuenta y borrarlo al salir |

### Propuesta

**B, renovar la autenticación en la propia página, mientras la sesión sigue viva.**

1. El aviso de la duración máxima, que ya existe, pasa a ofrecer «Renovar la sesión» con un
   campo de contraseña, en vez de limitarse a informar.
2. Una acción nueva, `POST /api/session/renew`, exige origen propio, sesión viva, su testigo
   y la contraseña. La comprueba con el mismo coste y el mismo freno de intentos que la
   entrada.
3. Si es correcta, emite una sesión nueva, con identificador, testigo y duración máxima
   nuevos, y **revoca la anterior en la misma transacción**. No se prolonga ninguna sesión:
   se sustituye.
4. La respuesta entrega el testigo nuevo y el script lo pone en los formularios de la
   página, para que lo pendiente pueda enviarse. Las demás pestañas se enteran por el mismo
   canal que ya usan y piden recargar.
5. Si la sesión ya ha terminado, no hay renovación: se entra de nuevo, como hoy.

**Por qué no debilita la revocación**: renovar exige una sesión que el servidor aún reconoce
y la contraseña vigente. Una sesión revocada, de una cuenta desactivada o anterior a un
cambio de contraseña no puede renovarse, y cada renovación queda en la auditoría. Quien robe
una cookie sin la contraseña no gana nada frente a hoy.

**Lo que B no resuelve**: quien no llegue a renovar a tiempo pierde lo no enviado. C lo
cubriría, a cambio de dejar contenido en el navegador; lo dejaría fuera del piloto salvo que
se pida.

**A es una alternativa legítima y barata** si se prefiere no añadir código: con más de 20
horas el límite queda dentro de una excepción expresa de la norma. Es una decisión de
seguridad del mantenedor.

No he implementado ninguna de las tres: cambian el modelo de sesión acordado en el ADR 0004 o
su configuración, y necesitan decisión.
