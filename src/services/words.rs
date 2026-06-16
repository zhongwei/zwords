use rusqlite::{params, Connection};
use crate::error::AppError;
use crate::models::*;

pub fn list_words(conn: &Connection, query: &ListWordsQuery) -> Result<(Vec<Word>, u32), AppError> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(100);
    let offset = (page - 1) * per_page;

    let mut where_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref source) = query.source {
        where_clauses.push(format!("w.source = ?{}", param_values.len() + 1));
        param_values.push(Box::new(source.clone()));
    }
    if let Some(ref status) = query.status {
        where_clauses.push(format!("ls.status = ?{}", param_values.len() + 1));
        param_values.push(Box::new(status.clone()));
    }
    if let Some(stage) = query.stage {
        where_clauses.push(format!("w.stage = ?{}", param_values.len() + 1));
        param_values.push(Box::new(stage));
    }
    if let Some(ref q) = query.q {
        where_clauses.push(format!("w.word LIKE ?{}", param_values.len() + 1));
        param_values.push(Box::new(format!("%{}%", q)));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!(
        "SELECT COUNT(*) FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id {}",
        where_sql
    );
    let total: u32 = conn.query_row(&count_sql, param_values.iter().map(|p| p.as_ref()).collect::<Vec<_>>().as_slice(), |row| row.get(0))?;

    let query_sql = format!(
        "SELECT w.id, w.word, w.source, w.stage, w.phonetic, w.pos, w.meaning_cn, w.meaning_en, w.root, w.association, w.collocations, w.derivatives, w.\"references\", \
         w.audio_uk IS NOT NULL AS has_audio_uk, w.audio_us IS NOT NULL AS has_audio_us \
         FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id \
         {} ORDER BY w.id LIMIT ?{} OFFSET ?{}",
        where_sql, param_values.len() + 1, param_values.len() + 2
    );

    let mut param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    param_refs.push(&per_page);
    param_refs.push(&offset);

    let mut stmt = conn.prepare(&query_sql)?;
    let words = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Word {
            id: row.get(0)?,
            word: row.get(1)?,
            source: row.get(2)?,
            stage: row.get(3)?,
            phonetic: row.get(4)?,
            pos: row.get(5)?,
            meaning_cn: row.get(6)?,
            meaning_en: row.get(7)?,
            root: row.get(8)?,
            association: row.get(9)?,
            collocations: row.get(10)?,
            derivatives: row.get(11)?,
            references: row.get(12)?,
            has_audio_uk: row.get(13)?,
            has_audio_us: row.get(14)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok((words, total))
}

pub fn get_word(conn: &Connection, id: i64) -> Result<WordDetail, AppError> {
    let word = conn.query_row(
        "SELECT id, word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, \"references\", audio_uk IS NOT NULL AS has_audio_uk, audio_us IS NOT NULL AS has_audio_us FROM words WHERE id = ?1",
        params![id],
        |row| Ok(Word {
            id: row.get(0)?,
            word: row.get(1)?,
            source: row.get(2)?,
            stage: row.get(3)?,
            phonetic: row.get(4)?,
            pos: row.get(5)?,
            meaning_cn: row.get(6)?,
            meaning_en: row.get(7)?,
            root: row.get(8)?,
            association: row.get(9)?,
            collocations: row.get(10)?,
            derivatives: row.get(11)?,
            references: row.get(12)?,
            has_audio_uk: row.get(13)?,
            has_audio_us: row.get(14)?,
        }),
    ).map_err(|_| AppError::NotFound(format!("Word {} not found", id)))?;

    let mut stmt = conn.prepare("SELECT id, word_id, sentence, translation FROM examples WHERE word_id = ?1")?;
    let examples = stmt.query_map(params![id], |row| {
        Ok(Example { id: row.get(0)?, word_id: row.get(1)?, sentence: row.get(2)?, translation: row.get(3)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare("SELECT id, word_id, synonym FROM synonyms WHERE word_id = ?1")?;
    let synonyms = stmt.query_map(params![id], |row| {
        Ok(Synonym { id: row.get(0)?, word_id: row.get(1)?, synonym: row.get(2)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let learning_status = conn.query_row(
        "SELECT id, word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days FROM learning_status WHERE word_id = ?1",
        params![id],
        |row| Ok(LearningStatus {
            id: row.get(0)?,
            word_id: row.get(1)?,
            status: row.get(2)?,
            review_count: row.get(3)?,
            correct_count: row.get(4)?,
            last_reviewed_at: row.get(5)?,
            next_review_at: row.get(6)?,
            ease_factor: row.get(7)?,
            interval_days: row.get(8)?,
        }),
    ).ok();

    Ok(WordDetail { word, examples, synonyms, learning_status })
}

pub fn create_word(conn: &Connection, req: &CreateWordRequest) -> Result<Word, AppError> {
    conn.execute(
        "INSERT INTO words (word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, \"references\") VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![req.word, req.source, req.stage, req.phonetic, req.pos, req.meaning_cn, req.meaning_en, req.root, req.association, req.collocations, req.derivatives, req.references],
    )?;
    let id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO learning_status (word_id) VALUES (?1)",
        params![id],
    ).ok();

    get_word(conn, id).map(|d| d.word)
}

pub fn update_word(conn: &Connection, id: i64, req: &UpdateWordRequest) -> Result<Word, AppError> {
    let existing = get_word(conn, id)?.word;

    conn.execute(
        "UPDATE words SET stage = ?1, phonetic = ?2, pos = ?3, meaning_cn = ?4, meaning_en = ?5, root = ?6, association = ?7, collocations = ?8, derivatives = ?9, \"references\" = ?10 WHERE id = ?11",
        params![
            req.stage.unwrap_or(existing.stage.unwrap_or(0)),
            req.phonetic.as_ref().or(existing.phonetic.as_ref()),
            req.pos.as_ref().or(existing.pos.as_ref()),
            req.meaning_cn.as_ref().or(existing.meaning_cn.as_ref()),
            req.meaning_en.as_ref().or(existing.meaning_en.as_ref()),
            req.root.as_ref().or(existing.root.as_ref()),
            req.association.as_ref().or(existing.association.as_ref()),
            req.collocations.as_ref().or(existing.collocations.as_ref()),
            req.derivatives.as_ref().or(existing.derivatives.as_ref()),
            req.references.as_ref().or(existing.references.as_ref()),
            id,
        ],
    )?;

    get_word(conn, id).map(|d| d.word)
}

pub fn delete_word(conn: &Connection, id: i64) -> Result<(), AppError> {
    let rows = conn.execute("DELETE FROM words WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("Word {} not found", id)));
    }
    Ok(())
}

pub fn get_word_audio(
    conn: &Connection,
    id: i64,
    variant: &str,
) -> Result<Option<Vec<u8>>, AppError> {
    // Column name is selected from a fixed allow-list (not user input), so dynamic
    // SQL string interpolation here is safe from injection.
    let column = match variant {
        "uk" => "audio_uk",
        "us" => "audio_us",
        _ => return Err(AppError::NotFound(format!("Unknown audio variant: {}", variant))),
    };
    let sql = format!("SELECT {} FROM words WHERE id = ?1", column);
    match conn.query_row(&sql, params![id], |row| row.get::<_, Option<Vec<u8>>>(0)) {
        Ok(blob) => Ok(blob),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("Word {} not found", id)))
        }
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE words (id INTEGER PRIMARY KEY, word TEXT, audio_uk BLOB, audio_us BLOB)",
        )
        .unwrap();
        conn
    }

    #[test]
    fn audio_returns_blob_when_present() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'abandon', X'DEADBEEF', NULL)",
            [],
        )
        .unwrap();
        let bytes = get_word_audio(&conn, 1, "uk").unwrap().unwrap();
        assert_eq!(bytes, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn audio_returns_none_when_blob_is_null() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'x', NULL, NULL)",
            [],
        )
        .unwrap();
        assert_eq!(get_word_audio(&conn, 1, "us").unwrap(), None);
    }

    #[test]
    fn audio_missing_word_is_not_found_error() {
        let conn = setup_db();
        let err = get_word_audio(&conn, 999, "uk").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn audio_invalid_variant_is_not_found_error() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'x', NULL, NULL)",
            [],
        )
        .unwrap();
        let err = get_word_audio(&conn, 1, "foo").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
