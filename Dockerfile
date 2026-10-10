# Imagen del piloto para un servicio de Easypanel (ADR 0005, Propuesto;
# docs/engineering/easypanel.md).
#
# - La base es la imagen oficial de Node.js en la versión de `.node-version`,
#   fijada por su huella.
# - La instalación sigue `docs/engineering/deployment.md`: `npm ci`, que no
#   ejecuta scripts de instalación, las herramientas verificadas por su huella
#   y `npm run build`.
# - La imagen no lleva secretos ni la configuración del servicio: llegan como
#   variables de entorno, en ejecución. No hay argumentos de construcción. Lo
#   único que fija es lo que depende de ser un contenedor: el modo y la
#   dirección de escucha.
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

# `tini` reparte las señales y recoge los procesos terminados: `npm start`
# encadena la comprobación previa y el servidor.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# En un contenedor, la interfaz local no es alcanzable desde el proxy: el
# servicio escucha en todas las del contenedor, cuya red es propia. El puerto
# no se publica en el servidor (ADR 0005).
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  AULANORMA_LISTEN_HOST=0.0.0.0
WORKDIR /opt/aulanorma

# La instalación es de `root` y de solo lectura para la cuenta del servicio.
COPY --from=build /opt/aulanorma /opt/aulanorma
RUN install --directory --owner=node --group=node --mode=0700 /var/lib/aulanorma

USER node

# El único puerto del servicio. Lo alcanza el proxy por la red interna.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.status===200?0:1),()=>process.exit(1))"]

# `npm start` es la única entrada de producción del servicio.
ENTRYPOINT ["tini", "--", "npm", "start"]
