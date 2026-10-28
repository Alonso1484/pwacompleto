
import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from "idb";

import type { Task, TaskPatch } from "../types";
import { isLocalId } from "../utils/tasks.ts";

// ---------- Tipos de operaciones ----------

export type OutboxOp =
  | {
      id: string;
      op: "create";
      clienteId: string;
      data: Task;
      ts: number;
      rev: number;
    }
  | {
      id: string;
      op: "update";
      serverId: string;
      data: TaskPatch;
      ts: number;
      rev: number;
    }
  | {
      id: string;
      op: "delete";
      serverId: string;
      ts: number;
      rev: number;
    };

// ---------- Estructura de IndexedDB ----------

interface TodoDB extends DBSchema {
  tasks: {
    key: string;
    value: Task;
  };

  outbox: {
    key: string;
    value: OutboxOp;
  };

  meta: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
}

let dbp: Promise<IDBPDatabase<TodoDB>> | undefined;

// ---------- Abrir base de datos ----------

export function db() {
  dbp ??= openDB<TodoDB>("todo-pwa", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("tasks")) {
        database.createObjectStore("tasks", {
          keyPath: "_id",
        });
      }

      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", {
          keyPath: "key",
        });
      }

      if (!database.objectStoreNames.contains("outbox")) {
        database.createObjectStore("outbox", {
          keyPath: "id",
        });
      }
    },
  });

  return dbp;
}

// ---------- Caché de tareas ----------

export async function cacheTasks(list: Task[]) {
  const database = await db();
  const tx = database.transaction("tasks", "readwrite");
  const store = tx.objectStore("tasks");

  await store.clear();

  for (const task of list) {
    await store.put(task);
  }

  await tx.done;
}

export async function getCachedTasks(): Promise<Task[]> {
  return (await db()).getAll("tasks");
}

export async function putTaskLocal(task: Task) {
  await (await db()).put("tasks", task);
}

export async function getAllTasksLocal(): Promise<Task[]> {
  return (await db()).getAll("tasks");
}

export async function removeTaskLocal(id: string) {
  await (await db()).delete("tasks", id);
}

// ---------- Mapeo de identificadores ----------

export async function setMapping(
  clienteId: string,
  serverId: string
) {
  await (await db()).put("meta", {
    key: `map:${clienteId}`,
    value: serverId,
  });
}

export async function getMapping(
  clienteId: string
): Promise<string | undefined> {
  const mapping = await (await db()).get(
    "meta",
    `map:${clienteId}`
  );

  return mapping?.value;
}

// ---------- Promover tarea local ----------

export async function promoteLocalToServer(
  clienteId: string,
  serverId: string
): Promise<void> {
  const database = await db();

  await setMapping(clienteId, serverId);

  const task = await database.get("tasks", clienteId);

  if (!task) return;

  const tx = database.transaction("tasks", "readwrite");

  await tx.store.delete(clienteId);

  await tx.store.put({
    ...task,
    _id: serverId,
    clienteId,
    pending: false,
  });

  await tx.done;
}

// ---------- Obtener operaciones pendientes ----------

export async function getOutbox(): Promise<OutboxOp[]> {
  const operations = await (await db()).getAll("outbox");

  return operations.sort((a, b) => a.ts - b.ts);
}

// ---------- Crear tarea offline ----------

export async function queueCreate(task: Task) {
  const database = await db();

  await database.put("outbox", {
    id: `create:${task._id}`,
    op: "create",
    clienteId: task._id,
    data: task,
    ts: Date.now(),
    rev: 1,
  });
}

// ---------- Actualizar tarea offline ----------

export async function queueUpdate(
  id: string,
  patch: TaskPatch
) {
  const database = await db();
  let serverId = id;

  if (isLocalId(id)) {
    const create = await database.get(
      "outbox",
      `create:${id}`
    );

    if (create?.op === "create") {
      await database.put("outbox", {
        ...create,
        data: {
          ...create.data,
          ...patch,
        },
        rev: create.rev + 1,
      });

      return;
    }

    const mapped = await getMapping(id);

    if (!mapped) return;

    serverId = mapped;
  }

  const key = `update:${serverId}`;
  const previous = await database.get("outbox", key);

  await database.put("outbox", {
    id: key,
    op: "update",
    serverId,
    data: {
      ...(previous?.op === "update" ? previous.data : {}),
      ...patch,
    },
    ts: previous?.ts ?? Date.now(),
    rev: (previous?.rev ?? 0) + 1,
  });
}

// ---------- Eliminar tarea offline ----------

export async function queueDelete(id: string) {
  const database = await db();

  if (isLocalId(id)) {
    const create = await database.get(
      "outbox",
      `create:${id}`
    );

    await database.delete("outbox", `create:${id}`);

    if (create) return;

    const mapped = await getMapping(id);

    if (!mapped) return;

    id = mapped;
  }

  await database.delete("outbox", `update:${id}`);

  await database.put("outbox", {
    id: `delete:${id}`,
    op: "delete",
    serverId: id,
    ts: Date.now(),
    rev: 1,
  });
}

// ---------- Eliminar operación por revisión ----------

export async function removeOp(op: OutboxOp) {
  const tx = (await db()).transaction(
    "outbox",
    "readwrite"
  );

  const current = await tx.store.get(op.id);

  if (current && current.rev === op.rev) {
    await tx.store.delete(op.id);
  }

  await tx.done;
}

// ---------- Eliminar operación por ID ----------

/**
 * Función requerida por sync.ts.
 * Elimina una operación pendiente por su identificador.
 */
export async function removeOutbox(
  id: string
): Promise<void> {
  const database = await db();

  const tx = database.transaction(
    "outbox",
    "readwrite"
  );

  await tx.store.delete(id);

  await tx.done;
}

// ---------- Aplicar cambios pendientes ----------

export function applyOutbox(
  server: Task[],
  ops: OutboxOp[]
): Task[] {
  const byId = new Map(
    server.map((task) => [task._id, task])
  );

  const serverClienteIds = new Set(
    server.map((task) => task.clienteId).filter(Boolean)
  );

  const created: Task[] = [];

  for (const op of ops) {
    if (op.op === "update") {
      const task = byId.get(op.serverId);

      if (task) {
        byId.set(op.serverId, {
          ...task,
          ...op.data,
          pending: true,
        });
      }
    } else if (op.op === "delete") {
      byId.delete(op.serverId);
    } else if (!serverClienteIds.has(op.clienteId)) {
      created.push({
        ...op.data,
        pending: true,
      });
    }
  }

  return [
    ...created.reverse(),
    ...byId.values(),
  ];
}

// ---------- Manejo de sesiones ----------

export async function clearLocalData() {
  const database = await db();

  const tx = database.transaction(
    ["tasks", "outbox", "meta"],
    "readwrite"
  );

  await tx.objectStore("tasks").clear();
  await tx.objectStore("outbox").clear();
  await tx.objectStore("meta").clear();

  await tx.done;
}

export async function ensureLocalOwner(
  userId: string
) {
  const database = await db();

  const owner = (
    await database.get("meta", "owner")
  )?.value;

  if (owner && owner !== userId) {
    await clearLocalData();
  }

  await database.put("meta", {
    key: "owner",
    value: userId,
  });
}
