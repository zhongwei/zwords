use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Word {
    pub id: i64,
    pub word: String,
    pub source: String,
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
    pub has_audio_uk: bool,
    pub has_audio_us: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Example {
    pub id: i64,
    pub word_id: i64,
    pub sentence: String,
    pub translation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Synonym {
    pub id: i64,
    pub word_id: i64,
    pub synonym: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LearningStatus {
    pub id: i64,
    pub word_id: i64,
    pub status: String,
    pub review_count: i32,
    pub correct_count: i32,
    pub last_reviewed_at: Option<String>,
    pub next_review_at: Option<String>,
    pub ease_factor: f64,
    pub interval_days: i32,
}

#[derive(Debug, Serialize)]
pub struct WordDetail {
    pub word: Word,
    pub examples: Vec<Example>,
    pub synonyms: Vec<Synonym>,
    pub learning_status: Option<LearningStatus>,
}

#[derive(Debug, Deserialize)]
pub struct ListWordsQuery {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub source: Option<String>,
    pub status: Option<String>,
    pub stage: Option<i32>,
    pub q: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub meta: PaginationMeta,
}

#[derive(Debug, Serialize)]
pub struct PaginationMeta {
    pub page: u32,
    pub per_page: u32,
    pub total: u32,
}

#[derive(Debug, Deserialize)]
pub struct CreateWordRequest {
    pub word: String,
    pub source: String,
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWordRequest {
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewAnswerRequest {
    pub quality: u32,
}

#[derive(Debug, Deserialize)]
pub struct GenerateQuizRequest {
    pub count: Option<u32>,
    pub source: Option<String>,
    #[serde(rename = "type")]
    pub quiz_type: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct QuizQuestion {
    pub word_id: i64,
    pub word: String,
    pub question: String,
    pub options: Vec<String>,
    pub correct_index: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct Quiz {
    pub id: i64,
    pub questions: Vec<QuizQuestion>,
}

#[derive(Debug, Deserialize)]
pub struct QuizAnswer {
    pub word_id: i64,
    pub answer: String,
}

#[derive(Debug, Deserialize)]
pub struct SubmitQuizRequest {
    pub answers: Vec<QuizAnswer>,
}

#[derive(Debug, Serialize)]
pub struct QuizResult {
    pub total: u32,
    pub correct: u32,
    pub details: Vec<QuizResultItem>,
}

#[derive(Debug, Serialize)]
pub struct QuizResultItem {
    pub word_id: i64,
    pub word: String,
    pub correct: bool,
    pub correct_answer: String,
    pub user_answer: String,
}
