use rusqlite::{params, Connection};
use crate::error::AppError;
use crate::models::*;

pub fn submit_typing_result(conn: &Connection, req: &TypingResultRequest) -> Result<TypingResultResponse, AppError> {
    let now = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Iso8601::DEFAULT)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut updated = 0u32;

    for r in &req.results {
        let existing = conn.query_row(
            "SELECT id FROM learning_status WHERE word_id = ?1",
            params![r.word_id],
            |row| row.get::<_, i64>(0),
        );

        match existing {
            Ok(_) => {
                conn.execute(
                    "UPDATE learning_status SET review_count = review_count + 1, correct_count = correct_count + ?1, last_reviewed_at = ?2 WHERE word_id = ?3",
                    params![if r.correct { 1 } else { 0 }, now, r.word_id],
                )?;
                updated += 1;
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                conn.execute(
                    "INSERT INTO learning_status (word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days) VALUES (?1, 'new', 1, ?2, ?3, ?3, 2.5, 0)",
                    params![r.word_id, if r.correct { 1 } else { 0 }, now],
                )?;
                updated += 1;
            }
            Err(e) => return Err(AppError::Internal(e.to_string())),
        }
    }

    Ok(TypingResultResponse { updated })
}
