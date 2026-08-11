use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
use ureq::Agent;

/// Create an HTTP agent configured with native-tls.
///
/// Roots come from the platform rather than ureq's default bundled Mozilla set
/// (`RootCerts::WebPki`). A relay is self-hosted, so its certificate is often
/// issued by a CA that only the operator's machines trust — an internal
/// corporate CA, or a locally generated one for development. Validating against
/// a fixed bundle rejects all of those no matter what the OS has been told to
/// trust, and it is also what the WebSocket leg already does, since tungstenite
/// builds a native-tls connector with default verification.
///
/// The tradeoff is that the CLI now honours anything the OS trusts, including
/// an intercepting proxy's root.
pub fn agent() -> Agent {
    Agent::config_builder()
        .tls_config(
            TlsConfig::builder()
                .provider(TlsProvider::NativeTls)
                .root_certs(RootCerts::PlatformVerifier)
                .build(),
        )
        .build()
        .new_agent()
}
