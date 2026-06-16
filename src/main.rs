mod config;
mod db;
mod error;
mod handlers;
mod models;
mod services;
mod static_files;

use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cfg = config::Config::from_env();
    let pool = db::init_connection(&cfg).expect("Failed to connect to database");

    let app = Router::new()
        .route("/api/words", get(handlers::words::list_words).post(handlers::words::create_word))
        .route("/api/words/{id}", get(handlers::words::get_word).put(handlers::words::update_word).delete(handlers::words::delete_word))
        .route("/api/words/{id}/audio/{variant}", get(handlers::words::get_word_audio))
        .route("/api/review/next", get(handlers::review::get_next_review))
        .route("/api/review/{word_id}/answer", post(handlers::review::submit_review))
        .route("/api/quiz/generate", post(handlers::quiz::generate_quiz))
        .route("/api/quiz/{id}/submit", post(handlers::quiz::submit_quiz))
        .route("/api/typing/result", post(handlers::typing::submit_typing_result))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .fallback(static_files::static_handler)
        .with_state(pool);

    let addr = format!("{}:{}", cfg.host, cfg.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        eprintln!("Failed to bind {}: {}", addr, e);
        std::process::exit(1);
    });
    tracing::info!("Server running on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
