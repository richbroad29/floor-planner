// Glue between auth, the plan store and Supabase. Renders nothing.
// On sign-in: load the user's cloud project (or push the local one up if they
// have none yet). While signed in: debounce-save project changes to the cloud.
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePlanStore } from '../store/planStore';
import { loadCloudProject, saveCloudProject } from '../lib/sync';
import { supabaseEnabled } from '../lib/supabase';

export function SyncManager() {
  const init = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const applyingRemote = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  // pull on sign-in (or seed the cloud from local on first sign-in)
  useEffect(() => {
    if (!supabaseEnabled || !user) return;
    let cancelled = false;
    (async () => {
      const cloud = await loadCloudProject(user.id);
      if (cancelled) return;
      if (cloud) {
        applyingRemote.current = true;
        usePlanStore.getState().loadProject(cloud);
        setTimeout(() => {
          applyingRemote.current = false;
        }, 0);
      } else {
        await saveCloudProject(usePlanStore.getState().project, user.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // debounce-save changes while signed in
  useEffect(() => {
    if (!supabaseEnabled) return;
    const unsub = usePlanStore.subscribe((state, prev) => {
      if (state.project === prev.project) return; // project object unchanged
      const u = useAuthStore.getState().user;
      if (!u || applyingRemote.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const project = state.project;
      saveTimer.current = setTimeout(() => saveCloudProject(project, u.id), 1200);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return null;
}
