# Ficheros de prueba de SCORM 1.2

- `reference/`: **fixture interno**. Paquete SCORM 1.2 mínimo escrito a mano para las
  pruebas, con una estructura distinta de la que produce AulaNorma (prefijos de espacio de
  nombres, ítems anidados, varios recursos, una dependencia, comillas simples y una sección
  CDATA). No es de un tercero ni ha pasado por ninguna plataforma.
- `third-party/adapt-contrib-spoor/`: manifiesto SCORM 1.2 y página de inicio del proyecto
  Adapt, **de un tercero y sin modificar**, con licencia GPL-3.0. Su origen, sus huellas y
  sus límites están en su `PROVENANCE.md`. Es una plantilla, no un paquete publicado
  completo.
- **No hay esquemas XSD.** La validación contra ellos se sustituyó:
  [`package-validation.md`](../../../specs/002-boe-scorm-export/package-validation.md).

Los ficheros de terceros son **solo fixtures**: ningún fichero de `src/` los referencia, no
se mezclan con el renderizador y no entran en ningún paquete exportado; una prueba lo
comprueba. Si alguna vez hiciera falta transformar un original, la transformación debe
identificarse como tal y conservar junto a ella el original y su procedencia.
