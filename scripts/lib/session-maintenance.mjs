// One bounded batch, using the database clock. No valid sessions or audit rows are touched.
export async function cleanupExpiredSessions(sql) {
  const [result] =
    await sql`WITH expired AS (SELECT id FROM sessions WHERE expires_at <= now() ORDER BY expires_at LIMIT 5000 FOR UPDATE SKIP LOCKED), removed AS (DELETE FROM sessions USING expired WHERE sessions.id = expired.id RETURNING sessions.id) SELECT count(*)::int AS count FROM removed`;
  return result.count;
}
