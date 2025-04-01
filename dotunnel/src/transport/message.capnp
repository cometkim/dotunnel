@0xa7dc2cd9cf562058;

struct Message {
  union {
    requestInit @0 :RequestInit;
    requestBodyChunk @1 :RequestBodyChunk;
    requestBodyEnd @2 :RequestBodyEnd;
    requestAbort @3 :RequestAbort;

    responseInit @4 :ResponseInit;
    responseEarlyHints @5 :ResponseEarlyHints;
    responseBodyChunk @6 :ResponseBodyChunk;
    responseEnd @7 :ResponseEnd;
    responseAbort @8 :ResponseAbort;
  }
}

struct RequestInit {
  time @0 :UInt32;
  method @1 :Text;
  uri @2 :Text;
  # HTTP version: 1 = HTTP/1.1, 2 = HTTP/2 (HTTP/3 is not supported)
  version @3 :UInt8;
  headers @4 :List(Header);
  hasBody @5 :Bool;
}

struct RequestBodyChunk {
  bytes @0 :Data;
}

struct RequestBodyEnd {
  time @0 :UInt32;
}

struct RequestAbort {
  time @0 :UInt32;
}

struct ResponseInit {
  time @0 :UInt32;
  status @1 :UInt16;
  headers @2 :List(Header);
  hasBody @3 :Bool;
}

struct ResponseEarlyHints {
  time @0 :UInt32;
  # Status code in the 100~199 range (e.g., 103 Early Hints)
  status @1 :UInt8;
  headers @2 :List(Header);
}

struct ResponseBodyChunk {
  bytes @0 :Data;
}

struct ResponseEnd {
  time @0 :UInt32;
}

struct ResponseAbort {
  time @0 :UInt32;
}

struct Header {
  key @0 :Text;
  value @1 :Text;
}
