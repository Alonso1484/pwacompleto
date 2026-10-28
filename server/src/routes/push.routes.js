import { Router } from "express";
import { auth } from "../middleware/auth.js";

import {
  publicKey,
  subscribe,
  unsubscribe,
  test,
} from "../controllers/push.controller.js";

const router = Router();

// Obtener clave pública VAPID
router.get("/public-key", publicKey);

// Suscribirse a notificaciones
router.post("/subscribe", auth, subscribe);

// Cancelar suscripción
router.post("/unsubscribe", auth, unsubscribe);

// Enviar notificación de prueba
router.post("/test", auth, test);

export default router;

