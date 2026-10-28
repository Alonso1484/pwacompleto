import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15_000,
});

export function setAuth(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// Recuperar la sesión al iniciar la aplicación
setAuth(localStorage.getItem("token"));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? "");

    // Los errores de conexión no significan que
    // la sesión haya expirado.
    if (!error.response) {
      return Promise.reject(error);
    }

    // Solo consideramos expiración de sesión
    // cuando un endpoint protegido devuelve 401.
    const isAuthEndpoint =
      url.startsWith("/auth/") ||
      url.includes("/api/auth/");

    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("token");
      setAuth(null);

      window.location.replace("/");
    }

    return Promise.reject(error);
  }
);

export function errorMessage(
  err: unknown,
  fallback = "Ocurrió un error"
): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return "Sin conexión con el servidor";
    }

    return (
      (err.response.data as { message?: string })?.message ??
      fallback
    );
  }

  return err instanceof Error ? err.message : fallback;
}
