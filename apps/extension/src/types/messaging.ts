/// <reference types="chrome" />

export type SendResponse = (response?: any) => void;

export type SWMessage = {
  type: string;
  [k: string]: any;
};

export type MessageEnvelope<T extends SWMessage = SWMessage> = {
  received: T;
  sender?: chrome.runtime.MessageSender;
};

/** Assinatura padrão de handlers de mensagens (sync/async) */
export type Handler<TIn extends SWMessage = SWMessage, TOut = any> =
  (ctx: MessageEnvelope<TIn>) => Promise<TOut> | TOut;

export type CSReceivedMessage = {
  ok: boolean;
  extensionId: string;
  type: string;
  [k: string]: any;
};
