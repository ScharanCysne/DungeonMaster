// The plugin's optional ws typings are not installed; keep our transport surface explicit.
export interface ServerSocket {
  readonly readyState: number;
  readonly OPEN: number;
  send(text: string): void;
  ping(): void;
  terminate(): void;
  close(code: number, reason: string): void;
  on(
    event: 'message',
    listener: (data: Buffer | ArrayBuffer | Buffer[], binary: boolean) => void,
  ): void;
  on(event: 'pong' | 'error', listener: () => void): void;
  once(event: 'close', listener: () => void): void;
}
