import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export default function PublicRoute({
  children,
}: {
  children: ReactNode;
}) {
  const token = localStorage.getItem("token");

  return token
    ? <Navigate to="/dashboard" replace />
    : <>{children}</>;
}

