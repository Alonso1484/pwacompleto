// src/app.js
import express from "express";
import morgan from "morgan";
import cors from "cors";
import taskRoutes from "./routes/task.routes.js";
import authRoutes from "./routes/auth.routes.js";
import pushRoutes from "./routes/push.routes.js";
import cronRoutes from "./routes/cron.routes.js";
import { connectToDB } from "./db/connect.js";

const app = express();

// FRONT_ORIGIN acepta varios orígenes separados por coma (producción + previews).
// Se quita la "/" final, un error clásico que rompe CORS.
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173", // vite preview (para probar la PWA ya compilada)
  ...(process.env.FRONT_ORIGIN || "").split(","),
]
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Usamos token Bearer (no cookies), así que no hace falta credentials: true.
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.VERCEL ? "tiny" : "dev"));

// Health check (no necesita base de datos)
app.get("/", (_req, res) => res.json({ ok: true, name: "todo-pwa-api" }));

// Conexión a Mongo cacheada (segura en serverless).
// Express 5 manda automáticamente los errores async al manejador de abajo.
app.use(async (_req, _res, next) => {
  await connectToDB();
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/cron", cronRoutes);

// 404 en JSON (antes Express respondía HTML)
app.use((_req, res) => res.status(404).json({ message: "Ruta no encontrada" }));

// Manejador de errores central: un solo lugar para responder errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  if (err.name === "ValidationError" || err.name === "CastError") status = 400;

  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? "Error del servidor" : err.message,
  });
});

export default app;