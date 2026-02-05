export interface Annotation {
  id: number;
  page: number; // 1-indexed
  x: number;
  y: number;
  content: string;
  isNew?: boolean;
  fontSize?: number;
}

export interface SearchResult {
  page: number;
  matchIndex: number;
  context: string;
}

export type SidebarTab = "thumbs" | "outline" | "annots" | "search";