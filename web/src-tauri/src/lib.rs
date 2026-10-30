#[cfg(feature = "desktop")]
mod desktop;
pub mod files;
#[cfg(feature = "desktop")]
pub fn run() {
    desktop::run()
}
