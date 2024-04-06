#[cfg(target_os = "windows")]
pub(crate) mod dirs_win;

#[cfg(target_os = "windows")]
pub(crate) use dirs_win as dirs;

#[cfg(not(target_os = "windows"))]
pub(crate) mod dirs_unix;

#[cfg(not(target_os = "windows"))]
pub(crate) use dirs_unix as dirs;
