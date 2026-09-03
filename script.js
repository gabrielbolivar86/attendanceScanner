// ⚠️ Debe ser idéntico al AUTH_TOKEN en Code.gs
  const AUTH_TOKEN = "un-secreto-largo-y-dificil-2026";
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygA2nrvO6M0ZN_G4Aa2_IhpjGi5ti8IYkNaV2CS7wvlXGCqKDCcPp4oIxGsw3JrSIH4A/exec";
  const CLAVE_STORAGE = "asistencia_sesion_pendiente";

  let roster = [];           // lista completa de alumnos, cargada al iniciar
  let sesion = [];           // registros acumulados en esta sesión (local)
  let idsYaRegistrados = new Set(); // para chequear duplicados al instante
  let escaneando = true;     // controla si se puede capturar un QR ahora mismo
  let streamCamara = null;
  let rosterCargado = false;

  document.getElementById("fechaHeader").textContent =
    new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  // ================= LOG DE DEPURACIÓN VISIBLE EN PANTALLA =================

  function log(mensaje, tipo = "info") {
    const hora = new Date().toLocaleTimeString('es-ES');
    const color = tipo === "error" ? "#ff8080" : (tipo === "ok" ? "#8fe6a0" : "#c9d9cb");
    const linea = document.createElement("div");
    linea.style.color = color;
    linea.textContent = `[${hora}] ${mensaje}`;
    const lista = document.getElementById("debugLista");
    lista.appendChild(linea);
    lista.scrollTop = lista.scrollHeight;
    console.log(`[ASISTENCIA] ${mensaje}`);
  }
  function toggleDebug() {
    const panel = document.getElementById("panelDebug");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  }
  function limpiarDebug() {
    document.getElementById("debugLista").innerHTML = "";
  }

  log("Página cargada. SCRIPT_URL = " + SCRIPT_URL);

  // Despierta el audio con el primer toque (requerido por navegadores móviles)
  let audioCtx = null;
  document.body.addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }, { once: true });

  // ================= INICIO DE SESIÓN =================

  function comenzarRegistro() {
    document.getElementById("pantallaReposo").style.display = "none";
    document.getElementById("pantallaActiva").style.display = "block";

    restaurarSesionSiExiste();
    cargarRoster();
    iniciarCamara();
  }

  function cargarRoster() {
    log("Cargando roster desde el backend...");
    document.getElementById("mensajeCamara").textContent = "Cargando lista de alumnos...";

    fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "roster", token: AUTH_TOKEN })
    })
      .then(r => {
        log(`Respuesta HTTP recibida: status ${r.status}`);
        return r.text(); // texto primero, así podemos ver el contenido aunque no sea JSON válido
      })
      .then(texto => {
        let data;
        try {
          data = JSON.parse(texto);
        } catch (err) {
          log("❌ La respuesta no es JSON válido. Contenido recibido: " + texto.slice(0, 300), "error");
          document.getElementById("mensajeCamara").textContent = "❌ Error al cargar lista (ver logs 🐞)";
          return;
        }

        if (data.ok) {
          roster = data.alumnos;
          rosterCargado = true;
          log(`✅ Roster cargado: ${roster.length} alumnos.`, "ok");
          document.getElementById("mensajeCamara").textContent = "Apunta al QR del alumno y presiona Escanear";
        } else {
          log("❌ El backend respondió ok:false → " + (data.mensaje || "sin mensaje"), "error");
          document.getElementById("mensajeCamara").textContent = "❌ " + (data.mensaje || "Error al cargar lista");
        }
      })
      .catch(err => {
        log("❌ Error de red al pedir el roster: " + err.message, "error");
        document.getElementById("mensajeCamara").textContent = "❌ Sin conexión (ver logs 🐞)";
      });
  }

  function iniciarCamara() {
    const video = document.getElementById('video');
    log("Solicitando acceso a la cámara...");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        streamCamara = stream;
        video.srcObject = stream;
        video.play();
        log("✅ Cámara activa.", "ok");
      })
      .catch(err => {
        log("❌ Error de cámara: " + err.message, "error");
        document.getElementById("mensajeCamara").textContent = "❌ Error de cámara: " + err.message;
      });
  }

  // Captura UN solo frame y trata de leer un QR en él. Ya no escanea de forma
  // continua — solo cuando se presiona el botón. Así evitamos que un QR
  // sostenido frente a la cámara se re-procese en bucle, y evitamos falsos
  // "no reconocido" cuando simplemente no hay ningún QR en cuadro todavía.
  function capturarYEscanear() {
    if (!escaneando) return; // evita doble-tap mientras se muestra el resultado anterior

    if (!rosterCargado) {
      mostrarFlash(false, "⚠️ Lista de alumnos aún no cargada");
      return;
    }

    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      log("⚠️ La cámara todavía no tiene una imagen lista.", "error");
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.height = video.videoHeight;
    canvas.width = video.videoWidth;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (!code) {
      log("No se detectó ningún QR en la captura.");
      mostrarMensajeSuave("No se detectó ningún QR, intenta de nuevo");
      return;
    }

    log("QR detectado, contenido: " + code.data);
    procesarQR(code.data);
  }

  function mostrarMensajeSuave(texto) {
    const original = document.getElementById("mensajeCamara").textContent;
    document.getElementById("mensajeCamara").textContent = texto;
    setTimeout(() => {
      document.getElementById("mensajeCamara").textContent = "Apunta al QR del alumno y presiona Escanear";
    }, 1500);
  }

  // ================= IDENTIFICACIÓN LOCAL (sin red) =================

  function identificarAlumno(contenidoQR) {
    if (contenidoQR.startsWith("EST-")) {
      return roster.find(a => a.id === contenidoQR) || null;
    }
    if (contenidoQR.includes(";")) {
      const partes = contenidoQR.split(";");
      if (partes.length < 2) return null;
      const [nombre, apellido] = partes;
      return roster.find(a =>
        a.nombre.trim().toLowerCase() === nombre.trim().toLowerCase() &&
        a.apellido.trim().toLowerCase() === apellido.trim().toLowerCase()
      ) || null;
    }
    return null;
  }

  function procesarQR(contenidoQR) {
    escaneando = false;
    const alumno = identificarAlumno(contenidoQR);

    if (!alumno) {
      log(`❌ Contenido "${contenidoQR}" no coincide con ningún alumno del roster (${roster.length} cargados).`, "error");
      mostrarFlash(false, "❌ QR no reconocido");
      return;
    }
    if (idsYaRegistrados.has(alumno.id)) {
      log(`⚠️ ${alumno.nombre} ${alumno.apellido} (${alumno.id}) ya estaba en la sesión.`);
      mostrarFlash(false, `⚠️ ${alumno.nombre} ya fue registrado`);
      return;
    }

    agregarASesion({
      tipo: "existente",
      id: alumno.id,
      nombre: alumno.nombre,
      apellido: alumno.apellido,
      curso: alumno.curso,
      metodo: "qr"
    });

    mostrarFlash(true, `✅ ${alumno.nombre} ${alumno.apellido}`);
  }

  function mostrarFlash(exito, mensaje) {
    const overlay = document.getElementById("overlayResultado");
    overlay.className = exito ? "exito" : "error";
    document.getElementById("overlayIcono").textContent = exito ? "✅" : "⛔";
    document.getElementById("overlayTexto").textContent = mensaje;
    overlay.style.display = "flex";

    if (exito) sonidoExito(); else sonidoError();

    setTimeout(() => {
      overlay.style.display = "none";
      escaneando = true;
    }, 1100); // más corto que antes: ya no esperamos al servidor, así que no hace falta bloquear tanto
  }

  // ================= REGISTRO MANUAL =================

  function abrirModalManual() {
    document.getElementById("modalManual").style.display = "flex";
  }
  function cerrarModalManual() {
    document.getElementById("modalManual").style.display = "none";
    ["inputNombre","inputApellido","inputCelular","inputCurso"].forEach(id => {
      document.getElementById(id).value = "";
    });
  }
  function guardarManual() {
    const nombre = document.getElementById("inputNombre").value.trim();
    const apellido = document.getElementById("inputApellido").value.trim();
    const celular = document.getElementById("inputCelular").value.trim();
    const curso = document.getElementById("inputCurso").value.trim();

    if (!nombre || !apellido || !curso) {
      alert("Nombre, apellido y curso son obligatorios.");
      return;
    }

    agregarASesion({
      tipo: "nuevo",
      nombre, apellido, celular, curso,
      metodo: "manual"
    });

    cerrarModalManual();
    sonidoExito();
  }

  // ================= MANEJO DE LA SESIÓN LOCAL =================

  function agregarASesion(registro) {
    registro.hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    sesion.push(registro);
    if (registro.id) idsYaRegistrados.add(registro.id);
    guardarEnStorage();
    renderizarLog();
  }

  function renderizarLog() {
    document.getElementById("logTitulo").textContent = `Registrados hoy (${sesion.length})`;
    document.getElementById("logCompletoTitulo").textContent = `Registrados hoy (${sesion.length})`;
    document.getElementById("contadorEstado").textContent = `${sesion.length} registrados`;

    const html = sesion.length === 0
      ? '<div class="log-vacio">Aún no hay registros en esta sesión.</div>'
      : sesion.slice().reverse().map(r => `
          <div class="log-item">
            <span class="nombre">${escaparHtml(r.nombre)} ${escaparHtml(r.apellido)}</span>
            <span>
              <span class="etiqueta ${r.metodo}">${r.metodo === 'qr' ? 'QR' : 'Manual'}</span>
              <span style="margin-left:6px;color:#8a9a8c;font-size:0.85em;">${r.hora}</span>
            </span>
          </div>
        `).join("");

    document.getElementById("logListaCompacta").innerHTML = html;
    document.getElementById("logCompletoLista").innerHTML = html;
  }

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  function abrirLogCompleto() {
    document.getElementById("logCompleto").style.display = "flex";
  }
  function cerrarLogCompleto() {
    document.getElementById("logCompleto").style.display = "none";
  }

  // ================= PERSISTENCIA LOCAL (respaldo ante cierre accidental) =================

  function guardarEnStorage() {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify({
      sesion,
      idsYaRegistrados: Array.from(idsYaRegistrados)
    }));
  }

  function restaurarSesionSiExiste() {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (!guardado) return;
    try {
      const datos = JSON.parse(guardado);
      if (datos.sesion && datos.sesion.length > 0) {
        sesion = datos.sesion;
        idsYaRegistrados = new Set(datos.idsYaRegistrados || []);
        renderizarLog();
      }
    } catch (e) { /* storage corrupto, se ignora */ }
  }

  function limpiarStorage() {
    localStorage.removeItem(CLAVE_STORAGE);
  }

  // ================= TERMINAR Y ENVIAR AL BACKEND =================

  function terminarRegistro() {
    if (sesion.length === 0) {
      if (!confirm("No hay registros en esta sesión. ¿Terminar de todas formas?")) return;
    }

    document.getElementById("mensajeCamara").textContent = "Guardando...";
    escaneando = false;
    log(`Enviando lote de ${sesion.length} registros al backend...`);

    fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "guardar_lote", token: AUTH_TOKEN, registros: sesion })
    })
      .then(r => {
        log(`Respuesta HTTP recibida: status ${r.status}`);
        return r.text();
      })
      .then(texto => {
        let data;
        try {
          data = JSON.parse(texto);
        } catch (err) {
          log("❌ La respuesta no es JSON válido. Contenido recibido: " + texto.slice(0, 300), "error");
          alert("❌ El servidor respondió algo inesperado. Revisa el panel de logs (🐞). Tus datos siguen guardados localmente, no se perdieron.");
          escaneando = true;
          return;
        }

        if (data.ok) {
          log("✅ Lote guardado correctamente: " + data.mensaje, "ok");
        } else {
          log("❌ El backend respondió ok:false → " + data.mensaje, "error");
        }
        mostrarResumen(data);
        limpiarStorage();
        detenerCamara();
        resetearASesionNueva();
      })
      .catch(err => {
        log("❌ Error de red al guardar el lote: " + err.message, "error");
        alert("❌ No se pudo conectar para guardar la sesión. Los datos siguen guardados localmente, intenta de nuevo.");
        escaneando = true;
      });
  }

  function mostrarResumen(data) {
    document.getElementById("resumenTitulo").textContent = data.ok ? "Sesión guardada" : "Hubo un problema";
    document.getElementById("resumenTexto").textContent = data.mensaje || "";
    document.getElementById("modalResumen").style.display = "flex";
  }

  function cerrarResumen() {
    document.getElementById("modalResumen").style.display = "none";
    document.getElementById("pantallaActiva").style.display = "none";
    document.getElementById("pantallaReposo").style.display = "flex";
  }

  function detenerCamara() {
    if (streamCamara) {
      streamCamara.getTracks().forEach(track => track.stop());
      streamCamara = null;
    }
  }

  function resetearASesionNueva() {
    sesion = [];
    idsYaRegistrados = new Set();
    renderizarLog();
  }

  // ================= SONIDOS (Web Audio API, sin archivos externos) =================

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(frecuencia, duracionMs, tipo = "sine", volumen = 0.3) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    gain.gain.value = volumen;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duracionMs / 1000);
  }
  function sonidoExito() {
    beep(880, 120);
    setTimeout(() => beep(1200, 150), 130);
  }
  function sonidoError() {
    beep(220, 300, "square", 0.25);
  }