import { AgentError } from './errors.ts';

export type ObserveFunction<T> = (data: T, ...rest: unknown[]) => void;

export class Observable<T> {
  observers: ObserveFunction<T>[];

  constructor() {
    this.observers = [];
  }

  subscribe(func: ObserveFunction<T>) {
    this.observers.push(func);
  }

  unsubscribe(func: ObserveFunction<T>) {
    this.observers = this.observers.filter(observer => observer !== func);
  }

  notify(data: T, ...rest: unknown[]) {
    this.observers.forEach(observer => observer(data, ...rest));
  }
}

export type AgentLog =
  | {
      message: string;
      level: 'warn' | 'info';
    }
  | {
      message: string;
      level: 'error';
      error: AgentError;
    };

export class ObservableLog extends Observable<AgentLog> {
  constructor() {
    super();
  }
  print(message: string, ...rest: unknown[]) {
    this.notify({ message, level: 'info' }, ...rest);
  }
  warn(message: string, ...rest: unknown[]) {
    this.notify({ message, level: 'warn' }, ...rest);
  }
  error(message: string, error: AgentError, ...rest: unknown[]) {
    this.notify({ message, level: 'error', error }, ...rest);
  }
}
