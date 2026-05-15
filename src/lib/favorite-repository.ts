export type FavoriteRepository = {
  getSnapshot(): ReadonlySet<string>;
  getServerSnapshot(): ReadonlySet<string>;
  getErrorSnapshot(): string | null;
  getServerErrorSnapshot(): null;
  getLoadErrorSnapshot(): string | null;
  getServerLoadErrorSnapshot(): null;
  toggle(gymId: string): void;
  subscribe(listener: () => void): () => void;
};
