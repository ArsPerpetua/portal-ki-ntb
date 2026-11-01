import type { PoolClient } from 'pg';

export async function logAudit(
  client: PoolClient,
  actorId: string | null,
  action: string,
  objectType: string,
  objectId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, object_type, object_id, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, objectType, objectId, JSON.stringify(metadata)],
  );
}
