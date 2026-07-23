# DOtunnel core library

DOtunnel uses [rkyv] for serialization. The wire schema is defined once as Rust types in `src/transport/message.rs`, and `build.rs` generates the matching TypeScript codecs with [rkyv-js] into `js/`. This directory doubles as the `dotunnel` npm package (a yarn workspace) exporting those codecs, consumed by `dotunnel-cloudflare` via `workspace:^`.

[rkyv]: https://rkyv.org/
[rkyv-js]: https://github.com/cometkim/rkyv-js
