# Imagen del piloto para un servicio de Easypanel (ADR 0005, Propuesto;
# docs/engineering/easypanel.md).
#
# No se ha construido ni ejecutado: la revisa una persona antes del primer
# despliegue (specs/002-boe-scorm-export: T074).
#
# - La base es la imagen oficial de Node.js en la versión de `.node-version`,
#   fijada por su huella.
# - La instalación sigue `docs/engineering/deployment.md`: `npm ci`, que no
#   ejecuta scripts de instalación, las herramientas verificadas por su huella
#   y `npm run build`.
# - La imagen no lleva configuración ni secretos: llegan como variables de
#   entorno del servicio, en ejecución. No hay argumentos de construcción.
# - El proceso no se ejecuta como `root` y solo escribe en el directorio de
#   datos, que debe montarse como volumen.

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /opt/aulanorma

COPY package.json package-lock.json .npmrc .node-version ./
RUN npm ci

COPY . .
# Del conjunto de herramientas, el servicio solo necesita qpdf: las de los
# controles del repositorio no pasan a la imagen final.
RUN npm run tools:install \
  && rm -rf .tools/bin \
  && npm run build

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

# `socat` reenvía el puerto del contenedor al proceso, que escucha solo en
# `127.0.0.1:3000` (ADR 0001 y ADR 0005). `tini` reparte las señales y recoge
# los procesos terminados.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends socat tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1
WORKDIR /opt/aulanorma

# La instalación es de `root` y de solo lectura para la cuenta del servicio.
COPY --from=build /opt/aulanorma /opt/aulanorma
COPY deploy/easypanel/entrypoint.sh /usr/local/bin/aulanorma-entrypoint
RUN chmod 0755 /usr/local/bin/aulanorma-entrypoint \
  && install --directory --owner=node --group=node --mode=0700 /var/lib/aulanorma

USER node

# Puerto del reenvío: el único al que debe llegar el proxy de Easypanel. No se
# publica en el servidor.
EXPOSE 8080

# Por el reenvío, como llega el proxy: si deja de responder, el orquestador
# sustituye el contenedor.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then((r)=>process.exit(r.status===200?0:1),()=>process.exit(1))"]

ENTRYPOINT ["tini", "--", "aulanorma-entrypoint"]
