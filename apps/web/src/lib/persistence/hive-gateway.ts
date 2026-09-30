import type { SupabaseClient } from "@supabase/supabase-js";

export type HiveRow = Record<string, unknown>;

export type HiveGateway = {
  insert(table: string, row: HiveRow): Promise<void>;
  upsert(table: string, row: HiveRow, onConflict: string): Promise<void>;
  updateWhere(
    table: string,
    row: HiveRow,
    where: Record<string, string | number>,
  ): Promise<void>;
  selectWhere(
    table: string,
    where: Record<string, string | number>,
    options?: { orderBy?: string; ascending?: boolean; limit?: number },
  ): Promise<HiveRow[]>;
  uploadObject(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType?: string,
  ): Promise<void>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
  removeObject(bucket: string, path: string): Promise<void>;
};

function assertNoError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

export function createSupabaseHiveGateway(client: SupabaseClient): HiveGateway {
  return {
    async insert(table, row) {
      const { error } = await client.schema("hive").from(table).insert(row);
      assertNoError(error);
    },
    async upsert(table, row, onConflict) {
      const { error } = await client.schema("hive").from(table).upsert(row, { onConflict });
      assertNoError(error);
    },
    async updateWhere(table, row, where) {
      let query = client.schema("hive").from(table).update(row);
      for (const [column, value] of Object.entries(where)) {
        query = query.eq(column, value as string);
      }
      const { error } = await query;
      assertNoError(error);
    },
    async selectWhere(table, where, options) {
      let query = client.schema("hive").from(table).select("*");
      for (const [column, value] of Object.entries(where)) {
        query = query.eq(column, value as string);
      }
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? true });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      const { data, error } = await query;
      assertNoError(error);
      return (data ?? []) as HiveRow[];
    },
    async uploadObject(bucket, path, bytes, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType,
        upsert: false,
      });
      assertNoError(error);
    },
    async downloadObject(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      assertNoError(error);
      if (!data) {
        throw new Error("STORAGE_NOT_FOUND");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async removeObject(bucket, path) {
      const { error } = await client.storage.from(bucket).remove([path]);
      assertNoError(error);
    },
  };
}
