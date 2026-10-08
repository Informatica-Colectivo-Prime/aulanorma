# Ficheros de prueba de SCORM 1.2

- `reference/`: **fixture interno**. Paquete SCORM 1.2 mínimo escrito a mano para las
  pruebas, con una estructura distinta de la que produce AulaNorma (prefijos de espacio de
  nombres, ítems anidados, varios recursos, una dependencia, comillas simples y una sección
  CDATA). No es de un tercero ni ha pasado por ninguna plataforma.
- `third-party/adapt-contrib-spoor/`: manifiesto SCORM 1.2 y página de inicio del proyecto
  Adapt, **de un tercero y sin modificar**, con licencia GPL-3.0. Su origen, sus huellas y
  sus límites están en su `PROVENANCE.md`. Es una plantilla, no un paquete publicado
  completo.
- **No hay esquemas XSD** en este directorio. Su procedencia y sus condiciones de
  redistribución no están acreditadas: véase
  [`specs/002-boe-scorm-export/scorm-schemas.md`](../../../specs/002-boe-scorm-export/scorm-schemas.md).
