// Instrucciones de incorporación manual a Moodle (specs/002-boe-scorm-export:
// T067; FR-040, FR-041, FR-046 y FR-051). Texto plano, para un docente.
//
// No nombran ninguna versión de Moodle como compatible: todavía no se ha
// comprobado ninguna, y lo dicen. T080 las actualizará con la versión y la
// configuración verificadas.

export interface InstructionsInput {
  readonly title: string;
  readonly label: string;
  readonly versionId: string;
  readonly sha256: string;
  readonly filename: string;
  readonly trial: boolean;
}

export const NOT_VERIFIED =
  "Este paquete todavía no se ha comprobado en ninguna versión de Moodle.";

export function instructionsText(input: InstructionsInput): string {
  return [
    "AULANORMA · Instrucciones para incorporar el paquete a Moodle",
    "",
    `Temario: ${input.title}`,
    `Versión aprobada: ${input.label} (identificador ${input.versionId})`,
    `Fichero: ${input.filename}`,
    `Huella SHA-256: ${input.sha256}`,
    ...(input.trial
      ? [
          "",
          "PAQUETE DE ENSAYO. Su contenido procede de respuestas grabadas para",
          "probar el producto: no es un temario real. No lo uses con alumnado.",
        ]
      : []),
    "",
    "ESTADO DE LA COMPROBACIÓN",
    "",
    NOT_VERIFIED,
    "El paquete sigue el formato SCORM 1.2 y AulaNorma comprueba su estructura",
    "al generarlo, pero eso no acredita que una instalación concreta de Moodle",
    "lo importe ni que guarde el recorrido. Pruébalo en un curso de pruebas",
    "antes de usarlo con alumnado. Los pasos siguientes son orientativos: los",
    "nombres de las opciones pueden variar según la versión de Moodle.",
    "",
    "ANTES DE EMPEZAR",
    "",
    "1. Comprueba que el fichero descargado es el que AulaNorma generó.",
    "   Calcula su huella SHA-256 y compárala con la de arriba:",
    `   - En macOS o Linux:  shasum -a 256 ${input.filename}`,
    `   - En Windows:        certutil -hashfile ${input.filename} SHA256`,
    "   Si no coinciden, no lo uses y descárgalo de nuevo.",
    "2. No descomprimas ni modifiques el fichero: Moodle recibe el ZIP tal cual.",
    "",
    "PASOS",
    "",
    "1. Entra en el curso de Moodle con un perfil que pueda editarlo.",
    "2. Activa el modo de edición.",
    "3. En la sección donde quieras el temario, añade una actividad de tipo",
    "   «Paquete SCORM».",
    "4. Escribe un nombre para la actividad.",
    "5. En el apartado del paquete, sube el fichero ZIP descargado.",
    "6. Guarda la actividad.",
    "7. Ábrela como lo haría un alumno y comprueba, al menos, que:",
    "   - se ven todos los temas y se puede pasar de uno a otro;",
    "   - al salir y volver a entrar, continúas en el último tema y se",
    "     conservan los temas marcados;",
    "   - con todos los temas marcados, «Finalizar» deja la actividad como",
    "     finalizada.",
    "   Si el paquete avisa de que no puede guardar el recorrido, no lo des",
    "   por válido en esa instalación.",
    "",
    "QUÉ REGISTRA MOODLE",
    "",
    "El paquete comunica a Moodle si la actividad está en curso o finalizada.",
    "No comunica ninguna puntuación ni ningún resultado de superación, y Moodle",
    "no recibe porcentajes ni detalle por tema. Finalizar la actividad",
    "significa que el alumno ha marcado todos los temas como recorridos: no es",
    "una prueba de aprendizaje, una calificación ni una acreditación de la",
    "formación o de la competencia.",
    "",
    "SI EL TEMARIO CAMBIA",
    "",
    "AulaNorma no puede retirar un fichero que ya has descargado ni modificar",
    "un paquete que ya has importado en Moodle. Si después se aprueba otra",
    "versión del temario, sustituir el paquete en cada curso te corresponde a",
    "ti. Un paquete de otra versión no reutiliza el recorrido guardado por el",
    "anterior: el alumno empieza de nuevo, y el paquete se lo indica.",
    "",
  ].join("\n");
}
