// Debe ser idéntico al del resto del proyecto (escáner / Teacher Center)
const AUTH_TOKEN = "un-secreto-largo-y-dificil-2026";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygA2nrvO6M0ZN_G4Aa2_IhpjGi5ti8IYkNaV2CS7wvlXGCqKDCcPp4oIxGsw3JrSIH4A/exec";

const CLAVE_SESION = "cancion_sesion_usuario";

document.addEventListener("DOMContentLoaded", () => {
  const sesionGuardada = sessionStorage.getItem(CLAVE_SESION);
  if (sesionGuardada) {
    mostrarVistaSegunRol(JSON.parse(sesionGuardada));
  }

  document.getElementById("inputContrasena").addEventListener("keydown", e => {
    if (e.key === "Enter") intentarLogin();
  });
});

function intentarLogin() {
  const usuario = document.getElementById("inputUsuario").value.trim();
  const contrasena = document.getElementById("inputContrasena").value.trim();
  const errorDiv = document.getElementById("errorLogin");
  errorDiv.textContent = "";

  if (!usuario || !contrasena) {
    errorDiv.textContent = "Ingresa usuario y contraseña.";
    return;
  }

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accion: "login", token: AUTH_TOKEN, usuario, contrasena })
  })
    .then(r => r.text())
    .then(texto => {
      let data;
      try {
        data = JSON.parse(texto);
      } catch (err) {
        errorDiv.textContent = "❌ Error del servidor. Intenta de nuevo.";
        return;
      }

      if (!data.ok) {
        errorDiv.textContent = data.mensaje || "Usuario o contraseña incorrectos.";
        return;
      }

      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(data));
      mostrarVistaSegunRol(data);
    })
    .catch(() => {
      errorDiv.textContent = "❌ No se pudo conectar. Revisa tu conexión.";
    });
}

function mostrarVistaSegunRol(datosUsuario) {
  document.getElementById("pantallaLogin").style.display = "none";

  if (datosUsuario.rol === "profesor") {
    document.getElementById("vistaProfesor").style.display = "block";
  } else {
    document.getElementById("vistaAlumno").style.display = "block";
    document.getElementById("bienvenidaAlumno").textContent =
      `Hola, ${datosUsuario.nombre} (${datosUsuario.curso || "sin curso"})`;
  }
}

function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_SESION);
  location.reload();
}