use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use crate::config::Config;

pub type Db = Arc<Mutex<Connection>>;

pub fn init_connection(config: &Config) -> Result<Db, rusqlite::Error> {
    let conn = Connection::open(&config.db_path)?;
    conn.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;")?;
    Ok(Arc::new(Mutex::new(conn)))
}
