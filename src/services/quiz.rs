use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicI64, Ordering};
use crate::error::AppError;
use crate::models::*;

static QUIZ_COUNTER: AtomicI64 = AtomicI64::new(1);

pub fn generate_quiz(conn: &Connection, req: &GenerateQuizRequest) -> Result<Quiz, AppError> {
    let count = req.count.unwrap_or(20).min(50);
    let quiz_type = req.quiz_type.as_deref().unwrap_or("en2cn");

    let mut where_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref source) = req.source {
        where_clauses.push(format!("source = ?{}", param_values.len() + 1));
        param_values.push(Box::new(source.clone()));
    }

    let where_sql = if where_clauses.is_empty() { String::new() } else { format!("WHERE {}", where_clauses.join(" AND ")) };

    let query_sql = format!(
        "SELECT id, word, meaning_cn, meaning_en FROM words {} ORDER BY RANDOM() LIMIT ?{}",
        where_sql, param_values.len() + 1
    );

    #[allow(dead_code)]
    struct RawWord { id: i64, word: String, meaning_cn: Option<String>, meaning_en: Option<String> }

    let mut param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    param_refs.push(&count);

    let mut stmt = conn.prepare(&query_sql)?;
    let raw_words: Vec<RawWord> = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(RawWord { id: row.get(0)?, word: row.get(1)?, meaning_cn: row.get(2)?, meaning_en: row.get(3)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let distractor_sql = format!(
        "SELECT meaning_cn FROM words WHERE id != ?1 {} ORDER BY RANDOM() LIMIT 3",
        if let Some(ref source) = req.source { format!("AND source = '{}'", source) } else { String::new() }
    );

    let quiz_id = QUIZ_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut questions = Vec::new();

    for rw in &raw_words {
        let correct_answer = match quiz_type {
            "cn2en" => rw.word.clone(),
            "synonym" => rw.word.clone(),
            _ => rw.meaning_cn.clone().unwrap_or_default(),
        };

        let question_text = match quiz_type {
            "cn2en" => rw.meaning_cn.clone().unwrap_or_default(),
            "synonym" => rw.word.clone(),
            _ => rw.word.clone(),
        };

        let mut stmt2 = conn.prepare(&distractor_sql)?;
        let distractors: Vec<String> = stmt2.query_map(params![rw.id], |row| {
            let m: Option<String> = row.get(0)?;
            Ok(m.unwrap_or_default())
        })?.filter_map(|r| r.ok()).take(3).collect();

        let mut options = distractors;
        let correct_index = (rw.id % 4) as usize;
        options.insert(correct_index, correct_answer.clone());
        options.truncate(4);

        questions.push(QuizQuestion {
            word_id: rw.id,
            word: rw.word.clone(),
            question: question_text,
            options,
            correct_index,
        });
    }

    Ok(Quiz { id: quiz_id, questions })
}

pub fn submit_quiz(conn: &Connection, quiz: &Quiz, req: &SubmitQuizRequest) -> Result<QuizResult, AppError> {
    let mut details = Vec::new();
    let mut correct = 0u32;

    for answer in &req.answers {
        let question = quiz.questions.iter().find(|q| q.word_id == answer.word_id);
        let (is_correct, correct_answer) = match question {
            Some(q) => {
                let ca = q.options.get(q.correct_index).cloned().unwrap_or_default();
                let ok = answer.answer == ca;
                (ok, ca)
            }
            None => (false, String::new()),
        };

        if is_correct {
            correct += 1;
            let _ = super::review::submit_review(conn, answer.word_id, 5);
        } else {
            let _ = super::review::submit_review(conn, answer.word_id, 1);
        }

        let word_text = question.map(|q| q.word.clone()).unwrap_or_default();

        details.push(QuizResultItem {
            word_id: answer.word_id,
            word: word_text,
            correct: is_correct,
            correct_answer,
            user_answer: answer.answer.clone(),
        });
    }

    Ok(QuizResult {
        total: req.answers.len() as u32,
        correct,
        details,
    })
}
