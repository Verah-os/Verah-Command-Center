export type Revision = { session: string | null; revision: string | null };

// A single-flight controller, independent of React for deterministic lifecycle tests.
export function createJourneyPoller(options: {
  read: () => Promise<Revision>;
  active: () => boolean;
  editing: () => boolean;
  refresh: () => void;
  sessionChanged: () => void;
  status: (status: "current" | "pending" | "unavailable") => void;
}) {
  let stopped = false;
  let running = false;
  let previous: Revision | undefined;
  let pending = false;
  return {
    stop() { stopped = true; },
    async tick() {
      if (stopped || running || !options.active()) return;
      running = true;
      try {
        const next = await options.read();
        if (stopped) return;
        if (!next.session || (previous && next.session !== previous.session)) {
          stopped = true;
          options.sessionChanged();
          return;
        }
        pending = pending || !previous || next.revision !== previous.revision;
        previous = next;
        if (!options.active()) return;
        if (pending && options.editing()) {
          options.status("pending");
        } else {
          if (pending) options.refresh();
          pending = false;
          options.status("current");
        }
      } catch {
        if (!stopped) options.status("unavailable");
      } finally { running = false; }
    },
  };
}

export function isJourneyPath(path: string) {
  const id = "[0-9a-f-]{36}";
  return new RegExp(`^(?:/demo/cliente|/prestador|/demo/prestador|/concierge)(?:/atendimento/${id})?$`, "i").test(path)
    || new RegExp(`^/concierge/${id}$`, "i").test(path);
}
