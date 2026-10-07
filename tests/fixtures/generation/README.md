# Respuestas grabadas del adaptador determinista

Cada fichero `.json` es una respuesta fija a una entrada exacta, identificada por la huella
`inputSha256` de esa entrada. Son sintéticas: no proceden de ningún proveedor ni de ningún
documento real.

- `interpretation-synthetic-unit.json`: interpretación de la unidad sintética `UX9001` a
  partir de las páginas 1 a 3 de `tests/fixtures/pdf/synthetic/five-pages.pdf`.
- `outline-synthetic-unit.json`: propuesta de índice para el inventario de esa misma
  interpretación, tal como se guarda sin corregirla. Cubre sus cinco requisitos con tres
  entradas, una de ellas apoyada en varios, y añade una entrada sin respaldo normativo.
