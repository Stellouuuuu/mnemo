export interface DocumentItem {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  createdAt: string;
}

export interface DocumentsListResponse {
  documents: DocumentItem[];
}
