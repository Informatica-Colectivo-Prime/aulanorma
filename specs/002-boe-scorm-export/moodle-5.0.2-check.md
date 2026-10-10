# Comprobación manual en Moodle 5.0.2: preparación

**Fecha**: 2026-10-09 | **Tareas**: T079 y T080 | **Procedimiento**: parte 3 de
[quickstart.md](./quickstart.md) | **Evidencia**: [acceptance.md](./acceptance.md) |
**Contrato**: [contracts/scorm-package.md](./contracts/scorm-package.md)

Guion para ejecutar la comprobación en la instancia de pruebas, que el mantenedor ha
confirmado como **Moodle 5.0.2**. Este documento prepara la comprobación; no la registra.

## Estado

**No ejecutada.** AulaNorma no declara compatibilidad con Moodle 5.0.2 ni con ninguna otra
versión. Las instrucciones que acompañan a cada paquete siguen diciendo que no se ha
comprobado ninguna, y así deben seguir hasta que los pasos de abajo se ejecuten y se
registren (T080). Lo que se pueda afirmar después se limita a la versión, la compilación y la
configuración exactas en las que se haya probado.

Los nombres de menús y opciones de este guion son orientativos: no se han contrastado con la
instancia. Donde difieran, se anota el nombre real.

## Qué hace falta

- La instancia de pruebas de Moodle 5.0.2, **sin datos personales reales**, con la actividad
  de paquete SCORM habilitada.
- Una cuenta que pueda editar un curso de pruebas y otra con el rol de estudiante,
  matriculada en él. Las dos, de prueba.
- Un paquete exportado por AulaNorma y sus instrucciones, descargados de la aplicación, con
  el commit que lo generó.
- Un navegador de escritorio con herramientas de desarrollo.

### Qué paquete

| Paquete                                              | Sirve para                                    |
| ---------------------------------------------------- | --------------------------------------------- |
| De ensayo, con respuestas grabadas (adaptador determinista) | Ensayar el guion. Se anota como ensayo  |
| Del temario generado con el proveedor real y aprobado | La comprobación que cuenta para la aceptación |

El paquete de ensayo no cuesta nada y permite detectar antes un fallo de importación o de
seguimiento, que no depende del contenido. Su resultado **no cierra T079** por sí solo: se
registra indicando que el paquete era de ensayo.

## Antes de empezar

Anotar en la tabla «Antes de empezar» de [acceptance.md](./acceptance.md):

1. **Versión exacta de Moodle**, con su compilación, tal como la muestra la administración
   del sitio (por ejemplo, en las notificaciones o en la información del sistema). «5.0.2»
   sin la compilación no basta.
2. Fecha, quién ejecuta la comprobación, navegador y versión.
3. **Huella SHA-256 del paquete**, calculada sobre el fichero descargado, y comprobada contra
   la de las instrucciones:

   ```bash
   shasum -a 256 <fichero>.zip
   ```

4. Versión del temario exportada y commit de AulaNorma.
5. **Configuración de la actividad**, tal como quede al crearla siguiendo solo las
   instrucciones, sin tocar nada más: método de calificación, número de intentos, forzar
   nuevo intento, modo de visualización y finalización de la actividad. Las instrucciones no
   piden cambiar ninguna: se anotan los valores por defecto de la instancia.
6. Los ajustes de sitio del módulo SCORM que difieran de los de una instalación nueva, si se
   conocen.

## Guion

Cada paso se registra con lo observado, también si falla. Un paso fallido no se repite hasta
que salga bien ni se ajusta su criterio: vuelve al diseño.

### 1. Importación (SC-018)

1. Seguir **solo** las instrucciones entregadas con el paquete, sin ayuda de este guion.
2. Subir el ZIP sin descomprimirlo ni modificarlo y guardar la actividad.

| Se espera                                              | Anotar                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| La actividad se crea sin errores ni avisos              | Cualquier mensaje de Moodle, literal                        |
| Aparece un único elemento que lanzar                   | Cómo muestra Moodle la estructura del paquete               |
| Las instrucciones bastan                               | Cada paso en el que hicieron falta más datos o no coinciden |

### 2. Navegación (SC-019)

Con la cuenta de estudiante:

1. Abrir la actividad.
2. Recorrer todos los temas, hacia delante y hacia atrás, con los controles del paquete.
3. Repetirlo solo con el teclado.

| Se espera                                                          | Anotar                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| El paquete no avisa de que no puede guardar el recorrido            | El aviso, si aparece: invalida la comprobación    |
| Se ven todos los temas y se pasa de uno a otro                     | Temas que falten o no se abran                    |
| La norma y el desarrollo se distinguen en cada tema                | Dónde no se distinguen                            |
| El contenido se ve completo en el modo de visualización por defecto | Recortes, barras de desplazamiento dobles, marcos |

### 3. Guardado (SC-020, primera parte)

1. Marcar como recorridos **parte** de los temas, no todos, y quedarse en un tema que no sea
   el primero. Anotar cuáles se marcan y en cuál se queda.
2. Salir de forma ordenada, con el control de salida del paquete o el de Moodle.
3. Con la cuenta que edita el curso, abrir el informe de la actividad SCORM para ese
   estudiante y ese intento.

| Se espera en el informe del intento                      | Anotar                                    |
| -------------------------------------------------------- | ----------------------------------------- |
| Estado en curso (`cmi.core.lesson_status = incomplete`)  | El estado que muestre Moodle, literal     |
| `cmi.core.lesson_location` con el tema en que se quedó   | Su valor                                  |
| `cmi.suspend_data` con contenido                         | Su valor: no lleva datos personales       |
| Ninguna puntuación                                       | Cualquier calificación que aparezca       |
| Un solo intento                                          | El número de intento                      |

Si el informe no muestra esos elementos, anotar qué muestra y dónde se ha buscado.

### 4. Reanudación en el mismo intento (SC-020, segunda parte)

1. Volver a entrar con la cuenta de estudiante.
2. Si Moodle ofrece empezar un intento nuevo, **no** aceptarlo, y anotar que lo ofrece y con
   qué texto.

| Se espera                                             | Anotar                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Se abre en el tema en que se quedó                    | El tema en que se abre                               |
| Se conservan los temas marcados, y solo esos          | Diferencias con lo anotado en el paso 3              |
| Sigue siendo el mismo intento                         | El número de intento en el informe, antes y después  |

Que Moodle cree un intento nuevo al volver a entrar, sin que nadie lo pida, es un fallo de
este paso: el recorrido guardado pertenece al intento anterior.

### 5. Finalización registrada (SC-021)

1. Marcar todos los temas y pulsar «Finalizar».
2. Abrir el informe del intento con la cuenta que edita el curso.
3. Consultar la calificación de la actividad en el libro de calificaciones.
4. Si la actividad tiene condiciones de finalización, anotar si Moodle la da por completada.

| Se espera                                                     | Anotar                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| Estado finalizado (`cmi.core.lesson_status = completed`)      | El estado que muestre Moodle, literal          |
| Ninguna puntuación ni resultado de superación                 | Lo que muestre el libro de calificaciones      |
| El mismo intento que en los pasos 3 y 4                       | El número de intento                           |

Anotar también qué ocurre al volver a abrir una actividad ya finalizada. No hay un resultado
esperado: se registra lo que haga esta instancia.

### 6. Sin peticiones externas (SC-022)

Repetir los pasos 2 a 5, con otro estudiante de prueba o tras borrar el intento, con la
pestaña de red de las herramientas del navegador abierta y sin caché.

| Se espera                                                 | Anotar                                   |
| --------------------------------------------------------- | ---------------------------------------- |
| Ninguna petición a un servidor distinto del propio Moodle | Cada petición a otro origen, con su URL  |

### 7. Cierre sin salida ordenada

A mitad de un recorrido, cerrar la pestaña o el navegador sin usar ningún control de salida,
y volver a entrar.

No hay un resultado prometido. Se anota qué se conserva: el tema, los temas marcados y el
intento.

### 8. Evidencia e instrucciones (SC-023)

1. Completar la tabla de pasos de [acceptance.md](./acceptance.md) con lo observado y el
   estado de cada uno.
2. Solo si los pasos 1 a 6 se cumplen, actualizar las instrucciones del paquete (T080) para
   nombrar **únicamente** la versión, la compilación y la configuración verificadas.
3. Si alguno falla, las instrucciones no cambian y el fallo se registra con lo observado.

## Qué podrá afirmarse después, y qué no

Con todos los pasos cumplidos:

- **Sí**: que un paquete de esa versión de AulaNorma se importó, se recorrió, guardó el
  recorrido, se reanudó en el mismo intento y registró la finalización en Moodle 5.0.2, con
  esa compilación y esa configuración de la actividad, en esa fecha.
- **No**: compatibilidad con otras versiones o compilaciones de Moodle, con otra
  configuración de la actividad, con otras plataformas, ni conformidad con SCORM 1.2.
  Tampoco nada sobre el comportamiento con muchos estudiantes o en dispositivos móviles, que
  este guion no cubre.
