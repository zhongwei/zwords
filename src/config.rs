use std::env;

pub struct Config {
    pub host: String,
    pub port: u16,
    pub db_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("MYWORDS_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("MYWORDS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            db_path: env::var("MYWORDS_DB_PATH").unwrap_or_else(|_| "./words.db".into()),
        }
    }
}
