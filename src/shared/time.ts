namespace LMCL {
  function pad2(value: number): string {
    return String(value).padStart(2, "0");
  }

  export function formatClockTime(timestamp: number): string {
    const date = new Date(timestamp);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  export function formatLocalDateTime(timestamp: number | null): string {
    if (!timestamp) {
      return "Unknown";
    }

    const date = new Date(timestamp);
    return [
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    ].join(" ");
  }

  export function formatFilenameDate(timestamp: number): string {
    const date = new Date(timestamp);
    return [
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      `${pad2(date.getHours())}-${pad2(date.getMinutes())}`
    ].join("_");
  }
}
