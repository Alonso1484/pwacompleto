import PushSubscription from "../models/PushSubscription.js";
import { pushEnabled, sendToUser } from "../services/push.service.js";
import { httpError } from "../utils/httpError.js";

// Verificar que las notificaciones push estén configuradas
function requirePush() {
  if (!pushEnabled()) {
    throw httpError(
      503,
      "Las notificaciones no están configuradas en el servidor"
    );
  }
}

// Obtener la clave pública VAPID
export function publicKey(_req, res) {
  requirePush();

  return res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY,
  });
}

// Alias para mantener compatibilidad con push.routes.js
export const pushLibrary = publicKey;

// Registrar una suscripción push
export async function subscribe(req, res) {
  requirePush();

  const { endpoint, keys } = req.body ?? {};

  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string" ||
    !keys.p256dh ||
    !keys.auth
  ) {
    throw httpError(400, "Suscripción inválida");
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        user: req.userId,
        endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        userAgent: req.get("user-agent")?.slice(0, 200),
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );

  return res.status(201).json({
    ok: true,
    message: "Suscripción registrada correctamente",
  });
}

// Eliminar una suscripción push
export async function unsubscribe(req, res) {
  const { endpoint } = req.body ?? {};

  if (typeof endpoint !== "string" || !endpoint) {
    throw httpError(400, "Falta endpoint");
  }

  await PushSubscription.deleteOne({
    endpoint,
    user: req.userId,
  });

  return res.json({
    ok: true,
    message: "Suscripción eliminada correctamente",
  });
}

// Enviar una notificación de prueba
export async function test(req, res) {
  requirePush();

  const result = await sendToUser(req.userId, {
    title: "Notificaciones activadas",
    body: "Así se verán los recordatorios de tus tareas.",
    url: "/dashboard",
    tag: "test",
  });

  if (!result.sent && !result.failed) {
    throw httpError(
      404,
      "No hay dispositivos suscritos para tu cuenta"
    );
  }

  return res.json(result);
}

