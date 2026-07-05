// Cross-device sync: the whole Project is stored as one JSONB row per project,
// keyed by its id and owned by the signed-in user (RLS-protected). Simple and
// robust at this scale — no per-version row juggling.
import { supabase } from './supabase';
import type { Project } from '../types/plan';

interface ProjectRow {
  id: string;
  owner: string;
  doc: Project;
  updated_at: string;
}

/** Most-recently-updated cloud project for this user, or null. */
export async function loadCloudProject(userId: string): Promise<Project | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('projects')
    .select('doc')
    .eq('owner', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('loadCloudProject failed', error);
    return null;
  }
  const row = data?.[0] as Pick<ProjectRow, 'doc'> | undefined;
  return row?.doc ?? null;
}

/** Upsert the project for this user (last-write-wins on the project id). */
export async function saveCloudProject(project: Project, userId: string): Promise<void> {
  if (!supabase) return;
  const row: ProjectRow = {
    id: project.id,
    owner: userId,
    doc: project,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
  if (error) console.error('saveCloudProject failed', error);
}
