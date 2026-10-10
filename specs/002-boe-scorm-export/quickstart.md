# Quickstart: validar el recorrido de UF0517

**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Guía para comprobar que la funcionalidad funciona de extremo a extremo una vez implementada.
Tiene tres partes independientes: controles automáticos, recorrido funcional (SC-024) y
comprobación manual en Moodle (SC-018 a SC-023). Las órdenes y nombres que todavía no existen
se concretan en `tasks.md`.

## Requisitos previos

- Node.js 24.21.0 y `npm ci`, como en la base de ingeniería.
- El PDF oficial del piloto, con su procedencia anotada (organismo, referencia, origen y fecha
  de obtención).
- Un fichero `.env.local` a partir de `.env.example`, con la ruta de datos y el origen
  público. Para la parte 2, además, el proveedor real de generación y su clave, que nunca se
  confirma en el repositorio ni se pega en registros.
- Un usuario con perfil `admin` y otro con perfil `teacher`, creados con el script de
  administración. Puede ser la misma persona con dos perfiles.
- Para la parte 2: el piloto desplegado y accesible por HTTPS, con una copia de seguridad
  restaurada con éxito al menos una vez (research R11).
- Para la tercera parte: una instancia de Moodle **de pruebas**, sin datos personales reales.

## Parte 1. Controles automáticos

```bash
npm run check          # Los nueve controles de la base, con las pruebas nuevas
npm run verify:negative
```

Resultado esperado: todo en verde, sin acceso a la red. Estas pruebas usan el adaptador
determinista y un doble de la API de SCORM; cubren los contratos de
[contracts/](./contracts/), pero no acreditan la calidad de la generación real ni la
compatibilidad con Moodle.

## Parte 2. Recorrido funcional (SC-024)

Lo ejecuta un usuario autorizado, que puede ser el mantenedor, desde un navegador y por
HTTPS. La evidencia anota quién lo ejecuta y con qué perfil. Durante el recorrido no se tocan
datos ni código al margen del producto.

**Se ejecuta con el proveedor real de generación.** Un recorrido con el adaptador
determinista sirve como ensayo y se registra como tal; no acredita SC-024.

1. **Presupuesto**: con el perfil `admin`, fijar el límite de coste. Comprobar que queda
   registrado con valor anterior y nuevo, y que no se inicia nada.
2. **Documento**: con el perfil `teacher`, registrar el PDF. Comprobar su huella y su
   procedencia, y que las páginas sin texto, si las hay, aparecen identificadas.
3. **Interpretación**: pedirla, revisar el inventario contra la sección original de la unidad
   abriendo varias páginas de origen, corregir lo necesario y validar.
4. **Índice**: pedirlo, revisar la cobertura, quitar a propósito una entrada que cubra un
   requisito y comprobar que no se puede aprobar y que el requisito aparece como pendiente
   con su referencia. Restaurarla y aprobar.
5. **Temario**: ver la estimación, lanzar la generación, revisar los temas distinguiendo
   norma y desarrollo, aprobar cada tema y aprobar la versión.
6. **Invalidación**: renombrar una entrada del índice. Comprobar que dejan de estar vigentes
   la aprobación del índice, las de los temas y la de la versión, que los textos siguen como
   borradores y que no se puede exportar. Volver a aprobar.
7. **Exportación**: previsualizar, exportar, descargar el paquete y las instrucciones, y
   comprobar la huella sobre el fichero descargado.
8. **Paquete sin conexión**: abrirlo con la red desactivada. Debe mostrar el temario completo
   y avisar de que el recorrido no se guardará.

Resultado esperado: el recorrido se completa solo con el producto y sus instrucciones. Las
aprobaciones de los pasos 4 y 5 son decisiones reales tras revisar el contenido.

Este recorrido acredita el funcionamiento. No es una evaluación pedagógica independiente del
temario, que queda fuera de esta entrega.

## Parte 3. Comprobación manual en Moodle (SC-018 a SC-023)

No forma parte de la integración continua. Hasta completarla, las instrucciones dicen que no
se ha comprobado ninguna versión.

La instancia de pruebas confirmada es Moodle 5.0.2; el guion detallado, con lo que hay que
mirar en cada paso, está en [moodle-5.0.2-check.md](./moodle-5.0.2-check.md). **No se ha
ejecutado.**

**Antes de empezar, anotar**: versión exacta de Moodle, fecha, huella del paquete y la
configuración relevante de la actividad SCORM tal como indiquen las instrucciones (método de
calificación, número de intentos, forzar nuevo intento, modo de visualización y finalización
de la actividad).

| Paso | Acción                                                                                  | Resultado esperado                                        | Criterio |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| 1    | Incorporar el paquete siguiendo solo las instrucciones entregadas                        | Sin errores ni avisos                                     | SC-018   |
| 2    | Entrar con un alumno de prueba y recorrer todos los temas                                | Navegación completa; norma y desarrollo diferenciados     | SC-019   |
| 3    | Marcar parte de los temas, salir y volver a entrar en el mismo intento                   | Reanuda en el último tema y conserva los marcados         | SC-020   |
| 4    | Marcar todos los temas y pulsar «Finalizar»                                              | Actividad finalizada, sin calificación                    | SC-021   |
| 5    | Repetir el recorrido con las herramientas de red del navegador abiertas                  | Ninguna petición a un servidor distinto del Moodle        | SC-022   |
| 6    | Cerrar el navegador a mitad del recorrido, sin salir de forma ordenada, y volver         | Anotar lo que se conserva; no se promete más              | —        |
| 7    | Completar la evidencia y actualizar las instrucciones solo con lo verificado             | Versión y configuración exactas registradas               | SC-023   |

La evidencia se guarda en `specs/002-boe-scorm-export/acceptance.md` cuando exista. Un paso
fallido se registra como fallido y vuelve al diseño; no se repite hasta que salga bien ni se
ajusta el criterio.
