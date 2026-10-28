
import "dotenv/config";
import mongoose from "mongoose";

import Task from "../src/models/Tasks.js";
import User from "../src/models/User.js";
import PushSubscription from "../src/models/PushSubscription.js";

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: "BackPWA",
  });

  console.log("Conectado a MongoDB");

  for (const Model of [User, Task, PushSubscription]) {
    const dropped = await Model.syncIndexes();
    const indexes = await Model.listIndexes();

    console.log(
      `${Model.modelName}: ${indexes.map((i) => i.name).join(", ")}`
    );

    if (dropped.length) {
      console.log(`Eliminados: ${dropped.join(", ")}`);
    }
  }

  console.log("Sincronización de índices completada");

} catch (error) {
  console.error("Error al sincronizar índices:", error);
  process.exitCode = 1;

} finally {
  await mongoose.disconnect();
}
