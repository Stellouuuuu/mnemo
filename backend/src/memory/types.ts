export interface Memory {
  id: string;
  userId: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemoryInput {
  userId: string;
  key: string;
  value: string;
}

export interface MemoryCandidate {
  key: string;
  value: string;
}
