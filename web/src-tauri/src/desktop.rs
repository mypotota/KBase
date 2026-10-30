use crate::files;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Serialize, Deserialize)]
struct Root {
    id: String,
    name: String,
    path: String,
    native: bool,
}
struct Roots {
    values: Mutex<HashMap<String, Root>>,
    file: PathBuf,
}
fn root_path(state: &Roots, id: &str) -> Result<PathBuf, String> {
    state
        .values
        .lock()
        .map_err(|_| "LOCK_ERROR")?
        .get(id)
        .map(|r| PathBuf::from(&r.path))
        .ok_or("UNKNOWN_ROOT: choose a folder first".into())
}
#[tauri::command]
fn known_roots(state: State<'_, Roots>) -> Result<Vec<Root>, String> {
    Ok(state
        .values
        .lock()
        .map_err(|_| "LOCK_ERROR")?
        .values()
        .cloned()
        .collect())
}
#[tauri::command]
async fn choose_root(
    app: tauri::AppHandle,
    create_name: Option<String>,
) -> Result<Option<Root>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = app
            .dialog()
            .file()
            .set_title("选择知识库文件夹")
            .blocking_pick_folder();
        let Some(folder) = folder else {
            return Ok(None);
        };
        let mut path = folder.into_path().map_err(|e| e.to_string())?;
        if let Some(name) = create_name {
            if name.is_empty()
                || name.starts_with('.')
                || name.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*'])
                || name.chars().any(|c| c.is_control())
            {
                return Err("INVALID_NAME: invalid folder name".into());
            }
            path = files::scoped(&path, &name)?;
            fs::create_dir(&path).map_err(|e| e.to_string())?;
        }
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let state = app.state::<Roots>();
        let mut values = state.values.lock().map_err(|_| "LOCK_ERROR")?;
        if let Some(root) = values.values().find(|r| PathBuf::from(&r.path) == path) {
            return Ok(Some(root.clone()));
        }
        let root = Root {
            id: uuid::Uuid::new_v4().to_string(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            path: path.to_string_lossy().into(),
            native: true,
        };
        let mut next = values.clone();
        next.insert(root.id.clone(), root.clone());
        let data = serde_json::to_vec(&next).map_err(|e| e.to_string())?;
        let parent = state
            .file
            .parent()
            .ok_or("IO_ERROR: no configuration parent")?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        use std::io::Write;
        temp.write_all(&data).map_err(|e| e.to_string())?;
        temp.persist(&state.file).map_err(|e| e.to_string())?;
        *values = next;
        Ok(Some(root))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_entries(
    state: State<'_, Roots>,
    root_id: String,
    path: String,
) -> Result<Vec<files::Entry>, String> {
    files::list(&root_path(&state, &root_id)?, &path)
}
#[tauri::command]
async fn read_file(
    state: State<'_, Roots>,
    root_id: String,
    path: String,
) -> Result<Vec<u8>, String> {
    files::read(&root_path(&state, &root_id)?, &path)
}
#[tauri::command]
async fn write_file(
    state: State<'_, Roots>,
    root_id: String,
    path: String,
    bytes: Vec<u8>,
    expected_hash: Option<String>,
    check_expected: bool,
) -> Result<(), String> {
    files::write(
        &root_path(&state, &root_id)?,
        &path,
        &bytes,
        expected_hash.as_deref(),
        check_expected,
    )
}
#[tauri::command]
async fn create_directory(
    state: State<'_, Roots>,
    root_id: String,
    path: String,
) -> Result<(), String> {
    files::mkdir(&root_path(&state, &root_id)?, &path)
}
#[tauri::command]
async fn remove_file(state: State<'_, Roots>, root_id: String, path: String) -> Result<(), String> {
    files::remove(&root_path(&state, &root_id)?, &path)
}
#[tauri::command]
async fn move_directory(
    state: State<'_, Roots>,
    root_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    files::move_directory(&root_path(&state, &root_id)?, &from, &to)
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let folder = app.path().app_data_dir()?;
            fs::create_dir_all(&folder)?;
            let file = folder.join("approved-roots.json");
            let values: HashMap<String, Root> = match fs::read(&file) {
                Ok(bytes) => serde_json::from_slice(&bytes)?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
                Err(e) => return Err(e.into()),
            };
            app.manage(Roots {
                values: Mutex::new(values),
                file,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            known_roots,
            choose_root,
            list_entries,
            read_file,
            write_file,
            create_directory,
            remove_file,
            move_directory
        ])
        .run(tauri::generate_context!())
        .expect("cannot start KBase");
}
