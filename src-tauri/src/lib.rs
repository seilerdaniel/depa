use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Nombre del archivo SQLite. Debe coincidir con `lib/sqlite.ts`.
const DB_NAME: &str = "depa_data.db";

/// Esquema inicial y migraciones incrementales.
/// NUNCA edites una migración ya publicada (`version: 1` o `version: 2`):
/// `sqlx` valida el checksum en `_sqlx_migrations` y rompería bases existentes.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
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
        Migration {
            version: 2,
            description: "create_savings_goals",
            sql: "CREATE TABLE IF NOT EXISTS savings_goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, targetAmount REAL NOT NULL DEFAULT 0, currentAmount REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT 'accent', deadline TEXT, createdAt INTEGER NOT NULL);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_app_prefs_and_indexes",
            sql: "
      CREATE INDEX IF NOT EXISTS idx_goals_created ON savings_goals(createdAt DESC);
      CREATE TABLE IF NOT EXISTS app_prefs (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_item_options",
            sql: "ALTER TABLE items ADD COLUMN options TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_account_credit_card_dates",
            sql: "
      ALTER TABLE accounts ADD COLUMN closingDay INTEGER;
      ALTER TABLE accounts ADD COLUMN dueDay INTEGER;
    ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_recurring_expenses",
            sql: "
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Servicios',
        amount REAL NOT NULL DEFAULT 0,
        dueDay INTEGER NOT NULL DEFAULT 10,
        frequency TEXT NOT NULL DEFAULT 'mensual',
        accountId TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        lastPaidMonth TEXT,
        notes TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_expenses(dueDay ASC);
    ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_multicurrency_support",
            sql: "
      ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS';
      ALTER TABLE items ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS';
      ALTER TABLE recurring_expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS';
      ALTER TABLE recurring_expenses ADD COLUMN taxPercent REAL NOT NULL DEFAULT 0;
    ",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Sistema de archivos: necesario para guardar las fotos en
        // `%LOCALAPPDATA%/<app>/images/` en lugar de inflar SQLite con Base64.
        .plugin(tauri_plugin_fs::init())
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
