use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

fn error(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        format!("NOT_FOUND: {e}")
    } else {
        format!("IO_ERROR: {e}")
    }
}
pub fn scoped(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty()
        || relative.contains('\\')
        || relative.chars().any(|c| c.is_control())
        || relative
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("INVALID_PATH: invalid relative path".into());
    }
    let input = Path::new(relative);
    if input
        .components()
        .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err("INVALID_PATH: path traversal".into());
    }
    let root = root.canonicalize().map_err(error)?;
    let mut path = root.clone();
    for part in input.components() {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("INVALID_PATH: symlinks are not permitted".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(error(e)),
        }
    }
    if !path.starts_with(root) {
        return Err("INVALID_PATH: outside root".into());
    }
    Ok(path)
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read(root: &Path, path: &str) -> Result<Vec<u8>, String> {
    fs::read(scoped(root, path)?).map_err(error)
}
pub fn write(
    root: &Path,
    path: &str,
    bytes: &[u8],
    expected: Option<&str>,
    check: bool,
) -> Result<(), String> {
    let target = scoped(root, path)?;
    if check {
        let current = match fs::read(&target) {
            Ok(v) => Some(hash(&v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(error(e)),
        };
        if current.as_deref() != expected {
            return Err("FileChangedError: file changed outside KBase".into());
        }
    }
    let parent = target.parent().ok_or("INVALID_PATH: no parent")?;
    fs::create_dir_all(parent).map_err(error)?;
    // Revalidate after creating directories. All app writes use the same scoped filesystem API.
    scoped(root, path)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    if let Ok(meta) = fs::metadata(&target) {
        temporary
            .as_file()
            .set_permissions(meta.permissions())
            .map_err(error)?;
    }
    temporary.write_all(bytes).map_err(error)?;
    temporary.as_file().sync_all().map_err(error)?;
    if check {
        let current = match fs::read(&target) {
            Ok(v) => Some(hash(&v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(error(e)),
        };
        if current.as_deref() != expected {
            return Err("FileChangedError: file changed outside KBase".into());
        }
    }
    temporary.persist(&target).map_err(|e| error(e.error))?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(error)?;
    Ok(())
}
#[derive(Serialize)]
pub struct Entry {
    path: String,
    kind: &'static str,
    size: u64,
    modified: u64,
}
pub fn list(root: &Path, relative: &str) -> Result<Vec<Entry>, String> {
    let directory = if relative.is_empty() {
        root.canonicalize().map_err(error)?
    } else {
        scoped(root, relative)?
    };
    let mut result = Vec::new();
    for item in fs::read_dir(directory).map_err(error)? {
        let item = item.map_err(error)?;
        let name = item
            .file_name()
            .into_string()
            .map_err(|_| "INVALID_NAME: non-UTF8 filename")?;
        if name.starts_with('.') {
            continue;
        }
        let metadata = fs::symlink_metadata(item.path()).map_err(error)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let path = if relative.is_empty() {
            name
        } else {
            format!("{relative}/{name}")
        };
        if metadata.is_dir() {
            result.push(Entry {
                path: path.clone(),
                kind: "directory",
                size: 0,
                modified: 0,
            });
            result.extend(list(root, &path)?);
        } else if metadata.is_file() {
            result.push(Entry {
                path,
                kind: "file",
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|v| v.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|v| v.as_millis() as u64)
                    .unwrap_or(0),
            });
        }
    }
    Ok(result)
}
pub fn mkdir(root: &Path, path: &str) -> Result<(), String> {
    fs::create_dir(scoped(root, path)?).map_err(error)
}
pub fn remove(root: &Path, path: &str) -> Result<(), String> {
    fs::remove_file(scoped(root, path)?).map_err(error)
}
pub fn move_directory(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let source = scoped(root, from)?;
    let target = scoped(root, to)?;
    if !source.is_dir() {
        return Err("NOT_FOUND: project folder does not exist".into());
    }
    if target.exists() {
        return Err("ALREADY_EXISTS: destination exists".into());
    }
    if target.starts_with(&source) {
        return Err("INVALID_PATH: cannot move a folder into itself".into());
    }
    fs::create_dir_all(target.parent().ok_or("INVALID_PATH")?).map_err(error)?;
    scoped(root, to)?;
    fs::rename(source, target).map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn files_are_real_markdown_and_survive_reopening() {
        let dir = tempfile::tempdir().unwrap();
        mkdir(dir.path(), "项目").unwrap();
        write(
            dir.path(),
            "项目/笔记.md",
            "# 标题\n\n本地文件。\n".as_bytes(),
            None,
            true,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("项目/笔记.md")).unwrap(),
            "# 标题\n\n本地文件。\n"
        );
        let expected = hash(&read(dir.path(), "项目/笔记.md").unwrap());
        fs::write(dir.path().join("项目/笔记.md"), "Agent 在外部修改").unwrap();
        assert!(write(
            dir.path(),
            "项目/笔记.md",
            b"overwrite",
            Some(&expected),
            true
        )
        .unwrap_err()
        .starts_with("FileChangedError"));
        assert_eq!(
            read(dir.path(), "项目/笔记.md").unwrap(),
            "Agent 在外部修改".as_bytes()
        );
        assert_eq!(list(dir.path(), "").unwrap().len(), 2);
        assert!(write(dir.path(), "项目/笔记.md", b"duplicate", None, true).is_err());
    }
    #[test]
    fn project_rename_and_trash_keep_real_markdown_and_hidden_files() {
        let dir = tempfile::tempdir().unwrap();
        mkdir(dir.path(), "Project").unwrap();
        write(dir.path(), "Project/note.md", b"# Note", None, true).unwrap();
        write(dir.path(), "Project/.config", b"hidden", None, true).unwrap();
        move_directory(dir.path(), "Project", "Renamed").unwrap();
        assert!(!dir.path().join("Project").exists());
        move_directory(dir.path(), "Renamed", ".kbase/trash/id/Renamed").unwrap();
        assert_eq!(
            read(dir.path(), ".kbase/trash/id/Renamed/note.md").unwrap(),
            b"# Note"
        );
        move_directory(dir.path(), ".kbase/trash/id/Renamed", "Renamed").unwrap();
        assert_eq!(read(dir.path(), "Renamed/.config").unwrap(), b"hidden");
        assert!(move_directory(dir.path(), "Renamed", "Renamed/inside").is_err());
    }
    #[test]
    fn traversal_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        for path in [
            "../escape",
            "/etc/passwd",
            "a/../b",
            "a\\b",
            "a//b",
            "a/./b",
        ] {
            assert!(scoped(dir.path(), path).is_err(), "{path}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        assert!(write(dir.path(), "link/outside.md", b"no", None, true).is_err());
        assert!(!outside.path().join("outside.md").exists());
    }
}
