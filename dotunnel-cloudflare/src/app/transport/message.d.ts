import * as $ from "capnp-es";
export declare const _capnpFileId = 12095592013208363096n;
export declare const Envelope_Which: {
  readonly HTTP: 0;
  readonly WS: 1;
  readonly CONTROL: 2;
};
export type Envelope_Which = (typeof Envelope_Which)[keyof typeof Envelope_Which];
export declare class Envelope extends $.Struct {
  static readonly HTTP: 0;
  static readonly WS: 1;
  static readonly CONTROL: 2;
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get connectionId(): bigint;
  set connectionId(value: bigint);
  get streamId(): number;
  set streamId(value: number);
  get msgSeq(): number;
  set msgSeq(value: number);
  _adoptHttp(value: $.Orphan<HttpMessage>): void;
  _disownHttp(): $.Orphan<HttpMessage>;
  get http(): HttpMessage;
  _hasHttp(): boolean;
  _initHttp(): HttpMessage;
  get _isHttp(): boolean;
  set http(value: HttpMessage);
  _adoptWs(value: $.Orphan<WebSocketFrame>): void;
  _disownWs(): $.Orphan<WebSocketFrame>;
  get ws(): WebSocketFrame;
  _hasWs(): boolean;
  _initWs(): WebSocketFrame;
  get _isWs(): boolean;
  set ws(value: WebSocketFrame);
  _adoptControl(value: $.Orphan<Control>): void;
  _disownControl(): $.Orphan<Control>;
  get control(): Control;
  _hasControl(): boolean;
  _initControl(): Control;
  get _isControl(): boolean;
  set control(value: Control);
  toString(): string;
  which(): Envelope_Which;
}
export declare const HttpMessage_Which: {
  readonly REQUEST_INIT: 0;
  readonly REQUEST_BODY_CHUNK: 1;
  readonly REQUEST_TRAILERS: 2;
  readonly REQUEST_END: 3;
  readonly REQUEST_ABORT: 4;
  readonly RESPONSE_INIT: 5;
  /**
* 103 Early Hints
*
*/
  readonly RESPONSE_INTERIM: 6;
  readonly RESPONSE_BODY_CHUNK: 7;
  readonly RESPONSE_TRAILERS: 8;
  readonly RESPONSE_END: 9;
  readonly RESPONSE_ABORT: 10;
};
export type HttpMessage_Which = (typeof HttpMessage_Which)[keyof typeof HttpMessage_Which];
export declare class HttpMessage extends $.Struct {
  static readonly REQUEST_INIT: 0;
  static readonly REQUEST_BODY_CHUNK: 1;
  static readonly REQUEST_TRAILERS: 2;
  static readonly REQUEST_END: 3;
  static readonly REQUEST_ABORT: 4;
  static readonly RESPONSE_INIT: 5;
  static readonly RESPONSE_INTERIM: 6;
  static readonly RESPONSE_BODY_CHUNK: 7;
  static readonly RESPONSE_TRAILERS: 8;
  static readonly RESPONSE_END: 9;
  static readonly RESPONSE_ABORT: 10;
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  _adoptRequestInit(value: $.Orphan<HttpRequestInit>): void;
  _disownRequestInit(): $.Orphan<HttpRequestInit>;
  get requestInit(): HttpRequestInit;
  _hasRequestInit(): boolean;
  _initRequestInit(): HttpRequestInit;
  get _isRequestInit(): boolean;
  set requestInit(value: HttpRequestInit);
  _adoptRequestBodyChunk(value: $.Orphan<HttpBodyChunk>): void;
  _disownRequestBodyChunk(): $.Orphan<HttpBodyChunk>;
  get requestBodyChunk(): HttpBodyChunk;
  _hasRequestBodyChunk(): boolean;
  _initRequestBodyChunk(): HttpBodyChunk;
  get _isRequestBodyChunk(): boolean;
  set requestBodyChunk(value: HttpBodyChunk);
  _adoptRequestTrailers(value: $.Orphan<HttpTrailers>): void;
  _disownRequestTrailers(): $.Orphan<HttpTrailers>;
  get requestTrailers(): HttpTrailers;
  _hasRequestTrailers(): boolean;
  _initRequestTrailers(): HttpTrailers;
  get _isRequestTrailers(): boolean;
  set requestTrailers(value: HttpTrailers);
  _adoptRequestEnd(value: $.Orphan<HttpRequestEnd>): void;
  _disownRequestEnd(): $.Orphan<HttpRequestEnd>;
  get requestEnd(): HttpRequestEnd;
  _hasRequestEnd(): boolean;
  _initRequestEnd(): HttpRequestEnd;
  get _isRequestEnd(): boolean;
  set requestEnd(value: HttpRequestEnd);
  _adoptRequestAbort(value: $.Orphan<HttpRequestAbort>): void;
  _disownRequestAbort(): $.Orphan<HttpRequestAbort>;
  get requestAbort(): HttpRequestAbort;
  _hasRequestAbort(): boolean;
  _initRequestAbort(): HttpRequestAbort;
  get _isRequestAbort(): boolean;
  set requestAbort(value: HttpRequestAbort);
  _adoptResponseInit(value: $.Orphan<HttpResponseInit>): void;
  _disownResponseInit(): $.Orphan<HttpResponseInit>;
  get responseInit(): HttpResponseInit;
  _hasResponseInit(): boolean;
  _initResponseInit(): HttpResponseInit;
  get _isResponseInit(): boolean;
  set responseInit(value: HttpResponseInit);
  _adoptResponseInterim(value: $.Orphan<HttpInterimResponse>): void;
  _disownResponseInterim(): $.Orphan<HttpInterimResponse>;
  /**
* 103 Early Hints
*
*/
  get responseInterim(): HttpInterimResponse;
  _hasResponseInterim(): boolean;
  _initResponseInterim(): HttpInterimResponse;
  get _isResponseInterim(): boolean;
  set responseInterim(value: HttpInterimResponse);
  _adoptResponseBodyChunk(value: $.Orphan<HttpBodyChunk>): void;
  _disownResponseBodyChunk(): $.Orphan<HttpBodyChunk>;
  get responseBodyChunk(): HttpBodyChunk;
  _hasResponseBodyChunk(): boolean;
  _initResponseBodyChunk(): HttpBodyChunk;
  get _isResponseBodyChunk(): boolean;
  set responseBodyChunk(value: HttpBodyChunk);
  _adoptResponseTrailers(value: $.Orphan<HttpTrailers>): void;
  _disownResponseTrailers(): $.Orphan<HttpTrailers>;
  get responseTrailers(): HttpTrailers;
  _hasResponseTrailers(): boolean;
  _initResponseTrailers(): HttpTrailers;
  get _isResponseTrailers(): boolean;
  set responseTrailers(value: HttpTrailers);
  _adoptResponseEnd(value: $.Orphan<HttpResponseEnd>): void;
  _disownResponseEnd(): $.Orphan<HttpResponseEnd>;
  get responseEnd(): HttpResponseEnd;
  _hasResponseEnd(): boolean;
  _initResponseEnd(): HttpResponseEnd;
  get _isResponseEnd(): boolean;
  set responseEnd(value: HttpResponseEnd);
  _adoptResponseAbort(value: $.Orphan<HttpResponseAbort>): void;
  _disownResponseAbort(): $.Orphan<HttpResponseAbort>;
  get responseAbort(): HttpResponseAbort;
  _hasResponseAbort(): boolean;
  _initResponseAbort(): HttpResponseAbort;
  get _isResponseAbort(): boolean;
  set responseAbort(value: HttpResponseAbort);
  toString(): string;
  which(): HttpMessage_Which;
}
export declare class HttpRequestInit extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  static _Headers: $.ListCtor<Header>;
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get method(): string;
  set method(value: string);
  get uri(): string;
  set uri(value: string);
  get version(): HttpVersion;
  set version(value: HttpVersion);
  _adoptHeaders(value: $.Orphan<$.List<Header>>): void;
  _disownHeaders(): $.Orphan<$.List<Header>>;
  get headers(): $.List<Header>;
  _hasHeaders(): boolean;
  _initHeaders(length: number): $.List<Header>;
  set headers(value: $.List<Header>);
  get hasBody(): boolean;
  set hasBody(value: boolean);
  toString(): string;
}
export declare class HttpRequestEnd extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  toString(): string;
}
export declare class HttpRequestAbort extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get reason(): AbortReason;
  set reason(value: AbortReason);
  get detail(): string;
  set detail(value: string);
  toString(): string;
}
export declare class HttpResponseInit extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  static _Headers: $.ListCtor<Header>;
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  /**
* 200, 404, ...
*
*/
  get status(): number;
  set status(value: number);
  _adoptHeaders(value: $.Orphan<$.List<Header>>): void;
  _disownHeaders(): $.Orphan<$.List<Header>>;
  get headers(): $.List<Header>;
  _hasHeaders(): boolean;
  _initHeaders(length: number): $.List<Header>;
  set headers(value: $.List<Header>);
  get hasBody(): boolean;
  set hasBody(value: boolean);
  /**
* 0=unknown
*
*/
  get contentLength(): bigint;
  set contentLength(value: bigint);
  toString(): string;
}
export declare class HttpInterimResponse extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  static _Headers: $.ListCtor<Header>;
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  /**
* 100-199
*
*/
  get status(): number;
  set status(value: number);
  _adoptHeaders(value: $.Orphan<$.List<Header>>): void;
  _disownHeaders(): $.Orphan<$.List<Header>>;
  get headers(): $.List<Header>;
  _hasHeaders(): boolean;
  _initHeaders(length: number): $.List<Header>;
  set headers(value: $.List<Header>);
  toString(): string;
}
export declare class HttpBodyChunk extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  _adoptData(value: $.Orphan<$.Data>): void;
  _disownData(): $.Orphan<$.Data>;
  get data(): $.Data;
  _hasData(): boolean;
  _initData(length: number): $.Data;
  set data(value: $.Data);
  get seq(): number;
  set seq(value: number);
  get isLast(): boolean;
  set isLast(value: boolean);
  toString(): string;
}
export declare class HttpTrailers extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  static _Headers: $.ListCtor<Header>;
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  _adoptHeaders(value: $.Orphan<$.List<Header>>): void;
  _disownHeaders(): $.Orphan<$.List<Header>>;
  get headers(): $.List<Header>;
  _hasHeaders(): boolean;
  _initHeaders(length: number): $.List<Header>;
  set headers(value: $.List<Header>);
  toString(): string;
}
export declare class HttpResponseEnd extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  toString(): string;
}
export declare class HttpResponseAbort extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get reason(): AbortReason;
  set reason(value: AbortReason);
  get detail(): string;
  set detail(value: string);
  toString(): string;
}
export declare const HttpVersion: {
  /**
* HTTP/1.1
*
*/
  readonly H1: 0;
  /**
* HTTP/2
* h3 is not supported;
*
*/
  readonly H2: 1;
};
export type HttpVersion = (typeof HttpVersion)[keyof typeof HttpVersion];
export declare const AbortReason: {
  readonly UNKNOWN: 0;
  readonly TIMEOUT: 1;
  readonly PEER_CLOSED: 2;
  readonly RESET_BY_PEER: 3;
  readonly CONNECTION_LOST: 4;
  readonly CANCELLED: 5;
  readonly PROTOCOL_ERROR: 6;
  readonly FLOW_CONTROL: 7;
  readonly OVERLOAD: 8;
};
export type AbortReason = (typeof AbortReason)[keyof typeof AbortReason];
export declare class Header extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get name(): string;
  set name(value: string);
  _adoptValue(value: $.Orphan<$.Data>): void;
  _disownValue(): $.Orphan<$.Data>;
  get value(): $.Data;
  _hasValue(): boolean;
  _initValue(length: number): $.Data;
  set value(value: $.Data);
  toString(): string;
}
export declare const WebSocketOpcode: {
  readonly CONTINUATION: 0;
  readonly TEXT: 1;
  readonly BINARY: 2;
  readonly CLOSE: 3;
  readonly PING: 4;
  readonly PONG: 5;
};
export type WebSocketOpcode = (typeof WebSocketOpcode)[keyof typeof WebSocketOpcode];
export declare class WebSocketFrame extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get fin(): boolean;
  set fin(value: boolean);
  get rsv1(): boolean;
  set rsv1(value: boolean);
  get rsv2(): boolean;
  set rsv2(value: boolean);
  get rsv3(): boolean;
  set rsv3(value: boolean);
  get opcode(): WebSocketOpcode;
  set opcode(value: WebSocketOpcode);
  get masked(): boolean;
  set masked(value: boolean);
  get maskKey(): number;
  set maskKey(value: number);
  _adoptPayload(value: $.Orphan<$.Data>): void;
  _disownPayload(): $.Orphan<$.Data>;
  get payload(): $.Data;
  _hasPayload(): boolean;
  _initPayload(length: number): $.Data;
  set payload(value: $.Data);
  get closeCode(): number;
  set closeCode(value: number);
  toString(): string;
}
export declare const Control_Which: {
  readonly PING: 0;
  readonly PONG: 1;
  readonly FLOW_WINDOW_UPDATE: 2;
  readonly ERROR: 3;
  readonly GO_AWAY: 4;
};
export type Control_Which = (typeof Control_Which)[keyof typeof Control_Which];
export declare class Control extends $.Struct {
  static readonly PING: 0;
  static readonly PONG: 1;
  static readonly FLOW_WINDOW_UPDATE: 2;
  static readonly ERROR: 3;
  static readonly GO_AWAY: 4;
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  _adoptPing(value: $.Orphan<Ping>): void;
  _disownPing(): $.Orphan<Ping>;
  get ping(): Ping;
  _hasPing(): boolean;
  _initPing(): Ping;
  get _isPing(): boolean;
  set ping(value: Ping);
  _adoptPong(value: $.Orphan<Pong>): void;
  _disownPong(): $.Orphan<Pong>;
  get pong(): Pong;
  _hasPong(): boolean;
  _initPong(): Pong;
  get _isPong(): boolean;
  set pong(value: Pong);
  _adoptFlowWindowUpdate(value: $.Orphan<FlowWindowUpdate>): void;
  _disownFlowWindowUpdate(): $.Orphan<FlowWindowUpdate>;
  get flowWindowUpdate(): FlowWindowUpdate;
  _hasFlowWindowUpdate(): boolean;
  _initFlowWindowUpdate(): FlowWindowUpdate;
  get _isFlowWindowUpdate(): boolean;
  set flowWindowUpdate(value: FlowWindowUpdate);
  _adoptError(value: $.Orphan<ErrorReport>): void;
  _disownError(): $.Orphan<ErrorReport>;
  get error(): ErrorReport;
  _hasError(): boolean;
  _initError(): ErrorReport;
  get _isError(): boolean;
  set error(value: ErrorReport);
  _adoptGoAway(value: $.Orphan<GoAway>): void;
  _disownGoAway(): $.Orphan<GoAway>;
  get goAway(): GoAway;
  _hasGoAway(): boolean;
  _initGoAway(): GoAway;
  get _isGoAway(): boolean;
  set goAway(value: GoAway);
  toString(): string;
  which(): Control_Which;
}
export declare class Ping extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  _adoptData(value: $.Orphan<$.Data>): void;
  _disownData(): $.Orphan<$.Data>;
  get data(): $.Data;
  _hasData(): boolean;
  _initData(length: number): $.Data;
  set data(value: $.Data);
  toString(): string;
}
export declare class Pong extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  _adoptData(value: $.Orphan<$.Data>): void;
  _disownData(): $.Orphan<$.Data>;
  get data(): $.Data;
  _hasData(): boolean;
  _initData(length: number): $.Data;
  set data(value: $.Data);
  toString(): string;
}
export declare class FlowWindowUpdate extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get availableSendBytes(): number;
  set availableSendBytes(value: number);
  toString(): string;
}
export declare class ErrorReport extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get code(): number;
  set code(value: number);
  get message(): string;
  set message(value: string);
  toString(): string;
}
export declare class GoAway extends $.Struct {
  static readonly _capnp: {
    displayName: string;
    id: string;
    size: $.ObjectSize;
  };
  get timestampMs(): bigint;
  set timestampMs(value: bigint);
  get lastMsgSeq(): number;
  set lastMsgSeq(value: number);
  get reason(): string;
  set reason(value: string);
  toString(): string;
}
