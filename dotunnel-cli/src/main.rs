use std::fmt::Debug;

use anyhow::Result;
use clap::Parser;
use clap_verbosity_flag::Verbosity;

mod command;
mod config;
mod sys;

#[derive(Debug, clap::Parser)]
#[command(name = "dotunnel", version)]
#[command(about = "Expose your local servers to the public internet easily and reliably.", long_about = None)]
pub struct Cli {
    #[clap(flatten)]
    verbose: clap_verbosity_flag::Verbosity,

    #[arg(long, default_value = "default")]
    profile: String,

    #[command(subcommand)]
    command: command::Command,
}

fn init_logger_env(verbosity: &Verbosity) {
    use tracing::level_filters::LevelFilter;

    let env_filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(LevelFilter::ERROR.into())
        .with_env_var("DOTUNNEL_LOG")
        .from_env_lossy();

    tracing_subscriber::FmtSubscriber::builder()
        .with_env_filter(match (verbosity.is_present(), verbosity.is_silent()) {
            (false, _) => env_filter,
            (true, true) => env_filter.add_directive(LevelFilter::OFF.into()),
            (true, false) => {
                let level_filter = match verbosity.log_level_filter() {
                    clap_verbosity_flag::LevelFilter::Off => LevelFilter::OFF,
                    clap_verbosity_flag::LevelFilter::Error => LevelFilter::ERROR,
                    clap_verbosity_flag::LevelFilter::Warn => LevelFilter::WARN,
                    clap_verbosity_flag::LevelFilter::Info => LevelFilter::INFO,
                    clap_verbosity_flag::LevelFilter::Debug => LevelFilter::DEBUG,
                    clap_verbosity_flag::LevelFilter::Trace => LevelFilter::TRACE,
                };
                env_filter.add_directive(level_filter.into())
            }
        })
        .init();
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    init_logger_env(&cli.verbose);

    tracing::info!("info log");
    tracing::trace!("trace log");

    println!("{cli:?}");

    Ok(())
}
