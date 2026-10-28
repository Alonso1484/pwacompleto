
import { setAuth } from "./api";
import {
  clearLocalData,
  ensureLocalOwner
} from "./offline/db";
import { unsubscribePush } from "./push";

// Guarda la sesión tras login/registro
export async function startSession(
  token: string,
  userId: string
): Promise<void> {
  localStorage.setItem("token", token);
  setAuth(token);

  await ensureLocalOwner(String(userId));
}

// Cierra la sesión, cancela notificaciones
// y limpia los datos locales
export async function logout(): Promise<void> {
  try {
    await unsubscribePush();
  } catch (error) {
    console.error(
      "Error al cancelar las notificaciones push:",
      error
    );
  }

  await clearLocalData();

  localStorage.removeItem("token");
  setAuth(null);

  window.location.href = "/login";
}
