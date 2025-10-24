@0xa7dc2cd9cf562058;

struct Envelope {
  timestampMs  @0 :UInt64;
  connectionId @1 :UInt64;
  streamId     @2 :UInt32;
  msgSeq       @3 :UInt32;

  union {
    http    @4 :HttpMessage;
    ws      @5 :WebSocketFrame;
    control @6 :Control;
  }
}

struct HttpMessage {
  union {
    requestInit            @0  :HttpRequestInit;
    requestBodyChunk       @1  :HttpBodyChunk;
    requestTrailers        @2  :HttpTrailers;
    requestEnd             @3  :HttpRequestEnd;
    requestAbort           @4  :HttpRequestAbort;

    responseInit           @5  :HttpResponseInit;
    responseInterim        @6  :HttpInterimResponse; # 103 Early Hints
    responseBodyChunk      @7  :HttpBodyChunk;
    responseTrailers       @8  :HttpTrailers;
    responseEnd            @9  :HttpResponseEnd;
    responseAbort          @10 :HttpResponseAbort;
  }
}

struct HttpRequestInit {
  timestampMs @0 :UInt64;
  method      @1 :Text;
  uri         @2 :Text;
  version     @3 :HttpVersion;
  headers     @4 :List(Header);
  hasBody     @5 :Bool;
}

struct HttpRequestEnd {
  timestampMs @0 :UInt64;
}

struct HttpRequestAbort {
  timestampMs @0 :UInt64;
  reason      @1 :AbortReason;
  detail      @2 :Text;
}

struct HttpResponseInit {
  timestampMs @0 :UInt64;
  status      @1 :UInt16;    # 200, 404, ...
  headers     @2 :List(Header);
  hasBody     @3 :Bool;
  contentLength @4 :UInt64;  # 0=unknown
}

# e.g. 100 Continue, 103 Early Hints
struct HttpInterimResponse {
  timestampMs @0 :UInt64;
  status      @1 :UInt16;    # 100-199
  headers     @2 :List(Header);
}

struct HttpBodyChunk {
  timestampMs @0 :UInt64;
  data        @1 :Data;
  seq         @2 :UInt32;
  isLast      @3 :Bool;
}

struct HttpTrailers {
  timestampMs @0 :UInt64;
  headers     @1 :List(Header);
}

struct HttpResponseEnd {
  timestampMs @0 :UInt64;
}

struct HttpResponseAbort {
  timestampMs @0 :UInt64;
  reason      @1 :AbortReason;
  detail      @2 :Text;
}

enum HttpVersion {
  h1 @0; # HTTP/1.1
  h2 @1; # HTTP/2
  # h3 is not supported;
}

enum AbortReason {
  unknown        @0;
  timeout        @1;
  peerClosed     @2;
  resetByPeer    @3;
  connectionLost @4;
  cancelled      @5;
  protocolError  @6;
  flowControl    @7;
  overload       @8;
}

struct Header {
  name  @0 :Text;
  value @1 :Data;
}

enum WebSocketOpcode {
  continuation @0;
  text         @1;
  binary       @2;
  close        @3;
  ping         @4;
  pong         @5;
}

struct WebSocketFrame {
  timestampMs  @0 :UInt64;
  fin          @1 :Bool;
  rsv1         @2 :Bool;
  rsv2         @3 :Bool;
  rsv3         @4 :Bool;
  opcode       @5 :WebSocketOpcode;
  masked       @6 :Bool;
  maskKey      @7 :UInt32;

  payload      @8 :Data;

  # only for close frame
  closeCode    @9  :UInt16;
}

struct Control {
  union {
    ping             @0 :Ping;
    pong             @1 :Pong;
    flowWindowUpdate @2 :FlowWindowUpdate;
    error            @3 :ErrorReport;
    goAway           @4 :GoAway;
  }
}

struct Ping {
  timestampMs @0 :UInt64;
  data        @1 :Data;
}

struct Pong {
  timestampMs @0 :UInt64;
  data        @1 :Data;
}

struct FlowWindowUpdate {
  timestampMs        @0 :UInt64;
  availableSendBytes @1 :UInt32;
}

struct ErrorReport {
  timestampMs @0 :UInt64;
  code        @1 :UInt32;
  message     @2 :Text;
}

struct GoAway {
  timestampMs @0 :UInt64;
  lastMsgSeq  @1 :UInt32;
  reason      @2 :Text;
}
