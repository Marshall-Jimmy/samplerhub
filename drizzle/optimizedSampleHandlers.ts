import { createSampleRepository, type SampleSearchFilters } from './sampleRepository';

interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, payload?: any) => unknown): void;
}

export interface SampleReadChannels {
  SEARCH_SAMPLES: string;
  GET_SAMPLES_PAGINATED: string;
  GET_SAMPLE_COUNT: string;
  GET_FAVORITES?: string;
  GET_RECENT?: string;
}

export interface RegisterSampleHandlersOptions {
  ipcMain: IpcMainLike;
  db: any;
  channels: SampleReadChannels;
  /** Override this when the project uses a different IPC envelope. */
  success?: (data: unknown) => unknown;
  failure?: (error: unknown) => unknown;
}

/**
 * Registers optimized read handlers while preserving the renderer's
 * { success, data, error } IPC envelope.
 *
 * Use this instead of handlers that call db.select().from(samples) for lists.
 */
export function registerOptimizedSampleReadHandlers(options: RegisterSampleHandlersOptions): void {
  const {
    ipcMain,
    db,
    channels,
    success = (data) => ({ success: true, data }),
    failure = (error) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  } = options;

  const repository = createSampleRepository(db);
  const wrap = (handler: (payload: any) => Promise<unknown>) => async (_event: unknown, payload?: any) => {
    try {
      return success(await handler(payload ?? {}));
    } catch (error) {
      return failure(error);
    }
  };

  ipcMain.handle(
    channels.SEARCH_SAMPLES,
    wrap((payload: SampleSearchFilters) => repository.search(payload)),
  );

  ipcMain.handle(
    channels.GET_SAMPLES_PAGINATED,
    wrap((payload: { offset?: number; limit?: number }) => repository.page(payload)),
  );

  ipcMain.handle(
    channels.GET_SAMPLE_COUNT,
    wrap(() => repository.count()),
  );

  if (channels.GET_FAVORITES) {
    // Legacy client expects Sample[]. Newer clients should use SEARCH_SAMPLES
    // with isFavorite=true to retain total/offset/limit metadata.
    ipcMain.handle(
      channels.GET_FAVORITES,
      wrap(async (payload: { offset?: number; limit?: number }) =>
        (await repository.favorites(payload)).items),
    );
  }

  if (channels.GET_RECENT) {
    // Preserve the existing Sample[] contract used by ipcClient.getRecent().
    ipcMain.handle(
      channels.GET_RECENT,
      wrap(async (payload: { offset?: number; limit?: number }) =>
        (await repository.recent(payload)).items),
    );
  }
}
