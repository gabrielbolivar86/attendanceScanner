// ⚠️ Cambia esta contraseña por la que quieras usar
const TEACHER_PASSWORD = "connect2026";

// Deben ser idénticos a los del escáner (index.html / Code.gs)
const AUTH_TOKEN = "un-secreto-largo-y-dificil-2026";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzfXHOqt2ObX7nxtm-Iyq1otrDb0vV9tUWaH69BlsG1PRWjbfB0Puhawa9YW6CGNpo7Fw/exec";

const CLAVE_SESION = "teacher_center_autenticado";

let alumnosQR = [];
let alumnoActivo = null;
let vistaClaseIniciada = false;
let vistaMatrizIniciada = false;

// ================= LOGIN =================

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem(CLAVE_SESION) === "1") {
    mostrarDashboard();
  }
  document.getElementById("inputPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") intentarLogin();
  });
});

function intentarLogin() {
  const valor = document.getElementById("inputPassword").value;
  if (valor === TEACHER_PASSWORD) {
    sessionStorage.setItem(CLAVE_SESION, "1");
    mostrarDashboard();
  } else {
    document.getElementById("errorLogin").textContent = "Contraseña incorrecta.";
  }
}

function mostrarDashboard() {
  document.getElementById("pantallaLogin").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  iniciarVistaClase();
}

// ================= LOG DE DEPURACIÓN =================

function log(mensaje, tipo = "info") {
  const hora = new Date().toLocaleTimeString('es-ES');
  const color = tipo === "error" ? "#ff8080" : (tipo === "ok" ? "#8fe6a0" : "#c9d9cb");
  const linea = document.createElement("div");
  linea.style.color = color;
  linea.textContent = `[${hora}] ${mensaje}`;
  const lista = document.getElementById("debugLista");
  lista.appendChild(linea);
  lista.scrollTop = lista.scrollHeight;
}
function toggleDebug() {
  const panel = document.getElementById("panelDebug");
  panel.style.display = panel.style.display === "block" ? "none" : "block";
}

// ================= LLAMADA GENÉRICA AL BACKEND =================

function llamarBackend(accion, datosExtra = {}) {
  log(`→ Pidiendo acción "${accion}"...`);
  return fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accion, token: AUTH_TOKEN, ...datosExtra })
  })
    .then(r => {
      log(`Respuesta HTTP: status ${r.status}`);
      return r.text();
    })
    .then(texto => {
      let data;
      try {
        data = JSON.parse(texto);
      } catch (err) {
        log("❌ Respuesta no es JSON válido: " + texto.slice(0, 200), "error");
        throw new Error("Respuesta inválida del servidor");
      }
      if (!data.ok) {
        log("❌ Backend respondió ok:false → " + data.mensaje, "error");
        throw new Error(data.mensaje || "Error desconocido");
      }
      log(`✅ "${accion}" completado.`, "ok");
      return data;
    })
    .catch(err => {
      log("❌ Error de red: " + err.message, "error");
      throw err;
    });
}

// ================= TABS =================

function cambiarTab(nombre, elementoTab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("activo"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("activo"));
  elementoTab.classList.add("activo");
  document.getElementById(elementoTab.dataset.panel).classList.add("activo");

  // Cada vista se inicializa una sola vez (con estas banderas), así cambiar
  // de pestaña varias veces rápido no dispara peticiones duplicadas al backend.
  if (nombre === "clase" && !vistaClaseIniciada) { vistaClaseIniciada = true; iniciarVistaClase(); }
  if (nombre === "alumno" && !vistaMatrizIniciada) { vistaMatrizIniciada = true; iniciarVistaMatriz(); }
  if (nombre === "qr" && !vistaQRIniciada) iniciarVistaQR();
}

// ================= VISTA: ASISTENCIA POR CLASE =================

function iniciarVistaClase() {
  llamarBackend("cursos").then(data => {
    const sel = document.getElementById("selCursoClase");
    sel.innerHTML = '<option value="Todos">Todos los cursos</option>' +
      data.cursos.map(c => `<option value="${c}">${c}</option>`).join("");
    alCambiarCursoClase();
  }).catch(err => {
    vistaClaseIniciada = false;
    document.getElementById("tituloClase").textContent = "❌ Error: " + err.message;
  });
}

function alCambiarCursoClase() {
  const curso = document.getElementById("selCursoClase").value;
  llamarBackend("fechas", { curso }).then(data => {
    const sel = document.getElementById("selFechaClase");
    sel.innerHTML = data.fechas.map(f => `<option value="${f}">${f}</option>`).join("");
    cargarAsistenciaPorClase();
  }).catch(err => {
    document.getElementById("tituloClase").textContent = "❌ Error: " + err.message;
  });
}

function cargarAsistenciaPorClase() {
  const curso = document.getElementById("selCursoClase").value;
  const fecha = document.getElementById("selFechaClase").value;
  if (!fecha) { document.getElementById("tablaClaseBody").innerHTML = ""; return; }

  document.getElementById("tituloClase").textContent = `${curso} — ${fecha}`;

  llamarBackend("asistencia_clase", { curso, fecha }).then(data => {
    document.getElementById("tablaClaseBody").innerHTML = data.registros.length
      ? data.registros.map(r => `
          <tr>
            <td>${r.nombre}</td>
            <td>${r.apellido}</td>
            <td><span class="etiqueta ${r.metodo === 'qr' ? 'qr' : 'manual'}">${r.metodo === 'qr' ? 'QR' : 'Manual'}</span></td>
          </tr>`).join("")
      : '<tr><td colspan="3">Sin registros para esta fecha.</td></tr>';
  }).catch(err => {
    document.getElementById("tablaClaseBody").innerHTML =
      `<tr><td colspan="3" style="color:var(--rojo)">❌ ${err.message}</td></tr>`;
  });
}

// ================= VISTA: ASISTENCIA POR ALUMNO (MATRIZ) =================

function iniciarVistaMatriz() {
  llamarBackend("cursos").then(data => {
    const sel = document.getElementById("selCursoMatriz");
    sel.innerHTML = '<option value="Todos">Todos los cursos</option>' +
      data.cursos.map(c => `<option value="${c}">${c}</option>`).join("");
    cargarMatriz();
  }).catch(err => {
    vistaMatrizIniciada = false;
    document.querySelector("#tablaMatriz tbody").innerHTML =
      `<tr><td style="color:var(--rojo)">❌ ${err.message}</td></tr>`;
  });
}

function cargarMatriz() {
  const curso = document.getElementById("selCursoMatriz").value;
  llamarBackend("matriz", { curso }).then(data => {
    const datos = data.datos;
    const thead = document.querySelector("#tablaMatriz thead");
    const tbody = document.querySelector("#tablaMatriz tbody");

    thead.innerHTML = "<tr><th>Alumno</th>" + datos.fechas.map(f => `<th>${f}</th>`).join("") + "</tr>";

    tbody.innerHTML = datos.alumnos.map(a => `
      <tr>
        <td>${a.nombre} ${a.apellido}</td>
        ${datos.fechas.map(f => a.fechas[f]
          ? '<td class="check-si">✅</td>'
          : '<td class="check-no">–</td>').join("")}
      </tr>
    `).join("");

    document.getElementById("resumenMatriz").textContent = `Total: ${datos.alumnos.length} alumnos`;
  }).catch(err => {
    document.querySelector("#tablaMatriz tbody").innerHTML =
      `<tr><td style="color:var(--rojo)">❌ ${err.message}</td></tr>`;
  });
}

// ================= VISTA: GESTIÓN DE QR =================

let vistaQRIniciada = false;

function iniciarVistaQR() {
  vistaQRIniciada = true;
  llamarBackend("alumnos_qr").then(data => {
    alumnosQR = data.alumnos;
    renderizarListaQR();
  }).catch(err => {
    vistaQRIniciada = false; // permite reintentar si falló
    document.getElementById("listaQR").innerHTML =
      `<p style="color:var(--rojo)">❌ Error al cargar alumnos: ${err.message}</p>`;
  });
}

function renderizarListaQR() {
  const filtro = document.getElementById("filtroQR").value;
  const filtrados = alumnosQR.filter(a => {
    if (filtro === "pendientes") return !a.qrGenerado;
    if (filtro === "generados") return a.qrGenerado;
    return true;
  });

  const totalAlumnos = alumnosQR.length;
  const totalGenerados = alumnosQR.filter(a => a.qrGenerado).length;
  const totalPendientes = totalAlumnos - totalGenerados;

  document.getElementById("resumenQR").textContent =
    `Total: ${totalAlumnos} · Con QR: ${totalGenerados} · Pendientes: ${totalPendientes}`;

  document.getElementById("listaQR").innerHTML = filtrados.map(a => `
    <div class="fila-alumno-qr">
      <div class="info">
        <span class="nombre">${a.nombre} ${a.apellido}</span>
        <span class="etiqueta ${a.qrGenerado ? 'generado' : 'pendiente'}">${a.qrGenerado ? 'QR generado' : 'Pendiente'}</span>
      </div>
      <div class="acciones">
        <button class="boton suave" onclick="abrirModalQR('${a.id}')">Ver / Generar QR</button>
      </div>
    </div>
  `).join("") || "<p>No hay alumnos en este filtro.</p>";
}

function abrirModalQR(idAlumno) {
  log("Clic en 'Ver/Generar QR' para ID: " + idAlumno);
  const alumno = alumnosQR.find(a => a.id === idAlumno);
  if (!alumno) {
    alert("No se encontró al alumno con ID " + idAlumno);
    return;
  }
  if (typeof QRCode === "undefined") {
    alert("❌ La librería de QR no cargó. Revisa que subiste qrcode-lib.js al repositorio.");
    log("❌ QRCode no está definido.", "error");
    return;
  }
  try {
    alumnoActivo = alumno;
    document.getElementById("badgeNombre").textContent = `${alumno.nombre} ${alumno.apellido}`;

    const contenedor = document.getElementById("qrContainer");
    contenedor.innerHTML = ""; // limpia el QR anterior antes de dibujar el nuevo
    new QRCode(contenedor, {
      text: alumno.id,
      width: 220,
      height: 220,
      correctLevel: QRCode.CorrectLevel.M
    });

    log("✅ QR generado, abriendo modal.", "ok");
    document.getElementById("modalQR").style.display = "flex";
  } catch (err) {
    log("❌ Excepción en abrirModalQR: " + err.message, "error");
    alert("❌ Error inesperado: " + err.message);
  }
}

function cerrarModalQR() {
  document.getElementById("modalQR").style.display = "none";
}

function descargarBadge() {
  html2canvas(document.getElementById("badgePreview")).then(canvas => {
    const link = document.createElement("a");
    link.download = `QR_${alumnoActivo.nombre}_${alumnoActivo.apellido}.png`.replace(/\s+/g, "_");
    link.href = canvas.toDataURL("image/png");
    link.click();

    if (!alumnoActivo.qrGenerado) {
      llamarBackend("marcar_qr", { id: alumnoActivo.id }).then(() => {
        alumnoActivo.qrGenerado = true;
        const idx = alumnosQR.findIndex(a => a.id === alumnoActivo.id);
        if (idx > -1) alumnosQR[idx].qrGenerado = true;
        renderizarListaQR();
      }).catch(() => { /* el error ya quedó logueado, no interrumpe la descarga */ });
    }
  });
}

function enviarWhatsapp() {
  if (!alumnoActivo.celular) {
    alert("Este alumno no tiene número de celular registrado.");
    return;
  }
  // Asume números bolivianos (+591). Ajustar si tus alumnos son de otro país.
  const numero = "591" + alumnoActivo.celular.replace(/\D/g, "").replace(/^0+/, "");
  const mensaje = encodeURIComponent("Hola! este es tu Qr para la clase.");
  window.open(`https://wa.me/${numero}?text=${mensaje}`, "_blank");
}
