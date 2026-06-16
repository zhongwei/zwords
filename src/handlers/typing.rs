use axum::extract::State;
use axum::Json;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

pub async fn submit_typing_result(
    State(db): State<Db>,
    Json(req): Json<TypingResultRequest>,
) -> Result<Json<TypingResultResponse>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let result = services::typing::submit_typing_result(&conn, &req)?;
    Ok(Json(result))
}
