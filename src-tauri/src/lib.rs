use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Nombre del archivo SQLite. Debe coincidir con `lib/sqlite.ts`.
const DB_NAME: &str = "depa_data.db";

/// Esquema inicial. Refleja exactamente los `CREATE TABLE` de `lib/sqlite.ts`
/// para que una instalación nueva quede igual sin importar quién la cree.
///
/// NUNCA edites una migración ya publicada: agrega una nueva versión.
fn migrations() -> Vec<Migration> {
  vec![Migration {
    version: 1,
    description: "create_initial_tables",
    sql: "
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        subcategory TEXT,
        price REAL,
        priority TEXT,
        bought INTEGER,
        wishlist INTEGER,
        createdAt INTEGER,
        purchaseUrl TEXT,
        imageUrl TEXT,
        imageData TEXT,
        storeName TEXT,
        storeLocation TEXT,
        dimensions TEXT,
        installments TEXT,
        purchaseMonth TEXT,
        notes TEXT,
        brand TEXT,
        model TEXT,
        color TEXT,
        warranty TEXT,
        orderNumber TEXT
      );
      CREATE TABLE IF NOT EXISTS categories (name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        balance REAL,
        color TEXT,
        createdAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        accountId TEXT,
        destinationAccountId TEXT,
        type TEXT,
        amount REAL,
        date INTEGER,
        category TEXT,
        notes TEXT,
        linkedItemId TEXT
      );
    ",
    kind: MigrationKind::Up,
  },
  // Siempre una migración NUEVA: `sqlx` guarda un checksum por versión y
  // editar la v1 rompería las bases ya instaladas.
  Migration {
    version: 2,
    description: "create_savings_goals",
    sql: "CREATE TABLE IF NOT EXISTS savings_goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, targetAmount REAL NOT NULL DEFAULT 0, currentAmount REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT 'accent', deadline TEXT, createdAt INTEGER NOT NULL);",
    kind: MigrationKind::Up,
  }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // La URL de migración debe ser byte a byte igual a la que usa
      // `lib/sqlite.ts`, porque plugin-sql busca las migraciones por la cadena
      // exacta recibida en `Database.load`. En Windows `Path::display()` usa
      // `\`, así que normalizamos a `/` igual que el lado JavaScript.
      let db_path = app.path().app_local_data_dir()?.join(DB_NAME);
      let db_url = format!("sqlite:{}", db_path.to_string_lossy().replace('\\', "/"));

      // plugin-sql sólo hace `create_dir_all` sobre `app_config_dir`, no sobre
      // `app_local_data_dir`. Si el directorio no existe, SQLite no puede crear
      // el archivo y falla con "unable to open database file".
      if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
      }

      app.handle().plugin(
        tauri_plugin_sql::Builder::default()
          .add_migrations(&db_url, migrations())
          .build(),
      )?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
