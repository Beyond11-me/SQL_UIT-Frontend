import type { ReactNode } from "react";
import { RoleHeader } from "./RoleHeader";
export function AppHeader({
  workspace,
  workspaceActions,
}: {
  workspace?: { title: string; number: string; topic: string; source?: string; context?: string; backTo?: string };
  workspaceActions?: ReactNode;
}) {
  return <RoleHeader role="student" workspace={workspace} workspaceActions={workspaceActions} />;
}
