# Recorrido manual de accesibilidad

Para el operador. Completa lo que las pruebas automáticas no pueden acreditar: uso con
teclado, con lector de pantalla y con ampliación, en la interfaz y en el paquete. Dura alrededor
de una hora. **Hasta que se haga y se registre aquí, T082 sigue abierta.**

Anota en cada fila lo que observes, también si falla. Un fallo se registra como fallo: no se
repite hasta que salga bien.

## Preparación

1. En el equipo de desarrollo, con el repositorio en el commit que se evalúa:

   ```bash
   npm ci && npm run tools:install
   cp .env.example .env.development.local
   ```

2. En `.env.development.local`, pon `AULANORMA_SESSION_IDLE_MINUTES=5`. Así el aviso de
   sesión aparece a los tres minutos sin actividad, y no a los 28.
3. Sigue los apartados «3 bis» a «3 sexies» del `README.md` hasta tener un temario aprobado y
   un paquete exportado. Sirven las respuestas de ensayo.
4. Descomprime el paquete en una carpeta nueva.

| Dato                                   | Valor |
| -------------------------------------- | ----- |
| Quién hace el recorrido                |       |
| Fecha                                  |       |
| Commit                                 |       |
| Sistema operativo                      |       |
| Navegador y versión (primero)          |       |
| Navegador y versión (segundo)          |       |
| Lector de pantalla y versión           |       |

## A. Interfaz, solo con teclado

Sin tocar el ratón. Repite la parte A en un segundo navegador.

| Paso | Qué hacer | Qué debe pasar | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| A1 | Abre `/login` y pulsa Tabulador | Lo primero que recibe el foco es «Saltar al contenido», y se ve | | |
| A2 | Entra con usuario y contraseña, solo con teclado | Se entra; el foco siempre se ve | | |
| A3 | Recorre la cabecera con Tabulador | Cada enlace y «Salir» reciben el foco, en el orden en que se leen | | |
| A4 | En «Documentos», llega a la tabla | Si la tabla no cabe, su zona recibe el foco y se desplaza con las flechas | | |
| A5 | En un índice, reordena una entrada con «Subir» y «Bajar» | Se puede con Intro o Espacio; tras hacerlo se sabe dónde está el foco | | |
| A6 | Edita un bloque de un tema y guarda | Todo el formulario se completa con teclado | | |
| A7 | Envía un formulario con un error (por ejemplo, un rechazo sin motivo) | El error se ve, dice qué falta y lo escrito sigue ahí | | |
| A8 | Abre «Historial» y entra en el de un tema | Los enlaces dicen adónde llevan; la tabla se alcanza y se desplaza | | |
| A9 | En ninguna página el foco queda atrapado ni desaparece | — | | |

## B. Aviso, ampliación y renovación de la sesión

Es la tarea T091. Para ver el aviso de fin de sesión sin esperar doce horas, acerca el final
de tu sesión en la base de datos del ensayo, con el servidor en marcha, y recarga la página:

```bash
sqlite3 <directorio de datos>/aulanorma.db \
  "UPDATE session SET expires_at = CAST(strftime('%s','now') AS INTEGER) * 1000 + 420000 \
   WHERE revoked_at IS NULL AND user_id IS NOT NULL;"
```

Con eso la sesión termina en siete minutos y el aviso de renovación aparece a los cinco de
que acabe, es decir, a los dos minutos. Hazlo solo en un directorio de datos de ensayo.

### Inactividad

| Paso | Qué hacer | Qué debe pasar | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| B1 | Abre la edición de un bloque, escribe algo y no toques nada tres minutos | Aparece «Tu sesión está a punto de caducar», arriba, con el foco en «Continuar la sesión» | | |
| B2 | Pulsa Intro | El aviso desaparece, el foco vuelve al campo y lo escrito sigue ahí | | |
| B3 | Espera otro aviso y pulsa Espacio | Igual que B2 | | |
| B4 | Con dos pestañas abiertas, espera el aviso y continúa en una | La otra deja de avisar | | |
| B5 | Sal en una pestaña | La otra dice «Tu sesión ha terminado» y ofrece volver a entrar | | |
| B6 | Entra, no toques nada cinco minutos | La página dice que la sesión ha terminado; lo escrito sigue a la vista para copiarlo | | |
| B7 | Desde ahí, intenta guardar | Lleva a la entrada; no se guarda nada | | |

### Renovación

| Paso | Qué hacer | Qué debe pasar | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| B8 | Acerca el final de la sesión, abre la edición de un bloque en dos pestañas y escribe algo en cada una | A los dos minutos, las dos muestran «Tu sesión está a punto de terminar», con un campo de contraseña. El foco está en el aviso, no en el campo | | |
| B9 | Sigue tecleando sin mirar | Lo que tecleas no aparece en el campo de contraseña | | |
| B10 | Pulsa Tabulador | El foco llega al campo «Contraseña», y se ve | | |
| B11 | Escribe una contraseña equivocada y pulsa Intro | «La contraseña no es correcta», junto al campo, que queda vacío y con el foco | | |
| B12 | Pega la contraseña correcta, o rellénala con tu gestor de contraseñas, y pulsa Intro | El aviso desaparece, el foco vuelve a donde escribías y lo escrito sigue ahí. La página no se ha recargado | | |
| B13 | Mira la otra pestaña, sin tocarla antes | Ya no avisa y su texto sigue ahí; no ha pedido contraseña | | |
| B14 | Guarda el bloque en cada pestaña | Las dos se guardan | | |
| B15 | Repite B8 a B10 y falla la contraseña tres veces; después escribe la correcta | A la cuarta, «Demasiados intentos seguidos»; pasados unos segundos, la correcta renueva | | |
| B16 | Repite B8 y no renueves | Al acabar el tiempo, «Tu sesión ha terminado»; lo escrito sigue a la vista | | |
| B17 | Con lector de pantalla, repite B8, B11 y B12 | Se oyen el título y el texto del aviso, la etiqueta del campo, el error al fallar y «Sesión renovada» al acertar | | |
| B18 | Deja la página de entrada abierta veinte minutos, escribe tus credenciales y entra | Se entra a la primera, sin tener que escribirlas otra vez | | |

## C. Interfaz, con lector de pantalla

VoiceOver con Safari en macOS, o NVDA con Firefox en Windows. Anota cuál.

| Paso | Qué hacer | Qué debe oírse | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| C1 | Abre `/login` | El título de la página y el idioma español | | |
| C2 | Recorre el formulario de entrada | Cada campo, con su etiqueta | | |
| C3 | Entra con una contraseña equivocada | El error, sin tener que buscarlo | | |
| C4 | Lista los encabezados de una página de tema | Un solo encabezado principal y niveles sin saltos | | |
| C5 | Recorre un tema | En cada bloque se oye si es «Requisito extraído del BOE» o «Desarrollo didáctico generado» | | |
| C6 | Entra en la tabla de cobertura de un índice | El título de la tabla y, en cada celda, su cabecera | | |
| C7 | Aprueba un tema | El aviso de que se ha aprobado | | |
| C8 | Espera el aviso de inactividad | Su título y su texto al aparecer; después, solo «Queda 1 minuto», «Quedan 30 segundos» y «Quedan 10 segundos» | | |
| C9 | Continúa la sesión | «Sesión ampliada» | | |
| C10 | En «Historial», una etiqueta «Vigente» o «Sin vigencia» | Se oye como texto, no depende del color | | |

## D. Interfaz, con ampliación

| Paso | Qué hacer | Qué debe pasar | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| D1 | Amplía al 200 % en un tema y en «Exportación» | Todo se lee y se usa; nada se corta ni se solapa | | |
| D2 | Amplía al 400 %, o estrecha la ventana a 320 px | Sin desplazamiento horizontal de la página; las tablas se desplazan en su zona | | |
| D3 | Con el aviso de sesión a la vista al 400 % | El aviso y su botón se ven enteros | | |
| D4 | Aumenta el espaciado del texto (interlineado 1,5; párrafos 2; letras 0,12; palabras 0,16) | Nada se corta ni se solapa | | |

## E. Paquete, abierto desde el disco

Abre `index.html` de la carpeta descomprimida. Sin plataforma, el paquete avisa de que el
recorrido no se guardará: es lo correcto.

| Paso | Qué hacer | Qué debe pasar | Observado | Estado |
| ---- | --------- | -------------- | --------- | ------ |
| E1 | Solo con teclado, llega al índice y entra en un tema | El foco se ve y sigue el orden de lectura | | |
| E2 | Marca un tema como recorrido con Espacio | La casilla cambia y el estado lo dice | | |
| E3 | Pasa de tema con «Tema siguiente» y «Tema anterior», y vuelve con «Índice» | El foco va al tema nuevo, o al índice | | |
| E4 | Llega a «Finalizar» | Sin plataforma no está disponible, y se explica por qué | | |
| E5 | Con lector de pantalla, abre el paquete | Título, aviso de ensayo si lo hay y aviso de que no hay plataforma | | |
| E6 | Con lector, recorre un tema | Norma y desarrollo se distinguen al oírlos | | |
| E7 | Con lector, marca un tema | Se oye el cambio de estado | | |
| E8 | Al 200 % y al 400 % | Igual que D1 y D2 | | |

## F. Paquete dentro de Moodle

Pendiente de un Moodle de pruebas (T079). Moodle añade su propio marco alrededor del
paquete: repite E1 a E8 dentro de la actividad y anota además si el marco de Moodle deja
llegar al contenido con teclado y con lector.

## Al terminar

1. Copia las filas con su resultado a `accessibility.md`, en el estado de cada criterio.
2. Abre una incidencia por cada fallo. No ajustes el criterio.
3. T082 se cierra cuando A a E estén hechas y sus fallos, corregidos o aceptados por escrito.
   F queda ligada a T079.
