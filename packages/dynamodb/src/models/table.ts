export interface Table {
  tableName?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}
export type KeySchema = { [key: string]: KeyAttributeType };
export type KeyAttributeType = "S" | "N" | "B";
