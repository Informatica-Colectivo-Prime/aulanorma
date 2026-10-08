# Procedencia: `adapt-contrib-spoor`

Ficheros de un tercero, copiados **sin modificar** para las pruebas. No forman parte del
producto ni de ningún paquete que AulaNorma exporte.

| Dato        | Valor                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Proyecto    | `adapt-contrib-spoor`, extensión de seguimiento SCORM del Adapt Learning Framework |
| Repositorio | <https://github.com/adaptlearning/adapt-contrib-spoor>                             |
| Versión     | 5.14.5, commit `2d8737c2982ee4617c862e7c21e44c31bbd4e7dd`                          |
| Obtenido    | 2026-10-08, de `raw.githubusercontent.com`, por la ruta del commit                 |
| Licencia    | GPL-3.0: la declaran su `package.json` y su fichero `LICENSE`, copiado aquí        |

| Fichero           | Ruta de origen              | SHA-256                                                            |
| ----------------- | --------------------------- | ------------------------------------------------------------------ |
| `imsmanifest.xml` | `scorm/1.2/imsmanifest.xml` | `e3619b8d67830f6d50c91e23cb73a0008c8a20b8b2bc487a2ae20513e4029bc0` |
| `index_lms.html`  | `required/index_lms.html`   | `10f4aa7b32721dab6342488d625c255b26851f3e7623241cf78e1faa602e6471` |
| `LICENSE`         | `LICENSE`                   | `e3df1185c1c835be365f40eda566c0be7701eb8ea8ecaece6861297e28d916ca` |

## Por qué estos ficheros

- Son obra del propio proyecto: su historial solo tiene commits de sus colaboradores. Por
  eso la licencia del repositorio sí se les aplica. **No se han copiado los XSD** que ese
  proyecto distribuye junto a ellos: son de ADL y de IMS, y su licencia no es la del
  repositorio.
- El manifiesto tiene otra estructura que el de AulaNorma: metadatos LOM en otro espacio de
  nombres, `xsi:schemaLocation`, secciones CDATA y un atributo `xml:lang`.

## Qué son y qué no

- Son la **plantilla** con la que Adapt construye sus paquetes SCORM 1.2: conservan sus
  marcadores `@@…`, que Adapt sustituye al construir. Se usan tal cual.
- **No son un paquete publicado completo** ni han pasado por ninguna plataforma. Un paquete
  construido por un tercero, con procedencia y condiciones verificadas, sigue pendiente: los
  que se han encontrado incluyen los XSD, cuyas condiciones no están acreditadas.

## Condiciones que se cumplen

La GPL-3.0 permite copiar y distribuir copias literales conservando los avisos y entregando
una copia de la licencia. Los ficheros están sin modificar, sus huellas se comprueban en las
pruebas y `LICENSE` los acompaña. Están excluidos del formateador y del análisis estático
para que sigan siendo copias literales.
