import { useSyncExternalStore } from "react";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMinuteValue(date: Date) {
  return `${formatDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function getCurrentMinuteSnapshot() {
  return formatMinuteValue(new Date());
}

function getServerMinuteSnapshot() {
  return "";
}

function subscribeMinuteSnapshot(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const mountTimer = window.setTimeout(listener, 0);
  const intervalTimer = window.setInterval(listener, 60_000);

  return () => {
    window.clearTimeout(mountTimer);
    window.clearInterval(intervalTimer);
  };
}

export function useCurrentMinuteValue() {
  return useSyncExternalStore(
    subscribeMinuteSnapshot,
    getCurrentMinuteSnapshot,
    getServerMinuteSnapshot,
  );
}
