type ToastType = "success" | "error" | "info";

interface ToastListener {
  (message: string, type: ToastType): void;
}

let listeners: ToastListener[] = [];

export function toast(message: string, type: ToastType = "info") {
  listeners.forEach((listener) => listener(message, type));
}

export function subscribeToasts(listener: ToastListener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}