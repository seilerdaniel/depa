export type Priority = 'urgente' | 'media' | 'baja';
export type StatusFilter = 'todos' | 'pendientes' | 'comprados';
export type SortMode = 'prioridad' | 'precio-desc' | 'precio-asc' | 'nombre' | 'manual';
export type View = 'list' | 'wishlist' | 'moodboard' | 'dashboard' | 'history';
export type ViewMode = 'grid' | 'table';

export interface Dimensions {
  height: number | null;
  width: number | null;
  depth: number | null;
}

export interface Installments {
  count: number;
  amount: number;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  priority: Priority;
  bought: boolean;
  wishlist: boolean;
  createdAt: number;
  purchaseUrl: string;
  imageUrl: string;
  imageData: string;
  storeName: string;
  storeLocation: string;
  dimensions: Dimensions | null;
  installments: Installments | null;
  purchaseMonth: string | null;
  notes: string;
}

export interface Prefs {
  sort: SortMode;
  category: string;
  subcategory: string;
  status: StatusFilter;
  budget: number | null;
  wishlistSort: SortMode;
  wishlistCategory: string;
  wishlistSubcategory: string;
  viewMode: ViewMode;
  search: string;
}