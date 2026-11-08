export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoriesListResponse {
  memories: MemoryItem[];
}
