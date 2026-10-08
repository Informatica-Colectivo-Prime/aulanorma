# Aceptación del piloto

Registro de la aceptación de `002-boe-scorm-export`: una fila por criterio de éxito de
[`spec.md`](./spec.md), con su estado y su evidencia.

## Estado

**La aceptación no está cerrada.** Este documento se crea con todos los criterios en
«Pendiente» (tarea T078). Un criterio solo cambia de estado cuando existe su evidencia, y
quien lo cambia la enlaza. Nadie ha validado el piloto.

- Los criterios automáticos se completan con la tarea T086, sobre un commit concreto.
- SC-018 a SC-023 dependen de un Moodle de pruebas (T079), que no existe todavía.
- SC-024 depende además del despliegue por HTTPS (T074) y del proveedor real de generación
  (T077).
- SC-040 exige el arranque en un entorno limpio de destino (T074).
- La accesibilidad (T082) está pendiente de evaluación.
- T065 sigue abierta: falta un paquete SCORM 1.2 completo de un tercero.

## Reglas

- **Estados**: «Pendiente», «Cumplido», «No cumplido» y «Ensayo». «Ensayo» es un resultado
  obtenido con respuestas simuladas, cuentas de prueba o un entorno local: informa, pero no
  acredita el criterio.
- Un recorrido con respuestas deterministas se anota como ensayo, no como aceptación.
- Un paso fallido se registra como fallido y vuelve al diseño. No se repite hasta que salga
  bien ni se ajusta el criterio.
- Ninguna evidencia de una tarea bloqueada se simula.
- Una aprobación hecha por una prueba automática o por una cuenta de prueba no es la
  aprobación de un docente.

## Criterios

La tarea T078 nombra los criterios SC-001 a SC-041. La especificación tiene hoy 48, hasta
SC-048: se incluyen todos.

| Criterio | Resumen | Estado | Evidencia |
| -------- | ------- | ------ | --------- |
| SC-001 | Con el PDF de referencia del piloto, el 100 % de las entradas del índice propuesto declaran un requisito normativo con su página o están marcadas… | Pendiente | — |
| SC-002 | El 100 % de los requisitos del inventario validado de UF0517 (capacidades, criterios de evaluación, contenidos y subapartados) aparecen en la… | Pendiente | — |
| SC-003 | En el 100 % de los temas, cada bloque está identificado como requisito del BOE o como desarrollo didáctico | Pendiente | — |
| SC-004 | En el 100 % de los bloques identificados como requisito del BOE, la página indicada existe y la cita coincide con el texto de esa página | Pendiente | — |
| SC-005 | El 100 % de las propuestas que no cumplen el formato exigido se rechazan y quedan registradas, sin guardarse | Pendiente | — |
| SC-006 | En el 100 % de los intentos de exportar o descargar sin una aprobación vigente del índice y del temario, por cualquier vía, el sistema lo deniega | Pendiente | — |
| SC-007 | En el 100 % de los intentos de aprobar o exportar con un usuario no autorizado, el sistema lo deniega y lo registra | Pendiente | — |
| SC-008 | Tras modificar un tema aprobado, en el 100 % de los casos la aprobación de ese tema y la de la versión del temario dejan de ser vigentes y la… | Pendiente | — |
| SC-009 | Desde el 100 % de los requisitos mostrados, el acceso a la fuente lleva directamente a la página registrada | Pendiente | — |
| SC-010 | Cada validación y cada aprobación consultables muestran docente, fecha, hora y versión validada o aprobada | Pendiente | — |
| SC-011 | El 100 % de los paquetes ofrecidos para descarga superan la validación de estructura del formato, y todos los recursos que declaran están dentro… | Pendiente | — |
| SC-012 | Abierto sin conexión a red, el paquete del piloto muestra el temario completo sin intentar ninguna comunicación externa | Pendiente | — |
| SC-013 | La huella calculada sobre el fichero descargado coincide con la registrada en el 100 % de las descargas comprobadas | Pendiente | — |
| SC-014 | Dos exportaciones de la misma versión aprobada contienen el mismo contenido aprobado, con la misma estructura de temas, y ambas identifican esa… | Pendiente | — |
| SC-015 | Una revisión del paquete del piloto no encuentra ningún dato de usuarios (identificadores de cuenta, nombres, correos, perfiles ni atribuciones de… | Pendiente | — |
| SC-016 | Tras un fallo de generación provocado, no queda ningún paquete descargable de ese intento | Pendiente | — |
| SC-017 | En una comprobación automática contra un sustituto de la plataforma, el paquete inicia la sesión, guarda los temas marcados y el último tema, los… | Pendiente | — |
| SC-018 | Siguiendo solo las instrucciones entregadas, el paquete del piloto se incorpora a un Moodle de pruebas sin errores | Pendiente | — |
| SC-019 | Un alumno de prueba navega por el 100 % de los temas y ve en ellos la distinción entre requisitos del BOE y desarrollo didáctico | Pendiente | — |
| SC-020 | Tras marcar parte de los temas y salir, al volver a entrar en el mismo intento se reanuda en el último tema y se conservan los temas marcados | Pendiente | — |
| SC-021 | Tras marcar todos los temas y pulsar «Finalizar», Moodle muestra la actividad como finalizada, sin calificación | Pendiente | — |
| SC-022 | Durante el recorrido no se observa ninguna comunicación con servidores distintos del Moodle de pruebas | Pendiente | — |
| SC-023 | La evidencia de la comprobación registra la versión exacta de Moodle, su configuración relevante, la fecha, la huella del paquete y el resultado… | Pendiente | — |
| SC-024 | Un usuario autorizado completa el recorrido funcional de UF0517 de extremo a extremo (subir el PDF, revisar y validar la interpretación, aprobar… | Pendiente | — |
| SC-025 | Con al menos un requisito obligatorio sin cubrir, el 100 % de los intentos de aprobar el índice, aprobar la versión del temario, exportar o… | Pendiente | — |
| SC-026 | Una revisión de todas las vías de aprobación y exportación no encuentra ninguna que acepte una cobertura incompleta | Pendiente | — |
| SC-027 | Ante una propuesta de prueba que declara cubiertos todos los requisitos y omite la entrada de uno obligatorio, la cobertura muestra ese requisito… | Pendiente | — |
| SC-028 | Para cada tipo de modificación de un índice aprobado (reordenar, renombrar, añadir, quitar y cambiar los requisitos de una entrada), en el 100 %… | Pendiente | — |
| SC-029 | Tras corregir una interpretación validada, en el 100 % de los casos dejan de ser vigentes la validación y las aprobaciones del índice, de los… | Pendiente | — |
| SC-030 | Una revisión del paquete del piloto, de las instrucciones y de los textos del producto no encuentra ninguna exigencia ni medición de tiempo de… | Pendiente | — |
| SC-031 | Tras invalidar la aprobación de una versión ya exportada, el 100 % de los intentos de descargar sus paquetes desde AulaNorma se deniegan,… | Pendiente | — |
| SC-032 | Al alcanzar el límite de coste en una prueba preparada, no se inicia ninguna operación de generación más, los temas terminados siguen disponibles… | Pendiente | — |
| SC-033 | En una prueba con dos sesiones que modifican el mismo elemento, el segundo guardado se rechaza en el 100 % de los casos, se muestra el conflicto y… | Pendiente | — |
| SC-034 | El 100 % de las páginas cuya extracción no devuelve ningún carácter distinto de espacio aparecen identificadas como sin texto extraíble, y el 100… | Pendiente | — |
| SC-035 | Con un requisito obligatorio citado en el temario pero sin contenido didáctico vinculado que lo desarrolle, o con algún tema sin desarrollar o sin… | Pendiente | — |
| SC-036 | El 100 % de las validaciones registradas incluyen la confirmación de la revisión del inventario contra la sección original de la unidad, y no es… | Pendiente | — |
| SC-037 | El 100 % de los intentos de un docente de aumentar el límite de coste se deniegan; cada modificación hecha por el administrador muestra actor,… | Pendiente | — |
| SC-038 | Tras registrar un documento sustituto en una prueba preparada, el documento anterior y su interpretación siguen consultables como histórico, la… | Pendiente | — |
| SC-039 | Una sesión deja de servir en el 100 % de los casos tras el periodo de inactividad, tras la duración máxima, al cerrarla, al cambiar la contraseña,… | Pendiente | — |
| SC-040 | Una copia de seguridad hecha con operaciones en curso se restaura en un entorno limpio: el servicio arranca, el 100 % de las referencias tienen su… | Pendiente | — |
| SC-041 | Tras rechazar una interpretación, un índice o un tema, en el 100 % de los casos el contenido sigue disponible como borrador, constan quién lo… | Pendiente | — |
| SC-042 | El 100 % de los documentos de prueba con JavaScript, XFA, acción automática, lanzamiento o fichero incrustado se rechazan, también cuando esa… | Pendiente | — |
| SC-043 | Tras ejercitar todas las operaciones del producto con todos los perfiles, incluido el administrador, el 100 % de los eventos registrados antes… | Pendiente | — |
| SC-044 | El 100 % de las generaciones registradas indican el proveedor, el modelo, la versión del prompt, el coste estimado y si el resultado fue válido | Pendiente | — |
| SC-045 | Una comprobación automática no encuentra los códigos del certificado ni de la unidad formativa del piloto en el código del producto ni en sus… | Pendiente | — |
| SC-046 | Con un tema de prueba cuyo texto contiene marcado HTML y código de script, el 100 % de las vistas del producto y el paquete exportado lo muestran… | Pendiente | — |
| SC-047 | En una prueba con el reloj controlado, el aviso de inactividad aparece antes de la caducidad y recibe el foco, y la sesión puede ampliarse más de diez veces | Pendiente | — |
| SC-048 | Una renovación con la contraseña correcta sustituye la sesión y permite enviar, sin recargar, lo que estaba escrito, en esa pestaña y en otra | Pendiente | — |

El texto completo y vinculante de cada criterio es el de `spec.md`; el resumen solo ayuda a
localizarlo.

## Plantilla de la comprobación en Moodle (SC-018 a SC-023)

Parte 3 de [`quickstart.md`](./quickstart.md). No forma parte de la integración continua.
Se rellena al ejecutar T079; hasta entonces queda vacía y las instrucciones entregadas con el
paquete dicen que no se ha comprobado ninguna versión.

### Antes de empezar

| Dato                                              | Valor |
| ------------------------------------------------- | ----- |
| Quién ejecuta la comprobación                     |       |
| Fecha                                             |       |
| Versión exacta de Moodle                          |       |
| Huella SHA-256 del paquete                        |       |
| Versión del temario exportada                     |       |
| Commit de AulaNorma                               |       |
| Navegador y versión                               |       |
| Método de calificación de la actividad            |       |
| Número de intentos                                |       |
| Forzar nuevo intento                              |       |
| Modo de visualización                             |       |
| Finalización de la actividad                      |       |

### Pasos

| Paso | Acción | Resultado esperado | Criterio | Resultado observado | Estado |
| ---- | ------ | ------------------ | -------- | ------------------- | ------ |
| 1 | Incorporar el paquete siguiendo solo las instrucciones entregadas | Sin errores ni avisos | SC-018 | | Pendiente |
| 2 | Entrar con un alumno de prueba y recorrer todos los temas | Navegación completa; norma y desarrollo diferenciados | SC-019 | | Pendiente |
| 3 | Marcar parte de los temas, salir y volver a entrar en el mismo intento | Reanuda en el último tema y conserva los marcados | SC-020 | | Pendiente |
| 4 | Marcar todos los temas y pulsar «Finalizar» | Actividad finalizada, sin calificación | SC-021 | | Pendiente |
| 5 | Repetir el recorrido con las herramientas de red del navegador abiertas | Ninguna petición a un servidor distinto del Moodle | SC-022 | | Pendiente |
| 6 | Cerrar el navegador a mitad del recorrido, sin salir de forma ordenada, y volver | Anotar lo que se conserva; no se promete más | — | | Pendiente |
| 7 | Completar la evidencia y actualizar las instrucciones solo con lo verificado | Versión y configuración exactas registradas | SC-023 | | Pendiente |

### Después

- Los pasos fallidos, con lo observado y sin corregir el criterio.
- Qué cambia en las instrucciones: solo la versión y la configuración verificadas (T080).

## Recorrido funcional (SC-024)

Parte 2 de `quickstart.md`, por HTTPS y con el proveedor real. Se rellena al ejecutar T081.

| Dato                                  | Valor |
| ------------------------------------- | ----- |
| Quién lo ejecuta y con qué perfil     |       |
| Fecha                                 |       |
| Origen público                        |       |
| Commit de AulaNorma                   |       |
| Proveedor y modelo de generación      |       |
| Resultado                             |       |
