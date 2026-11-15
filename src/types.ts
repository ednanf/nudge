import type { ProjectConfig } from '../server/validation';
export type { ProjectConfig };
export type Project = {
  id: string;
  name: string;
  enabled: boolean;
  config: ProjectConfig;
  hasPassword: boolean;
  lastCheck: {
    startedAt: number;
    success: boolean;
    error: string | null;
    durationMs: number;
  } | null;
};
export type Check = {
  id: string;
  projectId: string;
  projectName: string;
  startedAt: number;
  trigger: string;
  success: boolean;
  error: string | null;
  durationMs: number;
};
export type Dashboard = {
  projects: Project[];
  nextExecution: string;
  lastScheduled: { startedAt: number; finishedAt: number | null } | null;
};
