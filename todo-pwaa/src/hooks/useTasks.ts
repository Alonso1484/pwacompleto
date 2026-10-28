
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../api";

import {
  applyOutbox,
  cacheTasks,
  getCachedTasks,
  getOutbox,
  queueCreate,
  queueDelete,
  queueUpdate,
} from "../offline/db";

import { syncNow } from "../offline/sync";

import type {
  Task,
  TaskInput,
  TaskPatch,
} from "../types";

import {
  isDone,
  isOverdue,
  newId,
  normalizeTask,
} from "../utils/tasks.ts";

import { useOnline } from "./useOnline";

// Funciones opcionales para el contador de la PWA
type Badging = {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const online = useOnline();

  // ---------- Obtener tareas del servidor ----------
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{
        items: unknown[];
      }>("/tasks");

      const server: Task[] = (data.items ?? []).map(
        normalizeTask
      );

      const pending = await getOutbox();

      setTasks(applyOutbox(server, pending));
    } catch (error) {
      console.error(
        "Error al obtener las tareas:",
        error
      );
    }
  }, []);

  // ---------- Sincronizar ----------
  const syncAndRefresh = useCallback(async () => {
    if (!navigator.onLine) return;

    setSyncing(true);

    try {
      await syncNow();
      await refresh();
    } catch (error) {
      console.error(
        "Error al sincronizar las tareas:",
        error
      );
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  // ---------- Inicializar tareas ----------
  useEffect(() => {
    let alive = true;

    async function initialize() {
      try {
        const cached = await getCachedTasks();

        if (alive) {
          setTasks(cached.map(normalizeTask));
        }

        await syncAndRefresh();
      } catch (error) {
        console.error(
          "Error al cargar las tareas locales:",
          error
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void initialize();

    const onOnline = () => {
      void syncAndRefresh();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncAndRefresh();
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener(
      "visibilitychange",
      onVisible
    );

    return () => {
      alive = false;

      window.removeEventListener("online", onOnline);
      document.removeEventListener(
        "visibilitychange",
        onVisible
      );
    };
  }, [syncAndRefresh]);

  // ---------- Guardar caché offline ----------
  useEffect(() => {
    if (loading) return;

    void cacheTasks(tasks).catch((error) => {
      console.error(
        "Error al guardar tareas en IndexedDB:",
        error
      );
    });
  }, [tasks, loading]);

  // ---------- Actualizar badge de la PWA ----------
  useEffect(() => {
    const nav = navigator as Navigator & Badging;

    const active = tasks.filter(
      (task) => !isDone(task)
    ).length;

    if (active > 0) {
      void nav.setAppBadge?.(active)?.catch(
        () => undefined
      );
    } else {
      void nav.clearAppBadge?.()?.catch(
        () => undefined
      );
    }
  }, [tasks]);

  // ---------- Crear tarea ----------
  const add = useCallback(
    async (input: TaskInput) => {
      const id = newId();

      const task: Task = {
        ...input,
        _id: id,
        clienteId: id,
        status: "Pendiente",
        createdAt: new Date().toISOString(),
        pending: true,
      };

      await queueCreate(task);

      setTasks((prev) => [task, ...prev]);

      void syncAndRefresh();
    },
    [syncAndRefresh]
  );

  // ---------- Editar tarea ----------
  const update = useCallback(
    async (id: string, patch: TaskPatch) => {
      await queueUpdate(id, patch);

      setTasks((prev) =>
        prev.map((task) =>
          task._id === id
            ? {
                ...task,
                ...patch,
                pending: true,
              }
            : task
        )
      );

      void syncAndRefresh();
    },
    [syncAndRefresh]
  );

  // ---------- Eliminar tarea ----------
  const remove = useCallback(
    async (id: string) => {
      await queueDelete(id);

      setTasks((prev) =>
        prev.filter((task) => task._id !== id)
      );

      void syncAndRefresh();
    },
    [syncAndRefresh]
  );

  // ---------- Estadísticas ----------
  const stats = useMemo(() => {
    const now = Date.now();

    const total = tasks.length;
    const done = tasks.filter(isDone).length;

    return {
      total,
      done,
      active: total - done,
      overdue: tasks.filter((task) =>
        isOverdue(task, now)
      ).length,
      unsynced: tasks.filter(
        (task) => task.pending
      ).length,
      progress: total
        ? Math.round((done / total) * 100)
        : 0,
    };
  }, [tasks]);

  return {
    tasks,
    stats,
    loading,
    syncing,
    online,
    add,
    update,
    remove,
  };
}
