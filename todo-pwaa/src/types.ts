
export const PRIORITIES = ["Alta", "Media", "Baja"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = [
  "Pendiente",
  "En Progreso",
  "Completada",
] as const;

export type Status = (typeof STATUSES)[number];

export type Filter =
  | "all"
  | "active"
  | "completed"
  | "overdue";

export type Sort =
  | "recent"
  | "due"
  | "priority";

export interface Task {
  _id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  clienteId?: string;
  createdAt?: string;
  updatedAt?: string;
  pending?: boolean;
  deleted?: boolean;
}

export type TaskInput = Pick<
  Task,
  "title" | "description" | "priority" | "dueDate"
>;

export type TaskPatch = Partial<
  Pick<
    Task,
    "title" | "description" | "status" | "priority" | "dueDate"
  >
>;
