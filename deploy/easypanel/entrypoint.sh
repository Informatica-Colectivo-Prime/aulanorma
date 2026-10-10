#!/bin/sh
# Arranque del contenedor del piloto (ADR 0005, Propuesto).
#
# El servicio arranca con `npm start`, su única entrada de producción, y
# escucha en `127.0.0.1:3000`, que desde fuera del contenedor no se alcanza.
# `socat` acepta en el puerto 8080 del contenedor y reenvía cada conexión, sin
# leerla ni modificarla, a esa dirección: la frontera HTTP de la aplicación
# sigue decidiendo cada petición.
#
# Si el servicio termina, el contenedor termina con su código. Si termina el
# reenvío, la comprobación de estado de la imagen falla y el orquestador
# sustituye el contenedor.
set -eu

socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:3000 &

exec npm start
