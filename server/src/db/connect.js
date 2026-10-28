
import mongoose from "mongoose";

// Conexión cacheada a MongoDB
let cached = globalThis._mongooseConn;

if (!cached) {
  cached = globalThis._mongooseConn = {
    conn: null,
    promise: null
  };
}

export async function connectToDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    // Obtener tu URI de MongoDB desde .env
    const { MONGODB_URI } = process.env;

    if (!MONGODB_URI) {
      throw new Error("Falta MONGODB_URI en el archivo .env");
    }

    cached.promise = mongoose
      .connect(MONGODB_URI.trim(), {
        dbName: "BackPWA",
        autoIndex: !process.env.VERCEL
      })
      .then((m) => {
        console.log("Conectado correctamente a MongoDB");
        return m.connection;
      })
      .catch((err) => {
        cached.promise = null;
        console.error("Error al conectar a MongoDB:", err.message);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
