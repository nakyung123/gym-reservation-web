export type FavoriteRepository = {
  getSnapshot(): ReadonlySet<string>;
  getServerSnapshot(): ReadonlySet<string>;
  toggle(gymId: string): void;
  subscribe(listener: () => void): () => void;
};
