# Accesibilidad: lista WCAG 2.2 AA (T082)

Fecha: 2026-10-08. Rama `feat/002-closing-tasks`.

## Estado

**T082 no está terminada y la accesibilidad sigue pendiente de aceptación.** Aquí se registra
la parte de la lista que se ha podido comprobar revisando el marcado y los estilos, con
pruebas automáticas y con cálculos de contraste. **No se ha hecho ninguna evaluación con
lector de pantalla, con ampliación, solo con teclado en un navegador real, ni con personas.**
Sin esa parte no puede afirmarse el cumplimiento de WCAG 2.2 AA, ni de la interfaz ni del
paquete.

## Cómo se ha comprobado

- **Marcado**: lectura de las plantillas de `src/platform/web`, `src/views`, `src/pages` y
  del paquete (`src/modules/content-export/package`), y pruebas automáticas sobre el HTML que
  devuelven las rutas.
- **Contraste**: cálculo de la razón de contraste de WCAG entre los colores declarados en las
  dos hojas de estilo. No se ha medido sobre una pantalla.
- **Tamaños**: lectura de las hojas de estilo, con el tamaño de letra por defecto de 16 px.

Estados usados: **Comprobado** (con el método indicado), **Corregido** (fallaba y se ha
corregido en esta entrega), **Sin comprobar** (necesita una evaluación que no se ha hecho) y
**No aplica**.

## Procedencia de los ensayos

Todo lo que este documento y [`session-limits.md`](./session-limits.md) llaman ensayo se
hizo en el equipo de desarrollo, contra el proceso local de la aplicación (`npm run dev` en
`127.0.0.1:3000`) y con datos de ensayo. **No se ha ejecutado ni modificado nada en ningún
servidor remoto**: el piloto no está desplegado.

## Defectos encontrados y corregidos

| Defecto                                                                                                             | Criterio | Corrección                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| El indicador de foco de la interfaz, ámbar sobre blanco, tenía un contraste de 2,0:1 con el fondo                    | 1.4.11   | Contorno oscuro, 16,6:1 sobre blanco, con un halo blanco para los fondos de color           |
| Las tablas anchas se desplazan dentro de una zona que no recibía el foco: sin ratón no podía desplazarse en todos los navegadores | 2.1.1 | La zona recibe el foco, se anuncia como región y lleva el nombre de su tabla                |
| La sesión caducaba por inactividad sin avisar ni dejar ampliarla                                                    | 2.2.1    | Aviso dos minutos antes, con el foco y una acción para continuar. No resuelve la duración máxima |
| Con un periodo de inactividad de un minuto, una sesión en uso caducaba porque su actividad no llegaba a anotarse    | —        | La actividad se anota como mucho cada décima parte del periodo                              |
| Las casillas de verificación de la interfaz medían unos 13 px                                                       | 2.5.8    | 24 px de lado                                                                               |

## Contraste calculado

| Par                                                 | Razón  | Mínimo | Resultado |
| --------------------------------------------------- | ------ | ------ | --------- |
| Interfaz: texto sobre blanco y sobre gris de fondo  | 16,6 y 15,6 | 4,5 | Cumple |
| Interfaz: texto secundario                          | 7,5 y 7,0 | 4,5 | Cumple |
| Interfaz: enlaces y botón principal                 | 6,7 y 6,3 | 4,5 | Cumple |
| Interfaz: etiquetas de aviso (rojo y verde)         | 7,8 y 6,5 | 4,5 | Cumple |
| Interfaz: borde de los campos de formulario         | 4,7    | 3      | Cumple    |
| Interfaz: indicador de foco, tras la corrección     | 16,6   | 3      | Cumple    |
| Paquete: texto, enlaces y texto secundario          | 17,4, 8,0 y 8,9 | 4,5 | Cumple |
| Paquete: texto sobre los avisos de ensayo y de atención | 15,9 y 15,3 | 4,5 | Cumple |
| Paquete: indicador de foco y bordes de los avisos   | 8,0, 7,4 y 8,1 | 3 | Cumple |

Las líneas de separación y el borde de las etiquetas neutras tienen un contraste de 1,5:1.
Son decorativos: ninguna información depende de ellos.

## Lista por criterio

### Perceptible

| Criterio                                   | Estado        | Observación                                                                                          |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| 1.1.1 Contenido no textual                 | Comprobado    | No hay imágenes ni iconos, ni en la interfaz ni en el paquete                                        |
| 1.2.x Multimedia                           | No aplica     | No hay audio ni vídeo                                                                                |
| 1.3.1 Información y relaciones             | Comprobado en parte | Encabezados, listas, tablas con título y cabeceras con ámbito, campos con etiqueta. Probado en automático en las páginas de historial y de métricas, y en la entrada; el resto, por lectura |
| 1.3.2 Secuencia significativa              | Comprobado    | El orden del marcado es el de lectura; no hay posicionamiento que lo altere                          |
| 1.3.3 Características sensoriales          | Comprobado    | Ninguna instrucción remite a forma, color o posición                                                 |
| 1.3.4 Orientación                          | Comprobado    | Sin bloqueo de orientación                                                                           |
| 1.3.5 Identificar el propósito del campo   | Comprobado    | Usuario y contraseñas declaran su propósito                                                          |
| 1.4.1 Uso del color                        | Comprobado    | Norma y desarrollo, vigencia y avisos se distinguen con texto, no solo con color                     |
| 1.4.3 Contraste mínimo                     | Comprobado    | Tabla anterior, por cálculo                                                                          |
| 1.4.4 Cambio de tamaño del texto           | Sin comprobar | Las medidas son relativas, pero no se ha probado al 200 %                                            |
| 1.4.5 Imágenes de texto                    | Comprobado    | No hay                                                                                               |
| 1.4.10 Reajuste                            | Sin comprobar | Hay etiqueta de ventana gráfica y las tablas se desplazan en su zona; no se ha probado a 320 px      |
| 1.4.11 Contraste de elementos no textuales | Corregido     | Indicador de foco. Bordes de campos y botones, comprobados por cálculo                               |
| 1.4.12 Espaciado del texto                 | Sin comprobar | No se ha probado con el espaciado aumentado                                                          |
| 1.4.13 Contenido al pasar el cursor o el foco | No aplica  | No hay contenido emergente                                                                           |

### Operable

| Criterio                                   | Estado        | Observación                                                                                          |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| 2.1.1 Teclado                              | Corregido en parte | Todo son enlaces, botones y campos nativos, y las zonas desplazables ya reciben el foco. No se ha recorrido con teclado en un navegador |
| 2.1.2 Sin trampas para el foco             | Sin comprobar | No hay diálogos ni componentes propios; falta recorrerlo                                             |
| 2.1.4 Atajos de una tecla                  | No aplica     | No hay atajos                                                                                        |
| 2.2.1 Tiempo ajustable                     | **Sin resolver** | La caducidad por inactividad ya avisa dos minutos antes y se puede ampliar. La duración máxima de 12 horas no se puede ampliar ni entra en una excepción: ver [`session-limits.md`](./session-limits.md) |
| 2.2.2 Pausar, detener, ocultar             | No aplica     | Nada se mueve ni se actualiza solo                                                                   |
| 2.3.1 Destellos                            | No aplica     | No hay                                                                                               |
| 2.4.1 Evitar bloques                       | Comprobado    | Enlace para saltar al contenido, en la interfaz y en el paquete                                      |
| 2.4.2 Título de página                     | Comprobado    | Cada página tiene el suyo                                                                            |
| 2.4.3 Orden del foco                       | Sin comprobar | No hay índices de tabulación positivos; falta recorrerlo                                             |
| 2.4.4 Propósito de los enlaces             | Comprobado en parte | Los enlaces de las páginas nuevas nombran su destino; el resto, por lectura                    |
| 2.4.5 Múltiples vías                       | Sin comprobar | Hay navegación principal y enlaces entre elementos; no hay buscador ni mapa                          |
| 2.4.6 Encabezados y etiquetas              | Comprobado en parte | Sin saltos de nivel en las páginas probadas en automático                                      |
| 2.4.7 Foco visible                         | Comprobado    | Estilo de foco en todos los elementos, por lectura de los estilos                                    |
| 2.4.11 Foco no oculto                      | Comprobado    | No hay cabeceras ni pies fijos                                                                       |
| 2.5.1 a 2.5.4 Gestos, cancelación, etiqueta y movimiento | Comprobado | Solo pulsaciones simples; los nombres visibles son los accesibles                       |
| 2.5.7 Movimientos de arrastre              | Comprobado    | Reordenar se hace con botones                                                                        |
| 2.5.8 Tamaño del objetivo                  | Corregido     | Botones de unos 35 px o más y casillas de 24 px. En el paquete, botones de 44 px y casilla de 22 px dentro de una etiqueta de 44 px                                 |

### Comprensible

| Criterio                                   | Estado        | Observación                                                                                          |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| 3.1.1 Idioma de la página                  | Comprobado    | `lang="es"` en la interfaz y en el paquete                                                           |
| 3.1.2 Idioma de las partes                 | Sin comprobar | El contenido de un temario puede incluir términos en otros idiomas, que no se marcan                 |
| 3.2.1 y 3.2.2 Al recibir el foco o datos   | Comprobado    | Nada cambia de contexto sin enviar un formulario                                                     |
| 3.2.3 y 3.2.4 Navegación e identificación coherentes | Comprobado | Una sola cabecera y los mismos nombres en todas las páginas                                |
| 3.2.6 Ayuda coherente                      | No aplica     | No hay mecanismo de ayuda                                                                            |
| 3.3.1 Identificación de errores            | Sin comprobar | Los errores se muestran en un aviso con texto; falta comprobar cómo los anuncia un lector            |
| 3.3.2 Etiquetas o instrucciones            | Comprobado en parte | Campos con etiqueta y ayudas asociadas, por lectura                                            |
| 3.3.3 Sugerencias ante errores             | Sin comprobar | Los mensajes dicen qué falta; no se ha revisado cada formulario                                      |
| 3.3.4 Prevención de errores                | Comprobado en parte | La validación de la interpretación pide una confirmación expresa y nada se borra; no se ha revisado cada acción |
| 3.3.7 Entrada redundante                   | Comprobado en parte | Los formularios de rechazo conservan el motivo escrito; no se ha revisado cada formulario      |
| 3.3.8 Autenticación accesible              | Comprobado    | Se puede pegar la contraseña y usar un gestor; no hay pruebas cognitivas                             |

### Robusto

| Criterio                                   | Estado        | Observación                                                                                          |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| 4.1.2 Nombre, función, valor               | Sin comprobar | Solo elementos nativos; falta comprobarlo con un lector de pantalla                                  |
| 4.1.3 Mensajes de estado                   | Sin comprobar | Los avisos declaran su función de estado o de alerta, y el paquete anuncia el guardado; falta oírlo  |

## Qué falta para cerrar T082

El recorrido manual, paso a paso y con sus tablas para anotar, está en
[`accessibility-walkthrough.md`](./accessibility-walkthrough.md). Las pruebas automáticas no
sustituyen esas evidencias.

1. Recorrer la interfaz y el paquete solo con teclado, en al menos dos navegadores.
2. Recorrerlos con un lector de pantalla y anotar cómo se anuncian formularios, errores,
   avisos, tablas y el seguimiento del paquete.
3. Probar al 200 % y al 400 % de ampliación, a 320 px de ancho y con el espaciado de texto
   aumentado.
4. Decidir cómo se resuelve la duración máxima de la sesión (2.2.1): la evaluación y la
   propuesta están en [`session-limits.md`](./session-limits.md).
5. Ampliar las pruebas automáticas de estructura a todas las páginas: hoy cubren la entrada,
   el historial y las métricas.
6. Repetir la lista sobre el paquete dentro de Moodle, que añade su propio marco.
