# Revisión de los textos (T083)

Fecha: 2026-10-08. Rama `feat/002-closing-tasks`.

Revisión de los textos de la interfaz, de los errores, del paquete y de las instrucciones:
español claro, sin jerga, y sin afirmar compatibilidad, calificación, acreditación ni
evaluación pedagógica.

## Alcance y método

Se han revisado los textos de `src/views`, `src/pages`, `src/platform/web`, el paquete
(`src/modules/content-export/package`) y las instrucciones
(`src/modules/content-export/instructions`). Se han buscado las familias de palabras de
riesgo (compatibilidad, calificación, acreditación, certificación, garantía, homologación,
conformidad, pedagógico) y la jerga técnica, y se ha leído cada aparición.

La ha hecho quien desarrolla, no un docente. **Que un docente entienda los textos sin ayuda
no está comprobado**: forma parte del recorrido funcional de aceptación (T081).

## Resultado

**Afirmaciones indebidas: ninguna.** Las doce apariciones de esas palabras son límites que el
producto declara: que el registro de un documento no acredita su vigencia jurídica, que la
cita no acredita el desarrollo, que el paquete no acredita la conformidad completa con SCORM
ni su importación en Moodle, y que «Finalizar» no es una calificación ni acredita el
aprendizaje.

**Jerga corregida:**

| Dónde                                           | Antes                                             | Ahora                                                         |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Interpretación, índice y temario                | «Respuesta grabada del adaptador determinista»    | «Respuesta grabada de prueba, sin proveedor de generación»    |
| Estimación de coste y presupuesto               | «cifras del adaptador determinista»               | «las respuestas son grabaciones de prueba y no cuestan nada»  |
| Exportación, qué se comprueba                   | «Lectura del manifiesto… un analizador de XML ajeno al generador» | «Lectura del paquete: … su índice interno, el manifiesto, se lee con una herramienta distinta de la que lo escribió» |
| Exportación, qué se comprueba                   | «Reglas del perfil que exporta AulaNorma»         | «Reglas propias de AulaNorma»                                 |
| Historial (nuevo)                               | Nombres internos de las tareas de generación      | «interpretación», «propuesta de índice» y «tema del temario»  |

**Términos técnicos que se conservan**, porque nombran algo que el docente necesita
reconocer o porque son parte de un límite acordado:

- «SCORM 1.2» y «ZIP»: son el formato que Moodle pide.
- «Huella SHA-256»: es lo que el docente compara con su fichero; la interfaz dice cómo.
- «no se valida contra los esquemas XSD de SCORM 1.2 ni se acredita la conformidad completa
  con SCORM»: redacción acordada del límite de la comprobación, que no se modifica.

## Qué queda fuera

- Los mensajes de los registros del proceso y de los scripts de operación, que lee quien
  administra el servidor.
- El contenido de los temas, que procede de la generación y lo revisa el docente.
- Las instrucciones de Moodle, que solo podrán nombrar una versión y una configuración cuando
  se hayan verificado (T080).
