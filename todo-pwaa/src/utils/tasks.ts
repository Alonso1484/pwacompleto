
import {
  PRIORITIES,
  STATUSES,
  type Filter,
  type Priority,
  type Sort,
  type Status,
  type Task,
} from "../types";

// ---------- Identificadores ----------

/** Identifica tareas que todavía no tienen ID de MongoDB */
export const isLocalId = (id: string): boolean =>
  !/^[a-f0-9]{24}$/i.test(id);

/** Genera identificadores para tareas offline */
export function newId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ---------- Normalización ----------

export function normalizeTask(x: any): Task {
  const status: Status = STATUSES.includes(x?.status)
    ? (x.status as Status)
    : "Pendiente";

  const priority: Priority = PRIORITIES.includes(x?.priority)
    ? (x.priority as Priority)
    : "Media";

  let dueDate: string | null = null;

  if (x?.dueDate) {
    const date = new Date(x.dueDate);

    if (!Number.isNaN(date.getTime())) {
      dueDate = date.toISOString();
    }
  }

  return {
    _id: String(x?._id ?? x?.id ?? ""),
    title: String(x?.title ?? "(sin título)"),
    description: String(x?.description ?? ""),
    status,
    priority,
    dueDate,
    clienteId: x?.clienteId,
    createdAt: x?.createdAt,
    updatedAt: x?.updatedAt,
    pending: Boolean(x?.pending),
  };
}

// ---------- Estados ----------

export const isDone = (task: Task): boolean =>
  task.status === "Completada";

export const isOverdue = (
  task: Task,
  now: number = Date.now()
): boolean => {
  if (!task.dueDate || isDone(task)) return false;

  const time = new Date(task.dueDate).getTime();

  return Number.isFinite(time) && time < now;
};

export const statusSlug = (status: Status): string => {
  if (status === "En Progreso") return "progreso";
  if (status === "Completada") return "completada";
  return "pendiente";
};

// ---------- Fechas ----------

const rtf = new Intl.RelativeTimeFormat("es", {
  numeric: "auto",
});

const abs = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function dueRelative(iso: string): string {
  const time = new Date(iso).getTime();

  if (!Number.isFinite(time)) return "Fecha inválida";

  const mins = Math.round((time - Date.now()) / 60_000);

  if (Math.abs(mins) < 60) {
    return rtf.format(mins, "minute");
  }

  const hours = Math.round(mins / 60);

  if (Math.abs(hours) < 24) {
    return rtf.format(hours, "hour");
  }

  return rtf.format(Math.round(hours / 24), "day");
}

export function dueAbsolute(iso: string): string {
  const date = new Date(iso);

  return Number.isFinite(date.getTime())
    ? abs.format(date)
    : "Fecha inválida";
}

// ISO a datetime-local
export function toLocalInput(
  iso: string | null
): string {
  if (!iso) return "";

  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) return "";

  return new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  )
    .toISOString()
    .slice(0, 16);
}

// datetime-local a ISO
export function fromLocalInput(
  value: string
): string | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

// ---------- Filtros y orden ----------

const PRIORITY_WEIGHT: Record<Priority, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

const dueTime = (task: Task): number => {
  if (!task.dueDate) return Number.MAX_SAFE_INTEGER;

  const time = new Date(task.dueDate).getTime();

  return Number.isFinite(time)
    ? time
    : Number.MAX_SAFE_INTEGER;
};

export function filterTasks(
  tasks: Task[],
  search: string,
  filter: Filter
): Task[] {
  const text = search.trim().toLowerCase();
  const now = Date.now();

  return tasks.filter((task) => {
    const title = (task.title ?? "").toLowerCase();
    const description = (task.description ?? "").toLowerCase();

    if (
      text &&
      !title.includes(text) &&
      !description.includes(text)
    ) {
      return false;
    }

    if (filter === "active") return !isDone(task);
    if (filter === "completed") return isDone(task);
    if (filter === "overdue") return isOverdue(task, now);

    return true;
  });
}

export function sortTasks(
  tasks: Task[],
  sort: Sort
): Task[] {
  return [...tasks].sort((a, b) => {
    // Las completadas van al final
    if (isDone(a) !== isDone(b)) {
      return isDone(a) ? 1 : -1;
    }

    if (sort === "due") {
      return dueTime(a) - dueTime(b);
    }

    if (sort === "priority") {
      return (
        PRIORITY_WEIGHT[a.priority] -
          PRIORITY_WEIGHT[b.priority] ||
        dueTime(a) - dueTime(b)
      );
    }

    return (b.createdAt ?? "").localeCompare(
      a.createdAt ?? ""
    );
  });
}
