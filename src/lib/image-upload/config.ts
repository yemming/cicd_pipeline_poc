import "server-only";

import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";

export type EntityKey =
  | "item"
  | "new-car"
  | "used-car"
  | "customer"
  | "employee"
  | "repair-order";

export type EntityConfig = {
  table: string;
  column: string;
  mode: "single" | "multi";
  permission: PermissionCode;
  /** Supabase Storage bucket name */
  bucket: string;
  maxImages?: number;
  revalidate: (id: string) => string[];
};

export const DEFAULT_ENTITY_BUCKET = "entity-images";
export const ENTITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ENTITY_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ENTITY_CONFIGS: Record<EntityKey, EntityConfig> = {
  item: {
    table: "items",
    column: "image_url",
    mode: "single",
    permission: PERMISSIONS.ITEM_EDIT,
    bucket: "parts-images",
    revalidate: (id) => [
      `/parts/setup/items/${id}`,
      "/parts/setup/items",
    ],
  },
  "new-car": {
    table: "new_car_inventory",
    column: "images",
    mode: "multi",
    permission: PERMISSIONS.SALES_ORDER_EDIT,
    bucket: DEFAULT_ENTITY_BUCKET,
    maxImages: 12,
    revalidate: (id) => [
      `/sales/showroom/new-cars/${id}`,
      "/sales/showroom/new-cars",
    ],
  },
  "used-car": {
    table: "used_car_inventory",
    column: "images",
    mode: "multi",
    permission: PERMISSIONS.SALES_ORDER_EDIT,
    bucket: DEFAULT_ENTITY_BUCKET,
    maxImages: 12,
    revalidate: (id) => [
      `/sales/showroom/used-cars/${id}`,
      "/sales/showroom/used-cars",
    ],
  },
  customer: {
    table: "customers",
    column: "avatar_url",
    mode: "single",
    permission: PERMISSIONS.CUSTOMER_EDIT,
    bucket: DEFAULT_ENTITY_BUCKET,
    revalidate: (id) => [
      `/parts/aftersales/customers/${id}`,
      `/admin/master-data/customers/${id}`,
      "/parts/aftersales/customers",
    ],
  },
  employee: {
    table: "employees",
    column: "avatar_url",
    mode: "single",
    permission: PERMISSIONS.EMPLOYEE_EDIT,
    bucket: DEFAULT_ENTITY_BUCKET,
    revalidate: (id) => [
      `/admin/master-data/employees/${id}`,
      "/admin/master-data/employees",
    ],
  },
  "repair-order": {
    table: "repair_orders",
    column: "images",
    mode: "multi",
    permission: PERMISSIONS.RO_CREATE,
    bucket: DEFAULT_ENTITY_BUCKET,
    maxImages: 20,
    revalidate: (id) => [
      `/service/workorders/${id}`,
      "/service/workorders",
    ],
  },
};
