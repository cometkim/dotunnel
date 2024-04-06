extern crate dirs_sys;

use std::env;
use std::path::PathBuf;

pub fn home_dir() -> Option<PathBuf> {
    dirs_sys::home_dir()
}

pub fn config_dir() -> Option<PathBuf> {
    env::var_os("XDG_CONFIG_HOME")
        .and_then(dirs_sys::is_absolute_path)
        .or_else(|| home_dir().map(|h| h.join(".config")))
}
