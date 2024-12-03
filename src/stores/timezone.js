import { writable } from "svelte/store";

// Начальное значение - московское время
export const selectedTimezone = writable("UTC+03:00 (Москва)");
