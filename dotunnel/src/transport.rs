//! Transport layer for DOtunnel.
//!
//! The wire schema lives in [`message`]; this module provides the rkyv codec
//! entry points shared by every peer.

pub mod message;

use rkyv::rancor;
use rkyv::util::AlignedVec;

use message::Envelope;

impl Envelope {
    /// Serialize into rkyv wire bytes.
    pub fn encode(&self) -> Result<Vec<u8>, rancor::Error> {
        rkyv::to_bytes::<rancor::Error>(self).map(AlignedVec::into_vec)
    }

    /// Deserialize from wire bytes, with validation.
    ///
    /// WebSocket payloads arrive with arbitrary alignment, so the input is
    /// copied into an aligned buffer before access.
    pub fn decode(data: &[u8]) -> Result<Self, rancor::Error> {
        let mut aligned: AlignedVec = AlignedVec::with_capacity(data.len());
        aligned.extend_from_slice(data);
        rkyv::from_bytes::<Self, rancor::Error>(&aligned)
    }
}

#[cfg(test)]
mod tests {
    use bytes::Bytes;

    use super::message::*;

    #[test]
    fn roundtrip_request_init() {
        let envelope = Envelope {
            timestamp_ms: 1721780000000,
            connection_id: 42,
            stream_id: 7,
            msg_seq: 1,
            payload: Payload::Http(HttpMessage::RequestInit(HttpRequestInit {
                timestamp_ms: 1721780000000,
                method: "POST".to_string(),
                uri: "/api/echo?x=1".to_string(),
                version: HttpVersion::H1,
                headers: vec![Header {
                    name: "content-type".to_string(),
                    value: Bytes::from_static(b"application/json"),
                }],
                has_body: true,
            })),
        };

        let bytes = envelope.encode().unwrap();
        let decoded = Envelope::decode(&bytes).unwrap();

        assert_eq!(decoded.connection_id, 42);
        assert_eq!(decoded.stream_id, 7);
        let Payload::Http(HttpMessage::RequestInit(init)) = decoded.payload else {
            panic!("unexpected payload");
        };
        assert_eq!(init.method, "POST");
        assert_eq!(init.version, HttpVersion::H1);
        assert_eq!(init.headers[0].value, Bytes::from_static(b"application/json"));
    }

    #[test]
    fn roundtrip_ws_close_frame() {
        let envelope = Envelope {
            timestamp_ms: 1,
            connection_id: 2,
            stream_id: 3,
            msg_seq: 4,
            payload: Payload::Ws(WebSocketFrame {
                timestamp_ms: 1,
                fin: true,
                rsv1: false,
                rsv2: false,
                rsv3: false,
                opcode: WebSocketOpcode::Close,
                masked: false,
                mask_key: 0,
                payload: Bytes::new(),
                close_code: Some(1001),
            }),
        };

        let bytes = envelope.encode().unwrap();
        let decoded = Envelope::decode(&bytes).unwrap();

        let Payload::Ws(frame) = decoded.payload else {
            panic!("unexpected payload");
        };
        assert_eq!(frame.opcode, WebSocketOpcode::Close);
        assert_eq!(frame.close_code, Some(1001));
    }

    #[test]
    fn decode_rejects_garbage() {
        assert!(Envelope::decode(&[0xde, 0xad, 0xbe, 0xef]).is_err());
    }
}
