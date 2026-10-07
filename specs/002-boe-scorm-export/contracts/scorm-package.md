# Contrato: paquete SCORM 1.2

**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md) (R7, R8)

Lo que AulaNorma entrega y lo que el paquete hace dentro de la plataforma que lo ejecuta. La
comprobación en un Moodle real es manual y está en [../quickstart.md](../quickstart.md).

## Estructura del fichero

```text
<paquete>.zip
├── imsmanifest.xml      # En la raíz
├── index.html           # SCO único: índice y todos los temas
└── assets/
    ├── style.css
    └── app.js           # Navegación y envoltorio de la API; nada más
```

- Entradas en orden fijo y con fecha fija.
- Ningún fichero fuera de los que declara el manifiesto, y ninguno declarado que falte.
- Ninguna URL externa en ningún fichero: sin fuentes, scripts, imágenes ni enlaces de
  seguimiento remotos.
- Sin credenciales ni datos personales: el paquete no incluye quién aprobó ni quién exportó.

## Manifiesto

- Una organización, un ítem y un recurso con `adlcp:scormtype="sco"` y `href="index.html"`.
- Metadatos de esquema `ADL SCORM`, versión `1.2`.
- El identificador del manifiesto y un metadato visible incluyen el identificador de la
  versión aprobada (FR-034).
- Sin `adlcp:masteryscore` ni ningún otro elemento de puntuación.

## Comportamiento

| Momento                         | Llamadas a la API                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Al abrir                        | `LMSInitialize`; lee `cmi.core.entry`, `cmi.core.lesson_location` y `cmi.suspend_data`                    |
| Primera vez                     | `cmi.core.lesson_status = incomplete`                                                                     |
| Al cambiar de tema              | `cmi.core.lesson_location = <tema>`; `LMSCommit`                                                          |
| Al marcar o desmarcar un tema   | `cmi.suspend_data = <estado>`; `LMSCommit`                                                                |
| Al salir sin finalizar          | `cmi.core.exit = suspend`; `LMSCommit`; `LMSFinish`                                                       |
| Al pulsar «Finalizar»           | `cmi.core.lesson_status = completed`; `cmi.core.exit = ""`; `LMSCommit`; `LMSFinish`                      |

- «Finalizar» solo está disponible con todos los temas marcados (FR-045).
- Nunca se escribe `cmi.core.score.raw`, `min` ni `max`, ni los estados `passed` o `failed`
  (FR-046).
- Si no se encuentra la API, el paquete muestra el contenido y avisa de que el recorrido no
  se guardará (FR-049).
- Si una llamada falla, el paquete lo indica al alumno y no simula que ha guardado.

## Estado de seguimiento

- `cmi.core.lesson_location`: identificador corto del tema, dentro de los 255 caracteres del
  formato.
- `cmi.suspend_data`: `<versión del formato>|<identificador de la versión aprobada>|<mapa de bits de temas marcados>`,
  dentro de los 4096 caracteres del formato.
- Si el identificador de versión guardado no coincide con el del paquete, el estado se
  descarta y el recorrido empieza de nuevo, avisando al alumno.
- Máximo de 200 temas por paquete, comprobado al exportar (FR-048).

## Contenido

- Cada tema muestra por separado, con una etiqueta de texto y no solo con color, los bloques
  de requisito del BOE, con su cita, sección y página, y los de desarrollo didáctico (FR-043).
- Jerarquía de encabezados correcta, navegación con teclado, foco visible y contraste
  suficiente (FR-050).
- Ningún texto presenta la finalización como calificación, prueba de aprendizaje o
  acreditación, ni exige o mide tiempo (FR-046, FR-061).

## Validación antes de ofrecer la descarga

El paquete se relee desde el ZIP y se rechaza, sin dejar fichero descargable, si falla
cualquiera de estas comprobaciones:

1. **Esquemas oficiales**: el manifiesto es válido contra los XSD publicados de SCORM 1.2,
   guardados con su procedencia.
2. **Reglas que los esquemas no expresan**, tomadas de la especificación del formato:
   manifiesto en la raíz; ficheros declarados y reales coincidentes; el recurso lanzable es
   un SCO; ninguna URL externa; identificador de versión correcto; número de temas dentro del
   máximo; ningún dato de usuarios.

Para que el validador no se limite a aceptar lo que produce el generador, las pruebas
incluyen manifiestos y paquetes incorrectos hechos a mano, que debe rechazar, y un paquete
SCORM 1.2 de referencia no generado por AulaNorma, que debe aceptar.

## Pruebas automáticas previstas

- Estructura y validación del paquete, incluidos paquetes alterados que deben rechazarse
  (SC-011, SC-016).
- Dos exportaciones de la misma versión: mismo contenido y estructura (SC-014).
- Ausencia de URL externas, credenciales y datos de usuarios (SC-012, SC-015).
- Contrato de seguimiento contra un doble de la API que aplica los límites del formato:
  inicio, guardado, reanudación, finalización solo tras «Finalizar» y cierre (SC-017).
- Ausencia de la API: se muestra el contenido y el aviso.

Estas pruebas no acreditan la compatibilidad con Moodle: la importación y el seguimiento en
una instancia real siguen siendo obligatorios.
