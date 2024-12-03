import { writable } from "svelte/store";

const STORAGE_KEY = "timeline_events";
export const SEPARATOR_NAME = "__SEPARATOR__";

function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Восстанавливаем объекты Date из строк
      return parsed.map((event) => ({
        ...event,
        start: new Date(event.start),
      }));
    } catch (e) {
      console.error("Error loading events from storage:", e);
      return createInitialEvents();
    }
  }
  return createInitialEvents();
}

function createInitialEvents() {
  const hour = 60 * 60 * 1000;
  const now = new Date();

  return [
    {
      id: 3,
      name: "Linked Event 2",
      duration: hour,
      start: new Date(now.getTime() - 2 * hour),
      locked: false,
    },
    {
      id: -1,
      name: SEPARATOR_NAME,
      duration: -1,
      start: new Date(now.getTime() - hour),
      locked: false,
    },
    {
      id: 2,
      name: "Linked Event 1",
      duration: hour,
      start: new Date(now.getTime() - hour),
      locked: false,
    },
    {
      id: 1,
      name: "Main Event",
      duration: hour,
      start: now,
      locked: false,
    },
  ];
}

function createStore() {
  const store = writable(loadFromStorage());

  return {
    subscribe: store.subscribe,
    set: (value) => {
      store.set(value);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (e) {
        console.error("Error saving events to storage:", e);
      }
    },
  };
}

export const eventsStore = createStore();
