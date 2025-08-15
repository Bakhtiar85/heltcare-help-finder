// src/utils/logger.ts
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

function timestamp(): string {
  return new Date().toISOString();
}

export function log(level: LogLevel, message: string): void {
  console.log(`[${timestamp()}] [${level}] ${message}`);
}

export function info(message: string): void {
  log(LogLevel.INFO, message);
}

export function warn(message: string): void {
  log(LogLevel.WARN, message);
}

export function error(message: string): void {
  log(LogLevel.ERROR, message);
}
