
import { api } from "../api";

import {
  getOutbox,
  removeOutbox,
  setMapping,
  getMapping,
  removeTaskLocal,
  promoteLocalToServer,
  getAllTasksLocal,
  putTaskLocal,
  type OutboxOp,
} from "./db";

let syncing: Promise<void> | null = null;

async function performSync(): Promise<void> {
  if (!navigator.onLine) return;

  const ops = (await getOutbox()).sort(
    (a, b) => a.ts - b.ts
  );

  if (!ops.length) return;

  // Agrupar las operaciones por tarea
  const groups = new Map<string, OutboxOp[]>();

  for (const op of ops) {
    const id =
      op.clienteId ??
      ("serverId" in op ? op.serverId : undefined);

    if (!id) continue;

    if (!groups.has(id)) {
      groups.set(id, []);
    }

    groups.get(id)!.push(op);
  }

  // Procesar las tareas pendientes
  for (const [id, taskOps] of groups) {
    try {
      const createOp = taskOps.find(
        (op) => op.op === "create"
      );

      const deleteOp = taskOps.find(
        (op) => op.op === "delete"
      );

      const updates = taskOps.filter(
        (op) => op.op === "update"
      );

      // Unir los cambios realizados sin internet
      const changes: Record<string, any> = {};

      for (const op of updates) {
        if (op.op === "update") {
          Object.assign(changes, op.data);
        }
      }

      const mappedId = await getMapping(id);

      const opConServerId = taskOps.find(
        (op) => "serverId" in op && op.serverId
      );

      let serverId: string | undefined =
        opConServerId &&
        "serverId" in opConServerId
          ? opConServerId.serverId
          : mappedId;

      // Tarea creada y eliminada sin internet
      if (createOp && deleteOp && !serverId) {
        await removeTaskLocal(id);

        for (const op of taskOps) {
          await removeOutbox(op.id);
        }

        continue;
      }

      // Crear tarea en MongoDB
      if (createOp?.op === "create" && !serverId) {
        const payload = {
          ...createOp.data,
          ...changes,
          clienteId: createOp.clienteId,
          description:
            changes.description ??
            createOp.data.description ??
            "",
          status:
            changes.status ??
            createOp.data.status ??
            "Pendiente",
        };

        const { data } = await api.post(
          "/tasks/bulksync",
          {
            tasks: [payload],
          }
        );

        const mapping = data?.mapping?.find(
          (m: any) =>
            m.clienteId === createOp.clienteId
        );

        if (!mapping?.serverId) {
          throw new Error(
            "No se recibió el ID de MongoDB"
          );
        }

        // Guardar el ID recibido del servidor
        const nuevoServerId: string = mapping.serverId;

        serverId = nuevoServerId;

        await setMapping(
          createOp.clienteId,
          nuevoServerId
        );
      }

      // Eliminar una tarea
      if (deleteOp) {
        if (!serverId) {
          throw new Error(
            "No se encontró el ID para eliminar"
          );
        }

        await api.delete(`/tasks/${serverId}`);

        await removeTaskLocal(id);
        await removeTaskLocal(serverId);

        for (const op of taskOps) {
          await removeOutbox(op.id);
        }

        continue;
      }

      if (!serverId) {
        throw new Error(
          "No se encontró el ID de la tarea"
        );
      }

      // Actualizar tarea creada sin internet
      if (createOp?.op === "create") {
        await api.put(`/tasks/${serverId}`, {
          title:
            changes.title ?? createOp.data.title,
          description:
            changes.description ??
            createOp.data.description ??
            "",
          status:
            changes.status ??
            createOp.data.status ??
            "Pendiente",
        });

        await promoteLocalToServer(
          createOp.clienteId,
          serverId
        );
      } else if (updates.length > 0) {
        // Actualizar tarea existente
        await api.put(
          `/tasks/${serverId}`,
          changes
        );
      }

      // Actualizar los datos locales
      const localTasks = await getAllTasksLocal();

      const local = localTasks.find(
        (t: any) =>
          t._id === id ||
          t._id === serverId
      );

      if (local) {
        if (id !== serverId) {
          await removeTaskLocal(id);
        }

        await putTaskLocal({
          ...local,
          ...changes,
          _id: serverId,
          pending: false,
        });
      }

      // Eliminar operaciones ya sincronizadas
      for (const op of taskOps) {
        await removeOutbox(op.id);
      }

      console.log(
        `Tarea ${serverId} sincronizada correctamente`
      );
    } catch (error) {
      console.error(
        `Error sincronizando tarea ${id}:`,
        error
      );
    }
  }
}

export function syncNow(): Promise<void> {
  if (!navigator.onLine) {
    return Promise.resolve();
  }

  if (syncing) return syncing;

  const run = performSync().finally(() => {
    syncing = null;
  });

  syncing = run;

  return run;
}

export function setupOnlineSync() {
  const handler = () => {
    void syncNow();
  };

  window.addEventListener("online", handler);

  return () => {
    window.removeEventListener("online", handler);
  };
}
