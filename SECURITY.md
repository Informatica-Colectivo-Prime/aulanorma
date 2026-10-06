# Política de seguridad

## Cómo notificar una vulnerabilidad

El canal previsto para notificar vulnerabilidades de forma privada es la **notificación privada
de vulnerabilidades de GitHub**, en la pestaña **Security** del repositorio, opción **Report a
vulnerability**.

**Estado actual: no activada.** El 2026-09-30 la notificación privada de vulnerabilidades de
este repositorio estaba desactivada. Activarla es un ajuste operativo pendiente de la
administración del repositorio. Hasta que esté activada, este documento no ofrece ningún canal
privado.

Mientras no esté activada:

- no publiques en un issue, un pull request, una discusión ni un commit los detalles de la
  vulnerabilidad, pruebas de concepto, secretos, credenciales ni datos personales;
- si necesitas notificar algo, abre un issue que diga **solo** que quieres comunicar un problema
  de seguridad y pida un canal privado, sin ningún detalle técnico.

Cuando el canal esté activado, incluye en la notificación privada la versión o el commit
afectados, los pasos para reproducir el problema y su impacto. Usa solo datos sintéticos: nunca
envíes un secreto real, aunque ya esté expuesto.

## Si se expone un secreto

Un secreto real que llega al repositorio (en un commit, un pull request, un issue o la salida de
una ejecución) se trata como comprometido:

1. **Revócalo inmediatamente**, antes de cualquier otra acción, en el servicio que lo emitió. La
   revocación es la corrección: borrar el fichero o el commit no la sustituye.
2. **No se reescribe el historial de `main` ni se fuerza un push.** Hacerlo exigiría modificar
   antes formalmente la gobernanza del repositorio.
3. **Una excepción nunca conserva una credencial expuesta.** El registro de excepciones de
   secretos ([`docs/engineering/security-exceptions.md`](docs/engineering/security-exceptions.md))
   solo admite falsos positivos o contenido demostrado como no secreto, con responsable,
   justificación y fecha de revisión.

Nunca ocultes un secreto añadiendo su ruta a `.gitignore`: los ficheros ignorados no se analizan,
y cualquier cambio en `.gitignore` se revisa como cambio de seguridad.

## Qué no puede contener el repositorio

El repositorio no puede contener **secretos reales, credenciales ni datos personales**: ni en el
código, la configuración, las pruebas o la documentación, ni en los mensajes de commit, los
issues o los pull requests.

- La configuración local con valores reales va en ficheros `.env*` que Git ignora; solo se
  versiona `.env.example`, con valores ficticios.
- Las pruebas usan solo datos sintéticos. Un dato con forma de secreto se genera en el momento
  de la prueba y nunca aparece como literal en un fichero versionado.

`npm run check:secrets` analiza el historial alcanzable, el índice de Git y el árbol de trabajo
no ignorado, y falla ante cualquier hallazgo no exceptuado. Los controles y sus comandos están
descritos en [`docs/engineering/quality-controls.md`](docs/engineering/quality-controls.md).
