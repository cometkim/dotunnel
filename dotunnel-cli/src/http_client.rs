use ureq::tls::{TlsConfig, TlsProvider};
use ureq::Agent;

/// Create an HTTP agent configured with native-tls.
pub fn agent() -> Agent {
    Agent::config_builder()
        .tls_config(
            TlsConfig::builder()
                .provider(TlsProvider::NativeTls)
                .build(),
        )
        .build()
        .new_agent()
}
