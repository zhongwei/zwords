use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::Response;
use axum::Json;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

pub async fn list_words(
    State(db): State<Db>,
    Query(query): Query<ListWordsQuery>,
) -> Result<Json<PaginatedResponse<Word>>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let (words, total) = services::words::list_words(&conn, &query)?;
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(50);
    Ok(Json(PaginatedResponse { data: words, meta: PaginationMeta { page, per_page, total } }))
}

pub async fn get_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
) -> Result<Json<WordDetail>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let detail = services::words::get_word(&conn, id)?;
    Ok(Json(detail))
}

pub async fn create_word(
    State(db): State<Db>,
    Json(req): Json<CreateWordRequest>,
) -> Result<Json<Word>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let word = services::words::create_word(&conn, &req)?;
    Ok(Json(word))
}

pub async fn update_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateWordRequest>,
) -> Result<Json<Word>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let word = services::words::update_word(&conn, id, &req)?;
    Ok(Json(word))
}

pub async fn delete_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    services::words::delete_word(&conn, id)?;
    Ok(Json(serde_json::json!({"deleted": true})))
}

pub async fn get_word_audio(
    State(db): State<Db>,
    Path((id, variant)): Path<(i64, String)>,
) -> Result<Response, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let blob = services::words::get_word_audio(&conn, id, &variant)?;
    match blob {
        Some(bytes) => {
            let len = bytes.len();
            let mut resp = Response::new(Body::from(bytes));
            resp.headers_mut()
                .insert(header::CONTENT_TYPE, "audio/ogg".parse().unwrap());
            resp.headers_mut()
                .insert(header::CONTENT_LENGTH, len.to_string().parse().unwrap());
            Ok(resp)
        }
        None => Err(AppError::NotFound(format!(
            "Audio '{}' for word {} not found",
            variant, id
        ))),
    }
}
