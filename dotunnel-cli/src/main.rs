use std::fmt::Debug;

use anyhow::Result;
use clap::Parser;
use clap_verbosity_flag::Verbosity;

mod command;
mod config;
mod message_capnp {
    include!(concat!(env!("OUT_DIR"), "/message_capnp.rs"));
}
mod sys;

#[derive(Debug, clap::Parser)]
#[command(name = "dotunnel", version)]
#[command(about = "Expose your local servers to the public internet easily and reliably.", long_about = None)]
pub struct Cli {
    #[clap(flatten)]
    verbose: clap_verbosity_flag::Verbosity,

    /// Profile to use for authentication and configuration
    #[arg(long, default_value = "default", global = true)]
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

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    init_logger_env(&cli.verbose);

    match &cli.command {
        command::Command::Login(args) => {
            command::login::execute(args, &cli.profile).await?;
        }
        command::Command::Logout(args) => {
            command::logout::execute(args, &cli.profile).await?;
        }
        command::Command::Status(args) => {
            command::status::execute(args, &cli.profile).await?;
        }
        command::Command::Setup(args) => {
            command::setup::execute(args)?;
        }
        command::Command::Tunnel(args) => {
            command::tunnel::execute(args, &cli.profile).await?;
        }
    }

    Ok(())
}
