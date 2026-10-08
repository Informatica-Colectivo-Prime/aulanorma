// Navegación entre temas y seguimiento con la API de SCORM 1.2
// (contracts/scorm-package.md). Nada más: sin dependencias, sin peticiones de
// red y sin puntuación.
//
// Regla de este fichero: solo se dice que el recorrido está guardado cuando
// la plataforma ha devuelto "true" a cada escritura y a `LMSCommit`. Sin
// plataforma, o si una llamada falla, se dice que no se ha guardado.
/* global document, window */
(function () {
  "use strict";

  var FORMAT = "1";
  var MESSAGES = {
    noApi:
      "No se ha encontrado ninguna plataforma de seguimiento. Puedes leer todo el contenido, pero tu recorrido no se guardará.",
    initFailed:
      "La plataforma no ha aceptado el inicio del seguimiento. Puedes leer todo el contenido, pero tu recorrido no se guardará.",
    saved: "La plataforma ha confirmado que tu recorrido está guardado.",
    notSaved:
      "No se ha podido guardar el último cambio en la plataforma. Tu recorrido puede no conservarse. Se intentará guardar de nuevo con tu próxima acción.",
    unsavedStatus: "Recorrido sin guardar.",
    readFailed:
      "No se ha podido leer tu recorrido anterior. Si continúas, lo que marques ahora lo sustituirá.",
    otherVersion:
      "El recorrido guardado corresponde a otra versión de este temario y no puede reutilizarse: empiezas de nuevo.",
    finished:
      "La plataforma ha confirmado la finalización. No es una calificación ni acredita el aprendizaje.",
    finishFailed:
      "No se ha podido comunicar la finalización a la plataforma. La actividad no consta como finalizada. Puedes intentarlo de nuevo.",
    alreadyFinished:
      "Esta actividad ya consta como finalizada en la plataforma.",
    finishUnavailable:
      "No disponible: no hay ninguna plataforma a la que comunicar la finalización.",
    finishPending: "Disponible cuando hayas marcado todos los temas.",
  };

  var body = document.body;
  var version = body.getAttribute("data-version") || "";
  var statusBox = document.getElementById("estado");
  var alertBox = document.getElementById("aviso");
  var indexBox = document.getElementById("indice");
  var finalBox = document.getElementById("final");
  var topics = Array.prototype.slice.call(
    document.querySelectorAll("article.topic"),
  );
  var total = topics.length;
  var marks = [];
  var checkboxes = [];
  var current = 0;
  var api = null;
  // "none": sin plataforma. "active": con seguimiento. "closed": la sesión con
  // la plataforma ha terminado y ya no admite llamadas.
  var tracking = "none";
  var completed = false;
  // `true` mientras la plataforma no haya aceptado el estado «incomplete».
  var needsIncomplete = false;
  var finishButton = null;
  var finishNote = null;
  var index;

  for (index = 0; index < total; index += 1) {
    marks.push(false);
  }

  // --- API de la plataforma ---

  function findIn(start) {
    var win = start;
    var depth = 0;
    try {
      while (win && depth < 500) {
        if (win.API) {
          return win.API;
        }
        if (!win.parent || win.parent === win) {
          return null;
        }
        win = win.parent;
        depth += 1;
      }
    } catch {
      return null;
    }
    return null;
  }

  function findApi() {
    var found = findIn(window);
    if (!found && window.opener) {
      found = findIn(window.opener);
    }
    return found;
  }

  function call(name, first, second) {
    try {
      return String(
        second === undefined ? api[name](first) : api[name](first, second),
      );
    } catch {
      return "false";
    }
  }

  function lastError() {
    try {
      return String(api.LMSGetLastError());
    } catch {
      return "101";
    }
  }

  // Valor leído, o `null` si la lectura ha fallado.
  function read(element) {
    var value = call("LMSGetValue", element);
    return lastError() === "0" ? value : null;
  }

  function write(element, value) {
    return call("LMSSetValue", element, value) === "true";
  }

  function commit() {
    return call("LMSCommit", "") === "true";
  }

  // --- Avisos ---

  function setStatus(text) {
    statusBox.textContent = text;
  }

  function setAlert(text) {
    alertBox.textContent = text;
    alertBox.hidden = text === "";
  }

  // --- Estado ---

  function bitmap() {
    var text = "";
    var position;
    for (position = 0; position < total; position += 1) {
      text += marks[position] ? "1" : "0";
    }
    return text;
  }

  function allMarked() {
    var position;
    for (position = 0; position < total; position += 1) {
      if (!marks[position]) {
        return false;
      }
    }
    return total > 0;
  }

  // Escribe el estado completo y pide a la plataforma que lo guarde. Como
  // cada guardado lleva todo el estado, uno posterior repara uno fallido.
  function save() {
    var done = true;
    if (tracking !== "active") {
      return false;
    }
    if (needsIncomplete) {
      done = write("cmi.core.lesson_status", "incomplete");
      needsIncomplete = !done;
    }
    done =
      write(
        "cmi.core.lesson_location",
        current === 0 ? "" : "t" + String(current),
      ) && done;
    done =
      write("cmi.suspend_data", FORMAT + "|" + version + "|" + bitmap()) &&
      done;
    done = commit() && done;
    if (done) {
      setAlert("");
      setStatus(MESSAGES.saved);
    } else {
      setStatus(MESSAGES.unsavedStatus);
      setAlert(MESSAGES.notSaved);
    }
    return done;
  }

  function restore(suspend, location) {
    var parts = suspend.split("|");
    var position;
    var number;
    if (
      parts.length !== 3 ||
      parts[0] !== FORMAT ||
      parts[1] !== version ||
      parts[2].length !== total ||
      !/^[01]*$/.test(parts[2])
    ) {
      return false;
    }
    for (position = 0; position < total; position += 1) {
      marks[position] = parts[2].charAt(position) === "1";
    }
    if (/^t[1-9][0-9]{0,2}$/.test(location)) {
      number = parseInt(location.slice(1), 10);
      if (number <= total) {
        current = number;
      }
    }
    return true;
  }

  // --- Interfaz ---

  function refresh() {
    var position;
    var spans = document.querySelectorAll("[data-mark]");
    for (position = 0; position < spans.length; position += 1) {
      spans[position].textContent = marks[
        parseInt(spans[position].getAttribute("data-mark"), 10) - 1
      ]
        ? "· Recorrido"
        : "· Pendiente";
    }
    for (position = 0; position < total; position += 1) {
      checkboxes[position].checked = marks[position];
      checkboxes[position].disabled = tracking === "closed";
    }
    if (tracking === "none") {
      finishButton.disabled = true;
      finishNote.textContent = MESSAGES.finishUnavailable;
    } else if (completed) {
      finishButton.disabled = true;
      finishNote.textContent = MESSAGES.alreadyFinished;
    } else {
      finishButton.disabled = !allMarked();
      finishNote.textContent = allMarked() ? "" : MESSAGES.finishPending;
    }
  }

  function show(number, focus) {
    var position;
    var target;
    current = number;
    for (position = 0; position < total; position += 1) {
      topics[position].hidden = position + 1 !== number;
    }
    indexBox.hidden = number !== 0;
    finalBox.hidden = number !== 0;
    if (focus) {
      target = number === 0 ? indexBox : topics[number - 1];
      target.setAttribute("tabindex", "-1");
      target.focus();
    }
  }

  function go(number) {
    show(number, true);
    save();
  }

  function button(label, secondary, handler) {
    var element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (secondary) {
      element.className = "secondary";
    }
    element.addEventListener("click", handler);
    return element;
  }

  function controls(number) {
    var box = document.createElement("div");
    var label = document.createElement("label");
    var checkbox = document.createElement("input");
    box.className = "controls";
    label.className = "done";
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", function () {
      marks[number - 1] = checkbox.checked;
      refresh();
      save();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode("He recorrido este tema"));
    checkboxes.push(checkbox);
    box.appendChild(label);
    if (number > 1) {
      box.appendChild(
        button("Tema anterior", true, function () {
          go(number - 1);
        }),
      );
    }
    box.appendChild(
      button("Índice", true, function () {
        go(0);
      }),
    );
    if (number < total) {
      box.appendChild(
        button("Tema siguiente", false, function () {
          go(number + 1);
        }),
      );
    }
    topics[number - 1].appendChild(box);
  }

  // --- Finalización y salida ---

  function finish() {
    var done;
    if (tracking !== "active" || completed || !allMarked()) {
      return;
    }
    done = write("cmi.core.lesson_status", "completed");
    done = write("cmi.core.exit", "") && done;
    done = commit() && done;
    if (!done) {
      setStatus(MESSAGES.unsavedStatus);
      setAlert(MESSAGES.finishFailed);
      return;
    }
    if (call("LMSFinish", "") !== "true") {
      setStatus(MESSAGES.unsavedStatus);
      setAlert(MESSAGES.finishFailed);
      return;
    }
    completed = true;
    tracking = "closed";
    setAlert("");
    setStatus(MESSAGES.finished);
    refresh();
  }

  // Al salir sin finalizar. No hay a quién avisar de un fallo: la página se
  // está cerrando.
  function leave() {
    if (tracking !== "active") {
      return;
    }
    tracking = "closed";
    if (!completed) {
      write("cmi.core.exit", "suspend");
    }
    commit();
    call("LMSFinish", "");
  }

  // --- Inicio ---

  function start() {
    var status;
    var suspend;
    var location;
    var notice = "";
    var position;

    for (position = 1; position <= total; position += 1) {
      controls(position);
    }
    finishButton = button("Finalizar", false, finish);
    finishButton.id = "finalizar";
    finishNote = document.createElement("p");
    finishNote.className = "hint";
    finishNote.id = "finalizar-nota";
    finishButton.setAttribute("aria-describedby", "finalizar-nota");
    finalBox.appendChild(finishButton);
    finalBox.appendChild(finishNote);
    document.querySelectorAll("#indice a").forEach(function (link, place) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        go(place + 1);
      });
    });

    api = findApi();
    if (!api) {
      setStatus(MESSAGES.noApi);
    } else if (call("LMSInitialize", "") !== "true") {
      api = null;
      setStatus(MESSAGES.initFailed);
    } else {
      tracking = "active";
      status = read("cmi.core.lesson_status");
      suspend = read("cmi.suspend_data");
      location = read("cmi.core.lesson_location");
      if (status === null || suspend === null || location === null) {
        notice = MESSAGES.readFailed;
      } else if (suspend !== "" && !restore(suspend, location)) {
        notice = MESSAGES.otherVersion;
      }
      completed = status === "completed";
      needsIncomplete =
        status !== null && status !== "completed" && status !== "incomplete";
    }

    show(current, false);
    refresh();
    if (tracking === "active") {
      if (notice === MESSAGES.readFailed) {
        // No se escribe nada hasta que el alumno actúe: guardar ahora
        // sustituiría un recorrido que no se ha podido leer.
        setStatus(MESSAGES.unsavedStatus);
        setAlert(notice);
      } else if (save()) {
        setAlert(notice);
        if (completed) {
          setStatus(MESSAGES.alreadyFinished);
        }
      } else if (notice !== "") {
        setAlert(notice + " " + MESSAGES.notSaved);
      }
    }
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);
  }

  start();
})();
